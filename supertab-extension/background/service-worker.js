// SuperTab Service Worker - Main background script
importScripts('./event-bus.js');
importScripts('../utils/privacy-manager.js');
importScripts('./storage-manager.js');
importScripts('../utils/grouping-engine.js');
importScripts('./tab-manager.js');
importScripts('../utils/rule-engine.js');
importScripts('../utils/rule-manager.js');
importScripts('./auto-grouper.js');
importScripts('../utils/ai-intelligence-engine.js');
importScripts('../utils/global-window-manager.js');

class SuperTabServiceWorker {
  constructor() {
    this.eventBus = new EventBus();
    this.privacyManager = new PrivacyManager();
    this.storageManager = new StorageManager(this.privacyManager);
    this.tabManager = null;
    this.ruleEngine = null;
    this.ruleManager = null;
    this.autoGrouper = null;
    this.aiEngine = null;
    this.globalWindowManager = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.tabWatcher = null;
    this.eventListenersSetup = false;
    this.messageHandlersSetup = false;
    this.sidePanelAutoOpenEnabled = false;
    this.sidebarRefreshTimer = null;
    this.pendingRefreshReason = null;

    // Register Chrome event handlers synchronously so MV3 wake-up events are not missed.
    this.setupEventListeners();
    this.setupMessageHandlers();
  }

