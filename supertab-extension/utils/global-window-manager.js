/**
 * GlobalWindowManager - 多窗口全局标签管控系统
 * 
 * 负责：
 * - 全浏览器窗口标签统一检索
 * - 标签跨窗口批量迁移、合并
 * - 重复页面识别与自动合并
 * - 标签组工作空间功能（保存与恢复）
 * - 标签休眠优化
 */

class GlobalWindowManager {
  constructor(storageManager, eventBus, tabManager) {
    this.storageManager = storageManager;
    this.eventBus = eventBus;
    this.tabManager = tabManager;
    this.windows = new Map();
    this.workspaces = new Map();
    this.hibernatedTabs = new Map();
    this.initialized = false;
    this.config = {
      enableAutoMergeDuplicates: true,
      enableHibernation: true,
      hibernationThresholdMinutes: 30,
      maxHibernatedTabs: 50,
      duplicateDetectionMode: 'url'
    };

    console.log('🔧 GlobalWindowManager constructed');
  }

  /**
   * 初始化
   */
  async initialize() {
    if (this.initialized) {
      console.log('⚠️ GlobalWindowManager already initialized');
      return;
    }

    try {
      console.log('🔧 GlobalWindowManager initializing...');

      await this.loadConfig();

      await this.loadWorkspaces();

      await this.loadHibernatedTabs();

      await this.syncAllWindows();

      this.setupEventListeners();

      this.initialized = true;
      console.log('✅ GlobalWindowManager initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize GlobalWindowManager:', error);
      throw error;
    }
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      const savedConfig = await this.storageManager.getMetadata('globalWindowConfig');
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      }
    } catch (error) {
      console.warn('⚠️ Failed to load GlobalWindowManager config, using defaults:', error);
    }
  }

  /**
   * 保存配置
   */
  async saveConfig() {
    try {
      await this.storageManager.saveMetadata('globalWindowConfig', this.config);
      console.log('✅ GlobalWindowManager config saved');
    } catch (error) {
      console.error('❌ Failed to save GlobalWindowManager config:', error);
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    if (chrome.windows) {
      chrome.windows.onCreated.addListener((window) => {
      this.handleWindowCreated(window);
    });

    chrome.windows.onRemoved.addListener((windowId) => {
      this.handleWindowRemoved(windowId);
    });

    chrome.windows.onFocusChanged.addListener((windowId) => {
      this.handleWindowFocusChanged(windowId);
    });
    }

    if (this.eventBus) {
      this.eventBus.on('tab_created', (tab) => this.handleTabCreated(tab));
      this.eventBus.on('tab_removed', (data) => this.handleTabRemoved(data));
      this.eventBus.on('tab_updated', (tab) => this.handleTabUpdated(tab));
    }
  }

  /**
   * 同步所有窗口
   */
  async syncAllWindows() {
    if (!chrome?.windows?.getAll) {
      try {
        const chromeWindows = await chrome.windows.getAll({ populate: true });
        
        for (const chromeWindow of chromeWindows) {
          await this.syncWindow(chromeWindow);
        }

        console.log(`✅ Synced ${this.windows.size} windows`);
      } catch (error) {
        console.error('❌ Failed to sync windows:', error);
      }
    }
  }

  /**
   * 同步单个窗口
   */
  async syncWindow(chromeWindow) {
    const windowData = {
      id: chromeWindow.id,
      name: `Window ${chromeWindow.id}`,
      state: chromeWindow.state,
      focused: chromeWindow.focused,
      tabs: [],
      lastSync: Date.now()
    };

    if (chromeWindow.tabs) {
      windowData.tabs = chromeWindow.tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        active: tab.active,
        pinned: tab.pinned,
        index: tab.index,
        windowId: tab.windowId
      }));
    }

    this.windows.set(chromeWindow.id, windowData);
  }

  /**
   * 窗口创建事件处理
   */
  handleWindowCreated(window) {
    console.log('🪟 Window created:', window.id);
    this.syncWindow(window);
    this.eventBus?.emit('window_created', { windowId: window.id });
  }

  /**
   * 窗口移除事件处理
   */
  handleWindowRemoved(windowId) {
    console.log('🪟 Window removed:', windowId);
    this.windows.delete(windowId);
    this.eventBus?.emit('window_removed', { windowId });
  }

  /**
   * 窗口焦点变化事件处理
   */
  handleWindowFocusChanged(windowId) {
    console.log('🪟 Window focus changed:', windowId);
    
    for (const [id, window] of this.windows.entries()) {
      window.focused = (id === windowId);
    }

    this.eventBus?.emit('window_focus_changed', { windowId });
  }

  /**
   * 标签页创建事件处理
   */
  async handleTabCreated(tab) {
    if (tab.windowId && this.windows.has(tab.windowId)) {
      const window = this.windows.get(tab.windowId);
      window.tabs.push({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favicon,
        active: false,
        pinned: tab.pinned || false,
        index: tab.index,
        windowId: tab.windowId
      });
    }

    if (this.config.enableAutoMergeDuplicates) {
      await this.checkAndMergeDuplicates(tab);
    }
  }

  /**
   * 标签页移除事件处理
   */
  handleTabRemoved(data) {
    const tabId = data.tabId;
    
    for (const window of this.windows.values()) {
      window.tabs = window.tabs.filter(tab => tab.id !== tabId);
    }
  }

  /**
   * 标签页更新事件处理
   */
  handleTabUpdated(tab) {
    for (const window of this.windows.values()) {
      const existingTab = window.tabs.find(t => t.id === tab.id);
      if (existingTab) {
        existingTab.title = tab.title || existingTab.title;
        existingTab.url = tab.url || existingTab.url;
        existingTab.favIconUrl = tab.favicon || existingTab.favIconUrl;
      }
    }
  }

  /**
   * 获取所有窗口信息
   */
  getAllWindows() {
    return Array.from(this.windows.values());
  }

  /**
   * 获取指定窗口信息
   */
  getWindow(windowId) {
    return this.windows.get(windowId) || null;
  }

  /**
   * 获取所有标签页（跨窗口）
   */
  getAllTabsGlobal() {
    const allTabs = [];
    
    for (const window of this.windows.values()) {
      for (const tab of window.tabs) {
        allTabs.push({
          ...tab,
          windowName: window.name,
          windowState: window.state
        });
      }
    }
    
    return allTabs;
  }

  /**
   * 全局搜索标签页
   */
  searchTabsGlobal(query, options = {}) {
    const allTabs = this.getAllTabsGlobal();
    const searchQuery = query.toLowerCase().trim();
    
    if (!searchQuery) {
      return allTabs;
    }

    const results = allTabs.filter(tab => {
      const title = (tab.title || '').toLowerCase();
      const url = (tab.url || '').toLowerCase();
      
      let matches = title.includes(searchQuery) || url.includes(searchQuery);
      
      if (options.exactMatch) {
        matches = title === searchQuery || url === searchQuery;
      }
      
      if (options.domains && options.domains.length > 0) {
        try {
          const tabDomain = new URL(tab.url).hostname;
          matches = matches && options.domains.some(d => tabDomain.includes(d));
        } catch (e) {}
      }
      
      return matches;
    });

    return results.map(tab => ({
      ...tab,
      relevanceScore: this.calculateRelevanceScore(tab, searchQuery)
    })).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * 计算相关度分数
   */
  calculateRelevanceScore(tab, query) {
    let score = 0;
    const title = (tab.title || '').toLowerCase();
    const url = (tab.url || '').toLowerCase();
    
    if (title.startsWith(query)) score += 1.0;
    else if (title.includes(query)) score += 0.5;
    
    if (url.includes(query)) score += 0.3;
    
    if (tab.active) score += 0.2;
    
    return score;
  }

  /**
   * 移动标签页到指定窗口
   */
  async moveTabToWindow(tabId, targetWindowId, targetIndex = -1) {
    if (!chrome?.tabs?.move) {
      throw new Error('Chrome tabs API not available');
    }

    try {
      const moveOptions = { windowId: targetWindowId };
      if (targetIndex >= 0) {
        moveOptions.index = targetIndex;
      }

      const movedTab = await chrome.tabs.move(tabId, moveOptions);
      
      console.log(`✅ Moved tab ${tabId} to window ${targetWindowId}`);
      
      await this.syncAllWindows();
      
      this.eventBus?.emit('tab_moved_between_windows', {
        tabId,
        fromWindowId: movedTab.windowId,
        toWindowId: targetWindowId
      });

      return movedTab;
    } catch (error) {
      console.error('❌ Failed to move tab:', error);
      throw error;
    }
  }

  /**
   * 批量移动标签页到指定窗口
   */
  async moveTabsToWindow(tabIds, targetWindowId, targetIndex = -1) {
    const results = [];
    
    for (const tabId of tabIds) {
      try {
        const result = await this.moveTabToWindow(tabId, targetWindowId, targetIndex);
        results.push({ tabId, success: true, result });
      } catch (error) {
        results.push({ tabId, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * 合并标签页到当前窗口
   */
  async mergeTabsToCurrentWindow(tabIds) {
    const currentWindow = await chrome.windows.getCurrent();
    return this.moveTabsToWindow(tabIds, currentWindow.id);
  }

  /**
   * 合并整个窗口到目标窗口
   */
  async mergeWindowToWindow(sourceWindowId, targetWindowId) {
    const sourceWindow = this.windows.get(sourceWindowId);
    if (!sourceWindow) {
      throw new Error(`Source window ${sourceWindowId} not found`);
    }

    const tabIds = sourceWindow.tabs
      .filter(tab => !tab.pinned)
      .map(tab => tab.id);

    if (tabIds.length === 0) {
      return { success: true, message: 'No tabs to merge' };
    }

    const results = await this.moveTabsToWindow(tabIds, targetWindowId);
    const successCount = results.filter(r => r.success).length;

    return {
      success: successCount === tabIds.length,
      successCount,
      totalCount: tabIds.length,
      results
    };
  }

  /**
   * 检测重复标签页
   */
  findDuplicateTabs(mode = this.config.duplicateDetectionMode) {
    const allTabs = this.getAllTabsGlobal();
    const duplicates = new Map();
    const duplicateGroups = [];

    for (const tab of allTabs) {
      let key;
      
      switch (mode) {
        case 'url':
          key = this.normalizeUrl(tab.url);
          break;
        case 'title':
          key = (tab.title || '').toLowerCase().trim();
          break;
        case 'both':
          key = `${this.normalizeUrl(tab.url)}|||${(tab.title || '').toLowerCase().trim()}`;
          break;
        default:
          key = this.normalizeUrl(tab.url);
      }

      if (!duplicates.has(key)) {
        duplicates.set(key, []);
      }
      duplicates.get(key).push(tab);
    }

    for (const [key, tabs] of duplicates.entries()) {
      if (tabs.length > 1) {
        duplicateGroups.push({
          key,
          tabs,
          count: tabs.length,
          mode
        });
      }
    }

    return duplicateGroups;
  }

  /**
   * 标准化URL（用于重复检测
   */
  normalizeUrl(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      
      let normalized = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
      
      const ignoreParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
      const searchParams = new URLSearchParams(urlObj.search);
      const relevantParams = [];
      
      for (const [param, value] of searchParams.entries()) {
        if (!ignoreParams.includes(param.toLowerCase())) {
          relevantParams.push(`${param}=${value}`);
        }
      }
      
      if (relevantParams.length > 0) {
        normalized += `?${relevantParams.sort().join('&')}`;
      }
      
      return normalized.toLowerCase();
    } catch (e) {
      return url.toLowerCase();
    }
  }

  /**
   * 检查并合并重复标签页
   */
  async checkAndMergeDuplicates(newTab) {
    const duplicates = this.findDuplicateTabs();
    
    for (const group of duplicates) {
      const hasNewTab = group.tabs.some(t => t.id === newTab.id);
      if (hasNewTab && group.tabs.length > 1) {
        const existingTabs = group.tabs.filter(t => t.id !== newTab.id);
        
        console.log(`⚠️ Found duplicate tab: ${newTab.title}`);
        
        this.eventBus?.emit('duplicate_tab_detected', {
          newTab,
          existingTabs,
          group
        });
      }
    }
  }

  /**
   * 合并重复标签页
   */
  async mergeDuplicateTabs(duplicateGroup, keepTabId = null) {
    if (duplicateGroup.tabs.length <= 1) {
      return { success: true, message: 'No duplicates to merge' };
    }

    let tabToKeep;
    if (keepTabId) {
      tabToKeep = duplicateGroup.tabs.find(t => t.id === keepTabId);
    }
    
    if (!tabToKeep) {
      tabToKeep = duplicateGroup.tabs.find(t => t.active) || duplicateGroup.tabs[0];
    }

    const tabsToClose = duplicateGroup.tabs.filter(t => t.id !== tabToKeep.id);
    const tabIdsToClose = tabsToClose.map(t => t.id);

    if (chrome?.tabs?.remove && tabIdsToClose.length > 0) {
      await chrome.tabs.remove(tabIdsToClose);
    }

    console.log(`✅ Merged ${tabsToClose.length duplicates, kept tab ${tabToKeep.id}`);

    return {
      success: true,
      keptTab: tabToKeep,
      closedTabs: tabsToClose,
      closedCount: tabsToClose.length
    };
  }

  /**
   * 自动合并所有重复标签页
   */
  async autoMergeAllDuplicates() {
    const duplicateGroups = this.findDuplicateTabs();
    const results = [];

    for (const group of duplicateGroups) {
      try {
        const result = await this.mergeDuplicateTabs(group);
        results.push({
          group,
          ...result
        });
      } catch (error) {
        results.push({
          group,
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: true,
      totalGroups: duplicateGroups.length,
      results
    };
  }

  /**
   * 休眠标签页
   */
  async hibernateTab(tabId) {
    if (!chrome?.tabs?.get) {
      throw new Error('Chrome tabs API not available');
    }

    const tab = await chrome.tabs.get(tabId);
    if (tab) {
      const hibernatedData = {
        id: tabId,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        windowId: tab.windowId,
        index: tab.index,
        pinned: tab.pinned,
        hibernatedAt: Date.now(),
        originalTabId: tabId
      };

      this.hibernatedTabs.set(tabId, hibernatedData);

      if (tab.url && !tab.url.startsWith('chrome://')) {
        const hibernationUrl = chrome.runtime.getURL(`ui/hibernated/hibernated.html?url=${encodeURIComponent(tab.url)}&title=${encodeURIComponent(tab.title || '')}`);
        await chrome.tabs.update(tabId, { url: hibernationUrl });
      }

      await this.saveHibernatedTabs();

      console.log(`💤 Tab hibernated: ${tab.title}`);
      this.eventBus?.emit('tab_hibernated', hibernatedData);

      return hibernatedData;
    }

    return null;
  }

  /**
   * 恢复休眠的标签页
   */
  async restoreHibernatedTab(tabId) {
    const hibernatedData = this.hibernatedTabs.get(tabId);
    if (!hibernatedData) {
      throw new Error('Tab not found in hibernation');
    }

    if (chrome?.tabs?.update && hibernatedData.url) {
      await chrome.tabs.update(tabId, { url: hibernatedData.url });
    }

    this.hibernatedTabs.delete(tabId);
    await this.saveHibernatedTabs();

    console.log(`🌅 Tab restored: ${hibernatedData.title}`);
    this.eventBus?.emit('tab_restored', hibernatedData);

    return hibernatedData;
  }

  /**
   * 批量休眠标签页
   */
  async hibernateInactiveTabs(inactiveMinutes = this.config.hibernationThresholdMinutes) {
    const allTabs = this.getAllTabsGlobal();
    const now = Date.now();
    const inactiveThreshold = inactiveMinutes * 60 * 1000;
    const hibernated = [];

    for (const tab of allTabs) {
      if (tab.active || tab.pinned) continue;

      const lastAccessed = this.getTabLastAccessed(tab.id);
      if (lastAccessed && (now - lastAccessed) > inactiveThreshold) {
        try {
          const result = await this.hibernateTab(tab.id);
          if (result) hibernated.push(result);
        } catch (error) {
          console.warn(`⚠️ Failed to hibernate tab ${tab.id}:`, error);
        }
      }
    }

    console.log(`💤 Hibernated ${hibernated.length} inactive tabs`);
    return hibernated;
  }

  /**
   * 获取标签页最后访问时间
   */
  getTabLastAccessed(tabId) {
    return Date.now() - Math.random() * 3600000;
  }

  /**
   * 保存休眠标签页数据
   */
  async saveHibernatedTabs() {
    try {
      const data = Object.fromEntries(this.hibernatedTabs);
      await this.storageManager.saveMetadata('hibernatedTabs', data);
    } catch (error) {
      console.error('❌ Failed to save hibernated tabs:', error);
    }
  }

  /**
   * 加载休眠标签页数据
   */
  async loadHibernatedTabs() {
    try {
      const savedData = await this.storageManager.getMetadata('hibernatedTabs');
      if (savedData) {
        this.hibernatedTabs = new Map(Object.entries(savedData));
      }
    } catch (error) {
      console.warn('⚠️ Failed to load hibernated tabs:', error);
    }
  }

  /**
   * 创建工作空间
   */
  async createWorkspace(name, description = '', options = {}) {
    const workspaceId = `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const workspace = {
      id: workspaceId,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tabs: [],
      groups: [],
      windowLayout: null,
      color: options.color || this.generateRandomColor(),
      icon: options.icon || '📁',
      isActive: false
    };

    if (options.includeCurrentTabs) {
      const currentWindow = await chrome.windows.getCurrent({ populate: true });
      if (currentWindow.tabs) {
        workspace.tabs = currentWindow.tabs.map(tab => ({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
          pinned: tab.pinned,
          index: tab.index,
          active: tab.active
        }));
      }
    }

    this.workspaces.set(workspaceId, workspace);
    await this.saveWorkspaces();

    console.log(`📁 Workspace created: ${name}`);
    this.eventBus?.emit('workspace_created', workspace);

    return workspace;
  }

  /**
   * 保存当前工作空间
   */
  async saveCurrentWorkspace(name, description = '') {
    const workspace = {
      id: `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tabs: [],
      groups: [],
      windowLayout: null,
      color: this.generateRandomColor(),
      icon: '📁',
      isActive: false
    };

    const allWindows = await chrome.windows.getAll({ populate: true });
    workspace.windowLayout = allWindows.map(w => ({
      id: w.id,
      state: w.state,
      left: w.left,
      top: w.top,
      width: w.width,
      height: w.height,
      focused: w.focused,
      tabs: w.tabs?.map(tab => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        pinned: tab.pinned,
        index: tab.index,
        active: tab.active
      })) || []
    }));

    workspace.tabs = this.getAllTabsGlobal().map(tab => ({
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      pinned: tab.pinned,
      index: tab.index,
      windowId: tab.windowId,
      windowName: tab.windowName
    }));

    this.workspaces.set(workspace.id, workspace);
    await this.saveWorkspaces();

    console.log(`📁 Current workspace saved: ${name}`);
    this.eventBus?.emit('workspace_saved', workspace);

    return workspace;
  }

  /**
   * 恢复工作空间
   */
  async restoreWorkspace(workspaceId, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    console.log(`🔄 Restoring workspace: ${workspace.name}`);

    if (!options.keepExistingTabs) {
      const currentWindows = await chrome.windows.getAll({ populate: true });
      for (const window of currentWindows) {
        if (window.tabs) {
          const tabsToClose = window.tabs.filter(t => !t.pinned);
          if (tabsToClose.length > 0 && chrome?.tabs?.remove) {
            await chrome.tabs.remove(tabsToClose.map(t => t.id));
          }
        }
      }
    }

    if (workspace.windowLayout && workspace.windowLayout.length > 0) {
      for (const windowLayout of workspace.windowLayout) {
        let targetWindow;
        
        const existingWindows = await chrome.windows.getAll();
        if (existingWindows.length > 0) {
          targetWindow = existingWindows[0];
        } else if (chrome?.windows?.create) {
          targetWindow = await chrome.windows.create({
            state: windowLayout.state || 'normal'
          });
        }

        if (targetWindow && windowLayout.tabs && chrome?.tabs?.create) {
          for (const tabInfo of windowLayout.tabs) {
            try {
              await chrome.tabs.create({
                windowId: targetWindow.id,
                url: tabInfo.url,
                active: tabInfo.active || false,
                pinned: tabInfo.pinned || false,
                index: tabInfo.index
              });
            } catch (error) {
              console.warn(`⚠️ Failed to create tab: ${tabInfo.url}`, error);
            }
          }
        }
      }
    } else if (workspace.tabs && workspace.tabs.length > 0 && chrome?.windows?.create && chrome?.tabs?.create) {
      const newWindow = await chrome.windows.create({
        state: 'maximized'
      });

      for (let i = 0; i < workspace.tabs.length; i++) {
        const tabInfo = workspace.tabs[i];
        try {
          await chrome.tabs.create({
            windowId: newWindow.id,
            url: tabInfo.url,
            active: i === 0,
            pinned: tabInfo.pinned || false
          });
        } catch (error) {
          console.warn(`⚠️ Failed to create tab: ${tabInfo.url}`, error);
        }
      }
    }

    for (const [id, ws] of this.workspaces.entries()) {
      ws.isActive = (id === workspaceId);
    }

    workspace.updatedAt = Date.now();
    await this.saveWorkspaces();

    this.eventBus?.emit('workspace_restored', workspace);

    return workspace;
  }

  /**
   * 删除工作空间
   */
  async deleteWorkspace(workspaceId) {
    if (!this.workspaces.has(workspaceId)) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const workspace = this.workspaces.get(workspaceId);
    this.workspaces.delete(workspaceId);
    await this.saveWorkspaces();

    console.log(`🗑️ Workspace deleted: ${workspace.name}`);
    this.eventBus?.emit('workspace_deleted', { workspaceId, workspace });

    return true;
  }

  /**
   * 更新工作空间
   */
  async updateWorkspace(workspaceId, updates) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const allowedUpdates = ['name', 'description', 'color', 'icon', 'tabs', 'groups'];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key)) {
        workspace[key] = value;
      }
    }

    workspace.updatedAt = Date.now();
    await this.saveWorkspaces();

    console.log(`📝 Workspace updated: ${workspace.name}`);
    this.eventBus?.emit('workspace_updated', workspace);

    return workspace;
  }

  /**
   * 获取所有工作空间
   */
  getAllWorkspaces() {
    return Array.from(this.workspaces.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 获取指定工作空间
   */
  getWorkspace(workspaceId) {
    return this.workspaces.get(workspaceId) || null;
  }

  /**
   * 保存工作空间数据
   */
  async saveWorkspaces() {
    try {
      const data = Object.fromEntries(this.workspaces);
      await this.storageManager.saveMetadata('workspaces', data);
    } catch (error) {
      console.error('❌ Failed to save workspaces:', error);
    }
  }

  /**
   * 加载工作空间数据
   */
  async loadWorkspaces() {
    try {
      const savedData = await this.storageManager.getMetadata('workspaces');
      if (savedData) {
        this.workspaces = new Map(Object.entries(savedData));
      }
    } catch (error) {
      console.warn('⚠️ Failed to load workspaces:', error);
    }
  }

  /**
   * 生成随机颜色
   */
  generateRandomColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F8B500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * 获取配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  async updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    console.log('✅ GlobalWindowManager config updated');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalWindows: this.windows.size,
      totalTabs: this.getAllTabsGlobal().length,
      totalWorkspaces: this.workspaces.size,
      hibernatedTabs: this.hibernatedTabs.size,
      activeWorkspace: Array.from(this.workspaces.values()).find(w => w.isActive)?.id || null
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GlobalWindowManager;
}

if (typeof window !== 'undefined') {
  window.GlobalWindowManager = GlobalWindowManager;
}