  async initialize() {
    if (this.initialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    console.log('🔧 SuperTab Service Worker initializing...');

    this.initializationPromise = (async () => {
      try {
        // Initialize privacy manager first
        await this.privacyManager.initialize();

        // Initialize storage manager
        await this.storageManager.initialize();

        // Initialize tab manager
        this.tabManager = new TabManager(this.eventBus, this.storageManager, this.privacyManager);
        await this.tabManager.initialize();

        // Reuse rule/auto-group instances created by TabManager to avoid duplicate listeners.
        this.ruleEngine = this.tabManager.ruleEngine || new RuleEngine();
        this.ruleManager = this.tabManager.ruleManager || new RuleManager(this.storageManager);
        this.autoGrouper = this.tabManager.autoGrouper || new AutoGrouper(this.tabManager, this.ruleEngine, this.ruleManager);

        // Initialize AI Intelligence Engine
        this.aiEngine = new AIIntelligenceEngine(this.storageManager, this.eventBus);
        await this.aiEngine.initialize();
        console.log('✅ AI Intelligence Engine initialized');

        // Initialize Global Window Manager
        this.globalWindowManager = new GlobalWindowManager(this.storageManager, this.eventBus, this.tabManager);
        await this.globalWindowManager.initialize();
        console.log('✅ Global Window Manager initialized');

        this.setupDataSyncEvents();

        this.initialized = true;
        console.log('✅ SuperTab Service Worker initialized successfully');

        // Perform initial tab sync
        await this.performInitialSync();
      } catch (error) {
        console.error('❌ Failed to initialize SuperTab Service Worker:', error);
        throw error;
      } finally {
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  setupEventListeners() {
    if (this.eventListenersSetup) {
      return;
    }

    // Chrome tabs events
    chrome.tabs.onCreated.addListener(this.handleTabCreated.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));
    chrome.tabs.onMoved.addListener(this.handleTabMoved.bind(this));
    chrome.tabs.onDetached.addListener(this.handleTabDetached.bind(this));
    chrome.tabs.onAttached.addListener(this.handleTabAttached.bind(this));

    // Chrome windows events
    chrome.windows.onFocusChanged.addListener(this.handleWindowFocusChanged.bind(this));

    // Chrome runtime events
    chrome.runtime.onStartup.addListener(this.handleStartup.bind(this));
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));
    chrome.runtime.onConnect.addListener(this.handleConnect.bind(this));

    // Extension icon click event - Open sidebar
    chrome.action.onClicked.addListener(this.handleIconClick.bind(this));

    // Side panel events
    if (chrome.sidePanel) {
      chrome.sidePanel.setOptions({
        enabled: true,
        path: 'ui/sidebar/sidebar.html'
      });

      if (typeof chrome.sidePanel.setPanelBehavior === 'function') {
        const panelBehaviorResult = chrome.sidePanel.setPanelBehavior({
          openPanelOnActionClick: true
        });

        if (panelBehaviorResult && typeof panelBehaviorResult.then === 'function') {
          panelBehaviorResult
            .then(() => {
              this.sidePanelAutoOpenEnabled = true;
            })
            .catch((error) => {
              console.warn('Failed to enable side panel auto-open behavior:', error);
            });
        } else {
          this.sidePanelAutoOpenEnabled = true;
        }
      }
    }

    this.eventListenersSetup = true;
    console.log('📡 Event listeners setup complete');
  }

  setupMessageHandlers() {
    if (this.messageHandlersSetup) {
      return;
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      let responded = false;
      const timeoutMs = 15000;
      const timer = setTimeout(() => {
        safeSendResponse({ success: false, error: 'Request timed out' });
      }, timeoutMs);

      const safeSendResponse = (payload) => {
        if (responded) {
          return;
        }
        responded = true;
        clearTimeout(timer);
        try {
          sendResponse(payload);
        } catch (error) {
          console.warn('sendResponse failed (likely channel already closed):', error);
        }
      };

      Promise.resolve(this.handleMessage(request, sender, safeSendResponse))
        .catch((error) => {
          console.error('Unhandled message handler error:', error);
          const sanitizedError = this.sanitizeErrorMessage(error?.message || 'Unknown error');
          safeSendResponse({ success: false, error: sanitizedError });
        });

      return true; // Keep message channel open for async responses
    });

    this.messageHandlersSetup = true;
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      await this.initialize();

      const action = request?.action;
      const data = this.normalizeRequestData(request);

      switch (action) {
        case 'getTabsGrouped':
          const groupedTabs = await this.tabManager.getTabsGrouped(data.groupType || 'domain');
          sendResponse({ success: true, data: groupedTabs });
          break;

        case 'getAllTabs':
          const allTabs = await this.tabManager.getAllTabs();
          sendResponse({ success: true, data: allTabs });
          break;

        case 'createGroup':
          const createGroupName = typeof data?.name === 'string'
            ? data.name.trim()
            : (typeof request?.name === 'string' ? request.name.trim() : '');
          if (!createGroupName) {
            sendResponse({ success: false, error: 'Group name is required' });
            break;
          }
          const createGroupTabUuids = Array.from(new Set(
            (Array.isArray(data?.tabUuids) ? data.tabUuids : [])
              .filter(tabUuid => typeof tabUuid === 'string' && tabUuid.length > 0)
          ));
          const group = await this.tabManager.createCustomGroup(createGroupName, '', createGroupTabUuids);
          if (!group) {
            sendResponse({ success: false, error: 'Failed to create group' });
            break;
          }
          sendResponse({ success: true, data: group });
          this.scheduleSidebarRefresh('group_created');
          break;

        case 'updateTabNote':
          if (!data?.tabUuid || typeof data.note !== 'string') {
            sendResponse({ success: false, error: 'tabUuid is required and note must be a string' });
            break;
          }
          const success = await this.tabManager.updateTabNote(data.tabUuid, data.note);
          sendResponse({ success });
          if (success) {
            this.scheduleSidebarRefresh('tab_note_updated');
          }
          break;

        case 'updateTabAlias':
          if (!data?.tabUuid || typeof data.alias !== 'string') {
            sendResponse({ success: false, error: 'tabUuid and alias are required' });
            break;
          }
          const aliasSuccess = await this.tabManager.updateTabAlias(data.tabUuid, data.alias);
          sendResponse({ success: aliasSuccess });
          if (aliasSuccess) {
            this.scheduleSidebarRefresh('tab_alias_updated');
          }
          break;

        case 'moveTabToGroup':
          if (!data?.tabUuid || !data?.groupId) {
            sendResponse({ success: false, error: 'tabUuid and groupId are required' });
            break;
          }
          const moveSuccess = await this.tabManager.moveTabToGroup(data.tabUuid, data.groupId);
          sendResponse({ success: moveSuccess });
          if (moveSuccess) {
            this.scheduleSidebarRefresh('tab_moved_to_group');
          }
          break;

        case 'closeTab':
          const closeTabId = Number.parseInt(data?.tabId ?? request?.tabId, 10);
          if (!Number.isInteger(closeTabId)) {
            sendResponse({ success: false, error: 'tabId is required' });
            break;
          }
          const closeSuccess = await this.tabManager.closeTab(closeTabId);
          sendResponse({ success: closeSuccess });
          if (closeSuccess) {
            this.scheduleSidebarRefresh('tab_closed');
          }
          break;

        case 'deleteGroup':
          if (!data?.groupId) {
            sendResponse({ success: false, error: 'groupId is required' });
            break;
          }
          const normalizedDeleteTabIds = Array.from(new Set(
            (Array.isArray(data.tabIds) ? data.tabIds : [])
              .map(tabId => Number.parseInt(tabId, 10))
              .filter(Number.isInteger)
          ));
          const deleteGroupSuccess = await this.tabManager.deleteGroup(data.groupId, normalizedDeleteTabIds);
          sendResponse({ success: deleteGroupSuccess });
          if (deleteGroupSuccess) {
            this.scheduleSidebarRefresh('group_deleted');
          }
          break;

        case 'updateGroup':
          if (!data?.group || typeof data.group !== 'object') {
            sendResponse({ success: false, error: 'group is required' });
            break;
          }
          if (typeof this.tabManager.updateGroup !== 'function') {
            sendResponse({ success: false, error: 'updateGroup is not supported' });
            break;
          }
          const updateGroupSuccess = await this.tabManager.updateGroup(data.group);
          sendResponse({ success: updateGroupSuccess });
          break;

        case 'bookmarkTabs':
          if (!Array.isArray(data?.tabUuids) || data.tabUuids.length === 0) {
            sendResponse({ success: false, error: 'tabUuids are required' });
            break;
          }
          const bookmarkOptions = {};
          if (typeof data?.folderId === 'string' && data.folderId.trim()) {
            bookmarkOptions.folderId = data.folderId.trim();
          }
          if (typeof data?.createFolderName === 'string' && data.createFolderName.trim()) {
            bookmarkOptions.createFolderName = data.createFolderName.trim();
          }
          const bookmarkResult = Object.keys(bookmarkOptions).length > 0
            ? await this.tabManager.bookmarkTabs(data.tabUuids, bookmarkOptions)
            : await this.tabManager.bookmarkTabs(data.tabUuids);
          sendResponse(bookmarkResult);
          if (bookmarkResult?.success) {
            this.scheduleSidebarRefresh('tabs_bookmarked');
          }
          break;

        case 'listBookmarkFolders':
          const bookmarkFolders = await this.tabManager.listBookmarkFolders();
          sendResponse({ success: true, data: bookmarkFolders });
          break;

        case 'applyRulesToExistingTabs':
          if (typeof this.tabManager.applyRulesToExistingTabs !== 'function') {
            sendResponse({ success: false, error: 'applyRulesToExistingTabs is not supported' });
            break;
          }
          const applyRulesResult = await this.tabManager.applyRulesToExistingTabs();
          sendResponse({ success: true, data: applyRulesResult });
          this.scheduleSidebarRefresh('rules_applied_to_existing_tabs');
          break;

        case 'activateTab':
          const activateTabId = Number.parseInt(data?.tabId ?? request?.tabId, 10);
          if (!Number.isInteger(activateTabId)) {
            sendResponse({ success: false, error: 'tabId is required' });
            break;
          }
          const activateSuccess = await this.tabManager.activateTab(activateTabId);
          sendResponse({ success: activateSuccess });
          break;

        case 'getAllGroups':
          const groups = await this.storageManager.getAllGroups();
          sendResponse({ success: true, data: groups });
          break;

        case 'getPrivacySettings':
          const settings = await this.privacyManager.getSettings();
          sendResponse({ success: true, data: settings });
          break;

        case 'updatePrivacySettings':
          if (!data?.settings) {
            sendResponse({ success: false, error: 'settings data is required' });
            break;
          }
          await this.privacyManager.updateSettings(this.normalizePrivacySettingsUpdate(data.settings));
          sendResponse({ success: true });
          break;

        case 'exportAllData':
          const exportData = await this.exportAllData();
          sendResponse({ success: true, data: exportData });
          break;

        case 'importAllData':
          if (!data) {
            sendResponse({ success: false, error: 'Import data is required' });
            break;
          }
          const importSuccess = await this.importAllData(data);
          sendResponse({ success: importSuccess });
          if (importSuccess) {
            this.scheduleSidebarRefresh('data_imported');
          }
          break;

        case 'clearAllData':
          const clearSuccess = await this.clearAllData();
          sendResponse({ success: clearSuccess });
          if (clearSuccess) {
            this.scheduleSidebarRefresh('data_cleared');
          }
          break;

        case 'getPerformanceMetrics':
          const metrics = this.tabManager.getPerformanceMetrics();
          sendResponse({ success: true, data: metrics });
          break;

        // AI Intelligence Engine Actions
        case 'analyzeTab':
          if (!data?.tabUuid && !data?.tab) {
            sendResponse({ success: false, error: 'tabUuid or tab data is required' });
            break;
          }
          let tabToAnalyze = data.tab;
          if (!tabToAnalyze && data.tabUuid) {
            tabToAnalyze = await this.storageManager.getTab(data.tabUuid);
          }
          if (!tabToAnalyze) {
            sendResponse({ success: false, error: 'Tab not found' });
            break;
          }
          const analysisResult = await this.aiEngine.analyzeTab(tabToAnalyze);
          sendResponse({ success: true, data: analysisResult });
          break;

        case 'analyzeAllTabs':
          const allTabsToAnalyze = await this.tabManager.getAllTabs();
          const allAnalysisResults = await this.aiEngine.analyzeTabs(allTabsToAnalyze);
          sendResponse({ success: true, data: allAnalysisResults });
          break;

        case 'getAIConfig':
          const aiConfig = this.aiEngine.getConfig();
          sendResponse({ success: true, data: aiConfig });
          break;

        case 'updateAIConfig':
          if (!data?.config) {
            sendResponse({ success: false, error: 'config is required' });
            break;
          }
          await this.aiEngine.updateConfig(data.config);
          sendResponse({ success: true });
          break;

        case 'getBehaviorStats':
          const behaviorStats = this.aiEngine.getBehaviorStats();
          sendResponse({ success: true, data: behaviorStats });
          break;

        case 'getDomainCorrelationStats':
          const domainStats = this.aiEngine.getDomainCorrelationStats();
          sendResponse({ success: true, data: domainStats });
          break;

        // Global Window Manager Actions
        case 'getAllWindows':
          const windows = this.globalWindowManager.getAllWindows();
          sendResponse({ success: true, data: windows });
          break;

        case 'getWindow':
          if (!data?.windowId) {
            sendResponse({ success: false, error: 'windowId is required' });
            break;
          }
          const window = this.globalWindowManager.getWindow(data.windowId);
          sendResponse({ success: true, data: window });
          break;

        case 'getAllTabsGlobal':
          const allTabsGlobal = this.globalWindowManager.getAllTabsGlobal();
          sendResponse({ success: true, data: allTabsGlobal });
          break;

        case 'searchTabsGlobal':
          if (!data?.query) {
            sendResponse({ success: false, error: 'query is required' });
            break;
          }
          const searchOptions = data.options || {};
          const searchResults = this.globalWindowManager.searchTabsGlobal(data.query, searchOptions);
          sendResponse({ success: true, data: searchResults });
          break;

        case 'moveTabToWindow':
          if (!data?.tabId || !data?.targetWindowId) {
            sendResponse({ success: false, error: 'tabId and targetWindowId are required' });
            break;
          }
          try {
            const moveResult = await this.globalWindowManager.moveTabToWindow(
              data.tabId,
              data.targetWindowId,
              data.targetIndex
            );
            sendResponse({ success: true, data: moveResult });
            this.scheduleSidebarRefresh('tab_moved_to_window');
          } catch (moveError) {
            sendResponse({ success: false, error: moveError.message });
          }
          break;

        case 'moveTabsToWindow':
          if (!Array.isArray(data?.tabIds) || !data?.targetWindowId) {
            sendResponse({ success: false, error: 'tabIds array and targetWindowId are required' });
            break;
          }
          const batchMoveResults = await this.globalWindowManager.moveTabsToWindow(
            data.tabIds,
            data.targetWindowId,
            data.targetIndex
          );
          sendResponse({ success: true, data: batchMoveResults });
          this.scheduleSidebarRefresh('tabs_moved_to_window');
          break;

        case 'mergeTabsToCurrentWindow':
          if (!Array.isArray(data?.tabIds)) {
            sendResponse({ success: false, error: 'tabIds array is required' });
            break;
          }
          const mergeResults = await this.globalWindowManager.mergeTabsToCurrentWindow(data.tabIds);
          sendResponse({ success: true, data: mergeResults });
          this.scheduleSidebarRefresh('tabs_merged_to_current_window');
          break;

        case 'findDuplicateTabs':
          const dupMode = data?.mode || 'url';
          const duplicateGroups = this.globalWindowManager.findDuplicateTabs(dupMode);
          sendResponse({ success: true, data: duplicateGroups });
          break;

        case 'mergeDuplicateTabs':
          if (!data?.group) {
            sendResponse({ success: false, error: 'duplicate group data is required' });
            break;
          }
          const mergeDupResult = await this.globalWindowManager.mergeDuplicateTabs(
            data.group,
            data.keepTabId
          );
          sendResponse({ success: true, data: mergeDupResult });
          this.scheduleSidebarRefresh('duplicate_tabs_merged');
          break;

        case 'autoMergeAllDuplicates':
          const autoMergeResult = await this.globalWindowManager.autoMergeAllDuplicates();
          sendResponse({ success: true, data: autoMergeResult });
          this.scheduleSidebarRefresh('all_duplicates_merged');
          break;

        case 'hibernateTab':
          if (!data?.tabId) {
            sendResponse({ success: false, error: 'tabId is required' });
            break;
          }
          try {
            const hibernateResult = await this.globalWindowManager.hibernateTab(data.tabId);
            sendResponse({ success: true, data: hibernateResult });
          } catch (hibernateError) {
            sendResponse({ success: false, error: hibernateError.message });
          }
          break;

        case 'restoreHibernatedTab':
          if (!data?.tabId) {
            sendResponse({ success: false, error: 'tabId is required' });
            break;
          }
          try {
            const restoreResult = await this.globalWindowManager.restoreHibernatedTab(data.tabId);
            sendResponse({ success: true, data: restoreResult });
          } catch (restoreError) {
            sendResponse({ success: false, error: restoreError.message });
          }
          break;

        case 'hibernateInactiveTabs':
          const inactiveMinutes = data?.minutes || 30;
          const hibernatedTabs = await this.globalWindowManager.hibernateInactiveTabs(inactiveMinutes);
          sendResponse({ success: true, data: hibernatedTabs });
          this.scheduleSidebarRefresh('inactive_tabs_hibernated');
          break;

        // Workspace Actions
        case 'createWorkspace':
          if (!data?.name) {
            sendResponse({ success: false, error: 'workspace name is required' });
            break;
          }
          const newWorkspace = await this.globalWindowManager.createWorkspace(
            data.name,
            data.description || '',
            {
              color: data.color,
              icon: data.icon,
              includeCurrentTabs: data.includeCurrentTabs
            }
          );
          sendResponse({ success: true, data: newWorkspace });
          break;

        case 'saveCurrentWorkspace':
          if (!data?.name) {
            sendResponse({ success: false, error: 'workspace name is required' });
            break;
          }
          const savedWorkspace = await this.globalWindowManager.saveCurrentWorkspace(
            data.name,
            data.description || ''
          );
          sendResponse({ success: true, data: savedWorkspace });
          break;

        case 'restoreWorkspace':
          if (!data?.workspaceId) {
            sendResponse({ success: false, error: 'workspaceId is required' });
            break;
          }
          try {
            const restoredWorkspace = await this.globalWindowManager.restoreWorkspace(
              data.workspaceId,
              { keepExistingTabs: data.keepExistingTabs }
            );
            sendResponse({ success: true, data: restoredWorkspace });
            this.scheduleSidebarRefresh('workspace_restored');
          } catch (restoreWsError) {
            sendResponse({ success: false, error: restoreWsError.message });
          }
          break;

        case 'deleteWorkspace':
          if (!data?.workspaceId) {
            sendResponse({ success: false, error: 'workspaceId is required' });
            break;
          }
          try {
            await this.globalWindowManager.deleteWorkspace(data.workspaceId);
            sendResponse({ success: true });
          } catch (deleteWsError) {
            sendResponse({ success: false, error: deleteWsError.message });
          }
          break;

        case 'updateWorkspace':
          if (!data?.workspaceId || !data?.updates) {
            sendResponse({ success: false, error: 'workspaceId and updates are required' });
            break;
          }
          try {
            const updatedWorkspace = await this.globalWindowManager.updateWorkspace(
              data.workspaceId,
              data.updates
            );
            sendResponse({ success: true, data: updatedWorkspace });
          } catch (updateWsError) {
            sendResponse({ success: false, error: updateWsError.message });
          }
          break;

        case 'getAllWorkspaces':
          const allWorkspaces = this.globalWindowManager.getAllWorkspaces();
          sendResponse({ success: true, data: allWorkspaces });
          break;

        case 'getWorkspace':
          if (!data?.workspaceId) {
            sendResponse({ success: false, error: 'workspaceId is required' });
            break;
          }
          const workspace = this.globalWindowManager.getWorkspace(data.workspaceId);
          sendResponse({ success: true, data: workspace });
          break;

        case 'getGlobalWindowConfig':
          const gwConfig = this.globalWindowManager.getConfig();
          sendResponse({ success: true, data: gwConfig });
          break;

        case 'updateGlobalWindowConfig':
          if (!data?.config) {
            sendResponse({ success: false, error: 'config is required' });
            break;
          }
          await this.globalWindowManager.updateConfig(data.config);
          sendResponse({ success: true });
          break;

        case 'getGlobalWindowStats':
          const gwStats = this.globalWindowManager.getStats();
          sendResponse({ success: true, data: gwStats });
          break;

        default:
          sendResponse({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      // Sanitize error message to prevent information disclosure
      const sanitizedError = this.sanitizeErrorMessage(error.message);
      sendResponse({ success: false, error: sanitizedError });
    }
  }

  // Tab event handlers
  async handleTabCreated(tab) {
    try {
      await this.initialize();
      console.log('📄 Tab created:', tab.id, tab.url);
      await this.tabManager.handleTabCreated(tab);
      this.scheduleSidebarRefresh('tab_created');
    } catch (error) {
      console.error('Error handling tab creation:', error);
    }
  }

  async handleTabUpdated(tabId, changeInfo, tab) {
    try {
      await this.initialize();
      if (changeInfo.status === 'complete' && tab.url) {
        console.log('📝 Tab updated:', tabId, tab.url);
        await this.tabManager.handleTabUpdated(tab);
        this.scheduleSidebarRefresh('tab_updated');
      }
    } catch (error) {
      console.error('Error handling tab update:', error);
    }
  }

  async handleTabRemoved(tabId, removeInfo) {
    try {
      await this.initialize();
      console.log('🗑️ Tab removed:', tabId);
      await this.tabManager.handleTabRemoved(tabId, removeInfo);
      this.scheduleSidebarRefresh('tab_removed');
    } catch (error) {
      console.error('Error handling tab removal:', error);
    }
  }

  async handleTabActivated(activeInfo) {
    try {
      await this.initialize();
      console.log('🎯 Tab activated:', activeInfo.tabId);
      await this.tabManager.handleTabActivated(activeInfo);
    } catch (error) {
      console.error('Error handling tab activation:', error);
    }
  }

  async handleTabMoved(tabId, moveInfo) {
    try {
      await this.initialize();
      console.log('📦 Tab moved:', tabId, moveInfo);
      await this.tabManager.handleTabMoved(tabId, moveInfo);
      this.scheduleSidebarRefresh('tab_moved');
    } catch (error) {
      console.error('Error handling tab move:', error);
    }
  }

  async handleTabDetached(tabId, detachInfo) {
    try {
      await this.initialize();
      console.log('🔓 Tab detached:', tabId);
      await this.tabManager.handleTabDetached(tabId, detachInfo);
      this.scheduleSidebarRefresh('tab_detached');
    } catch (error) {
      console.error('Error handling tab detach:', error);
    }
  }

  async handleTabAttached(tabId, attachInfo) {
    try {
      await this.initialize();
      console.log('🔗 Tab attached:', tabId);
      await this.tabManager.handleTabAttached(tabId, attachInfo);
      this.scheduleSidebarRefresh('tab_attached');
    } catch (error) {
      console.error('Error handling tab attach:', error);
    }
  }

  async handleWindowFocusChanged(windowId) {
    try {
      await this.initialize();
      console.log('🪟 Window focus changed:', windowId);
      await this.tabManager.handleWindowFocusChanged(windowId);
      this.scheduleSidebarRefresh('window_focus_changed');
    } catch (error) {
      console.error('Error handling window focus change:', error);
    }
  }

  // Icon click handler - Open sidebar
  async handleIconClick(tab) {
    try {
      console.log('🔘 Extension icon clicked');
      if (!chrome.sidePanel) {
        console.warn('SidePanel API not available');
        return;
      }

      if (this.sidePanelAutoOpenEnabled) {
        return;
      }

      const tabId = Number.isInteger(tab?.id) ? tab.id : null;
      if (!tabId) {
        console.warn('Cannot open side panel: missing active tab id');
        return;
      }

      // Do not await any async call before sidePanel.open to preserve user gesture context.
      await chrome.sidePanel.open({ tabId });
      console.log('📬 Sidebar opened');
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  }

  // Runtime event handlers
  async handleStartup() {
    console.log('🚀 Chrome startup detected');
    await this.initialize();
  }

  async handleInstalled(details) {
    console.log('📦 SuperTab installed/updated:', details.reason);

    await this.initialize();

    if (details.reason === 'install') {
      // First time installation
      await this.handleFirstTimeInstall();
    } else if (details.reason === 'update') {
      // Extension update
      await this.handleExtensionUpdate(details);
    }
  }

  handleConnect(port) {
    console.log('🔌 New connection:', port.name);

    port.onMessage.addListener((msg) => {
      this.handleMessage(msg, port.sender, (response) => {
        port.postMessage(response);
      });
    });

    port.onDisconnect.addListener(() => {
      console.log('🔌 Connection closed:', port.name);
    });
  }

  // Helper methods
  async performInitialSync() {
    try {
      console.log('🔄 Performing initial tab sync...');
      await this.tabManager.ensureCurrentTabsSynced();

      // Apply smart grouping rules to already-open tabs so rules take effect immediately.
      if (typeof this.tabManager.applyRulesToExistingTabs === 'function') {
        const applyResult = await this.tabManager.applyRulesToExistingTabs();
        if (applyResult?.success && applyResult.assignedCount > 0) {
          console.log(`🤖 Smart grouping applied to ${applyResult.assignedCount} existing tabs`);
        }
      }

      this.scheduleSidebarRefresh('initial_sync');

      console.log('✅ Initial tab sync completed');
    } catch (error) {
      console.error('Error during initial sync:', error);
    }
  }

  setupDataSyncEvents() {
    if (!this.eventBus || typeof this.eventBus.on !== 'function') {
      return;
    }

    if (this._dataSyncEventsBound) {
      return;
    }

    this._dataSyncEventsBound = true;
    this.eventBus.on('group_deleted', () => this.scheduleSidebarRefresh('group_deleted'));
    this.eventBus.on('tab_note_updated', () => this.scheduleSidebarRefresh('tab_note_updated'));
    this.eventBus.on('tab_alias_updated', () => this.scheduleSidebarRefresh('tab_alias_updated'));
    this.eventBus.on('tabs_bookmarked', () => this.scheduleSidebarRefresh('tabs_bookmarked'));
  }

  scheduleSidebarRefresh(reason = 'data_changed') {
    this.pendingRefreshReason = reason;
    if (this.sidebarRefreshTimer) {
      return;
    }

    this.sidebarRefreshTimer = setTimeout(() => {
      this.sidebarRefreshTimer = null;
      const refreshReason = this.pendingRefreshReason || 'data_changed';
      this.pendingRefreshReason = null;
      this.broadcastSidebarRefresh(refreshReason);
    }, 120);
  }

  broadcastSidebarRefresh(reason = 'data_changed') {
    try {
      if (!chrome?.runtime?.sendMessage) {
        return;
      }

      chrome.runtime.sendMessage({
        action: 'refresh',
        data: {
          reason,
          at: Date.now()
        }
      }, () => {
        const message = chrome.runtime?.lastError?.message || '';
        if (message && !message.includes('Receiving end does not exist')) {
          console.warn('Sidebar refresh broadcast warning:', message);
        }
      });
    } catch (error) {
      console.warn('Failed to broadcast sidebar refresh:', error);
    }
  }

  // Security helper method
  sanitizeErrorMessage(message) {
    // Remove sensitive information from error messages
    const sensitivePatterns = [
      /atob\(.*?\)/g,
      /btoa\(.*?\)/g,
      /[A-Za-z]:\\[^\s]*/g,  // Windows file paths
      /\/[^\s]*/g,  // Unix file paths
      /password[=:][^\s]*/gi,
      /token[=:][^\s]*/gi,
      /key[=:][^\s]*/gi
    ];

    let sanitized = message;
    sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    // Limit error message length
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200) + '...';
    }

    return sanitized || 'An error occurred';
  }

  normalizeRequestData(request) {
    if (!request || typeof request !== 'object') {
      return {};
    }

    if (request.data && typeof request.data === 'object') {
      return request.data;
    }

    const { action, data, ...rest } = request;
    return rest;
  }

  normalizePrivacySettingsUpdate(settings) {
    if (!settings || typeof settings !== 'object') {
      return settings;
    }

    if (settings.privacy && typeof settings.privacy === 'object') {
      return settings;
    }

    return {
      privacy: {
        encryptNotes: Boolean(settings.encryptNotes),
        excludeDomains: Array.isArray(settings.excludeDomains) ? settings.excludeDomains : [],
        autoCleanupDays: Number.parseInt(settings.autoCleanupDays, 10) || 0
      }
    };
  }

  async handleFirstTimeInstall() {
    console.log('🎉 First time installation');

    // Set default settings
    const defaultSettings = {
      privacy: {
        encryptNotes: false,
        excludeDomains: [],
        autoCleanupDays: 30
      },
      ui: {
        collapsedGroups: [],
        defaultGrouping: 'domain'
      },
      preferences: {
        showFavicons: true,
        enableNotifications: true,
        groupDisplayMode: 'sidebar'
      }
    };

    await this.privacyManager.updateSettings(defaultSettings);

    // Show welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('ui/welcome/welcome.html'),
      active: true
    });
  }

  async handleExtensionUpdate(details) {
    console.log('🔄 Extension updated from:', details.previousVersion);

    // Perform any necessary data migrations
    await this.performDataMigration(details.previousVersion);

    // Show what's new page
    chrome.tabs.create({
      url: chrome.runtime.getURL('ui/changelog/changelog.html'),
      active: true
    });
  }

  async performDataMigration(previousVersion) {
    // Implement data migration logic here if needed
    console.log('🔄 Data migration from version:', previousVersion);
  }

  async exportAllData() {
    try {
      const tabs = await this.storageManager.getAllTabs();
      const groups = await this.storageManager.getAllGroups();
      const settings = await this.privacyManager.getSettings();
      const metadata = await this.storageManager.getMetadata();

      return {
        tabs,
        groups,
        settings,
        metadata,
        exportedAt: new Date().toISOString(),
        version: chrome.runtime.getManifest().version
      };
    } catch (error) {
      console.error('Export error:', error);
      throw error;
    }
  }

  async importAllData(data) {
    try {
      // Validate import data
      if (!data.tabs || !data.groups || !data.settings) {
        throw new Error('Invalid import data format');
      }

      // Clear existing data
      await this.storageManager.clearAllData();

      // Import new data
      await this.storageManager.importData(data);

      // Update privacy settings
      await this.privacyManager.updateSettings(data.settings);

      console.log('✅ Data imported successfully');
      return true;
    } catch (error) {
      console.error('Import error:', error);
      throw error;
    }
  }

  async clearAllData() {
    try {
      await this.storageManager.clearAllData();
      console.log('🗑️ All data cleared');
      return true;
    } catch (error) {
      console.error('Clear data error:', error);
      return false;
    }
  }
}

// Global service worker instance
const serviceWorker = new SuperTabServiceWorker();

// Auto-initialize when script loads
serviceWorker.initialize().catch(error => {
  console.error('Failed to initialize service worker:', error);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SuperTabServiceWorker;
}
