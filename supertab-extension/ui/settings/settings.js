// ui/settings/settings.js
class SuperTabSettings {
  constructor() {
    this.privacyManager = null;
    this.settings = {
      encryptNotes: false,
      excludeDomains: [],
      autoCleanupDays: 30,
      enableLogging: false,
      groupDisplayMode: 'sidebar'
    };
    this.aiConfig = {
      enableSemanticAnalysis: true,
      enableSceneClassification: true,
      enableDomainCorrelation: true,
      enableBehaviorLearning: true,
      confidenceThreshold: 0.6,
      learningRate: 0.1
    };
    this.globalWindowConfig = {
      enableAutoMergeDuplicates: true,
      enableHibernation: true,
      hibernationThresholdMinutes: 30,
      maxHibernatedTabs: 50,
      duplicateDetectionMode: 'url'
    };

    this.initializeElements();
    this.setupEventListeners();
    this.initialize();
  }

  async initialize() {
    // 从后台获取隐私管理器实例和设置
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getPrivacySettings'
      });

      if (response.success) {
        this.settings = this.normalizeSettings(response.data);
      }

      // Load AI config
      try {
        const aiConfigResponse = await chrome.runtime.sendMessage({
          action: 'getAIConfig'
        });
        if (aiConfigResponse.success) {
          this.aiConfig = { ...this.aiConfig, ...aiConfigResponse.data };
        }
      } catch (aiError) {
        console.warn('加载AI配置失败:', aiError);
      }

      // Load global window config
      try {
        const gwConfigResponse = await chrome.runtime.sendMessage({
          action: 'getGlobalWindowConfig'
        });
        if (gwConfigResponse.success) {
          this.globalWindowConfig = { ...this.globalWindowConfig, ...gwConfigResponse.data };
        }
      } catch (gwError) {
        console.warn('加载多窗口配置失败:', gwError);
      }

      this.updateUI();
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  initializeElements() {
    this.elements = {
      closeBtn: document.getElementById('close-btn'),
      encryptNotes: document.getElementById('encrypt-notes'),
      excludeDomains: document.getElementById('exclude-domains'),
      autoCleanup: document.getElementById('auto-cleanup'),
      exportData: document.getElementById('export-data'),
      importData: document.getElementById('import-data'),
      importFile: document.getElementById('import-file'),
      clearData: document.getElementById('clear-data'),
      saveSettings: document.getElementById('save-settings'),
      resetSettings: document.getElementById('reset-settings'),
      version: document.getElementById('version'),
      feedbackLink: document.getElementById('feedback-link'),
      manageRules: document.getElementById('manage-rules'),
      groupDisplayMode: document.getElementById('group-display-mode'),
      // AI settings
      enableSemanticAnalysis: document.getElementById('enable-semantic-analysis'),
      enableSceneClassification: document.getElementById('enable-scene-classification'),
      enableDomainCorrelation: document.getElementById('enable-domain-correlation'),
      enableBehaviorLearning: document.getElementById('enable-behavior-learning'),
      confidenceThreshold: document.getElementById('confidence-threshold'),
      confidenceValue: document.getElementById('confidence-value'),
      // Global window settings
      enableAutoMergeDuplicates: document.getElementById('enable-auto-merge-duplicates'),
      duplicateDetectionMode: document.getElementById('duplicate-detection-mode'),
      enableHibernation: document.getElementById('enable-hibernation'),
      hibernationThreshold: document.getElementById('hibernation-threshold'),
      maxHibernatedTabs: document.getElementById('max-hibernated-tabs')
    };
  }

  setupEventListeners() {
    // 关闭按钮
    this.elements.closeBtn.addEventListener('click', () => {
      window.close();
    });

    // 导出数据
    this.elements.exportData.addEventListener('click', () => {
      this.exportData();
    });

    // 导入数据
    this.elements.importData.addEventListener('click', () => {
      this.elements.importFile.click();
    });

    this.elements.importFile.addEventListener('change', (e) => {
      this.importData(e.target.files[0]);
    });

    // 清除数据
    this.elements.clearData.addEventListener('click', () => {
      this.clearAllData();
    });

    // 保存设置
    this.elements.saveSettings.addEventListener('click', () => {
      this.saveSettings();
    });

    // 重置设置
    this.elements.resetSettings.addEventListener('click', () => {
      this.resetToDefault();
    });

    // 反馈链接
    this.elements.feedbackLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.openFeedback();
    });

    // 管理规则
    this.elements.manageRules.addEventListener('click', () => {
      this.navigateToRules();
    });

    // Confidence threshold slider
    if (this.elements.confidenceThreshold) {
      this.elements.confidenceThreshold.addEventListener('input', (e) => {
        if (this.elements.confidenceValue) {
          this.elements.confidenceValue.textContent = `${e.target.value}%`;
        }
      });
    }
  }

  updateUI() {
    // 更新UI元素以反映当前设置
    this.elements.encryptNotes.checked = Boolean(this.settings.encryptNotes);
    this.elements.excludeDomains.value = (this.settings.excludeDomains || []).join('\n');
    this.elements.autoCleanup.value = String(this.settings.autoCleanupDays ?? 30);
    if (this.elements.groupDisplayMode) {
      this.elements.groupDisplayMode.value = this.settings.groupDisplayMode === 'tab' ? 'tab' : 'sidebar';
    }

    // Update AI settings UI
    if (this.elements.enableSemanticAnalysis) {
      this.elements.enableSemanticAnalysis.checked = Boolean(this.aiConfig.enableSemanticAnalysis);
    }
    if (this.elements.enableSceneClassification) {
      this.elements.enableSceneClassification.checked = Boolean(this.aiConfig.enableSceneClassification);
    }
    if (this.elements.enableDomainCorrelation) {
      this.elements.enableDomainCorrelation.checked = Boolean(this.aiConfig.enableDomainCorrelation);
    }
    if (this.elements.enableBehaviorLearning) {
      this.elements.enableBehaviorLearning.checked = Boolean(this.aiConfig.enableBehaviorLearning);
    }
    if (this.elements.confidenceThreshold) {
      const thresholdValue = Math.round((this.aiConfig.confidenceThreshold || 0.6) * 100);
      this.elements.confidenceThreshold.value = thresholdValue;
      if (this.elements.confidenceValue) {
        this.elements.confidenceValue.textContent = `${thresholdValue}%`;
      }
    }

    // Update global window settings UI
    if (this.elements.enableAutoMergeDuplicates) {
      this.elements.enableAutoMergeDuplicates.checked = Boolean(this.globalWindowConfig.enableAutoMergeDuplicates);
    }
    if (this.elements.duplicateDetectionMode) {
      this.elements.duplicateDetectionMode.value = this.globalWindowConfig.duplicateDetectionMode || 'url';
    }
    if (this.elements.enableHibernation) {
      this.elements.enableHibernation.checked = Boolean(this.globalWindowConfig.enableHibernation);
    }
    if (this.elements.hibernationThreshold) {
      this.elements.hibernationThreshold.value = String(this.globalWindowConfig.hibernationThresholdMinutes ?? 30);
    }
    if (this.elements.maxHibernatedTabs) {
      this.elements.maxHibernatedTabs.value = String(this.globalWindowConfig.maxHibernatedTabs ?? 50);
    }

    // 更新版本信息
    this.elements.version.textContent = chrome.runtime.getManifest().version;
  }

  async saveSettings() {
    try {
      // 从UI获取设置值
      const newSettings = {
        encryptNotes: this.elements.encryptNotes.checked,
        excludeDomains: this.elements.excludeDomains.value
          .split('\n')
          .map(domain => domain.trim())
          .filter(domain => domain.length > 0),
        autoCleanupDays: parseInt(this.elements.autoCleanup.value) || 0,
        groupDisplayMode: this.elements.groupDisplayMode?.value === 'tab' ? 'tab' : 'sidebar'
      };

      // 保存设置
      const response = await chrome.runtime.sendMessage({
        action: 'updatePrivacySettings',
        data: {
          settings: this.toPrivacySettingsPayload(newSettings)
        }
      });

      if (!response.success) {
        throw new Error('保存隐私设置失败');
      }

      // Save AI config
      const newAiConfig = {
        enableSemanticAnalysis: this.elements.enableSemanticAnalysis?.checked ?? true,
        enableSceneClassification: this.elements.enableSceneClassification?.checked ?? true,
        enableDomainCorrelation: this.elements.enableDomainCorrelation?.checked ?? true,
        enableBehaviorLearning: this.elements.enableBehaviorLearning?.checked ?? true,
        confidenceThreshold: parseInt(this.elements.confidenceThreshold?.value ?? 60) / 100,
        learningRate: 0.1
      };

      const aiConfigResponse = await chrome.runtime.sendMessage({
        action: 'updateAIConfig',
        data: { config: newAiConfig }
      });

      if (!aiConfigResponse.success) {
        console.warn('保存AI配置失败:', aiConfigResponse.error);
      }

      // Save global window config
      const newGwConfig = {
        enableAutoMergeDuplicates: this.elements.enableAutoMergeDuplicates?.checked ?? true,
        enableHibernation: this.elements.enableHibernation?.checked ?? true,
        hibernationThresholdMinutes: parseInt(this.elements.hibernationThreshold?.value ?? 30),
        maxHibernatedTabs: parseInt(this.elements.maxHibernatedTabs?.value ?? 50),
        duplicateDetectionMode: this.elements.duplicateDetectionMode?.value ?? 'url'
      };

      const gwConfigResponse = await chrome.runtime.sendMessage({
        action: 'updateGlobalWindowConfig',
        data: { config: newGwConfig }
      });

      if (!gwConfigResponse.success) {
        console.warn('保存多窗口配置失败:', gwConfigResponse.error);
      }

      this.showToast('设置已保存', 'success');
      this.settings = { ...this.settings, ...newSettings };
      this.aiConfig = { ...this.aiConfig, ...newAiConfig };
      this.globalWindowConfig = { ...this.globalWindowConfig, ...newGwConfig };
    } catch (error) {
      console.error('保存设置失败:', error);
      this.showToast('保存设置失败: ' + error.message, 'error');
    }
  }

  async exportData() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'exportAllData'
      });

      if (response.success) {
        const data = response.data;
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tabflow-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast('数据导出成功', 'success');
      }
    } catch (error) {
      console.error('导出数据失败:', error);
      this.showToast('导出数据失败: ' + error.message, 'error');
    }
  }

  async importData(file) {
    if (!file) return;

    if (!confirm('导入数据将覆盖当前所有设置和数据，确定要继续吗？')) {
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const response = await chrome.runtime.sendMessage({
        action: 'importAllData',
        data
      });

      if (response.success) {
        this.showToast('数据导入成功，正在重新加载...', 'success');

        // 重新加载设置
        setTimeout(() => {
          this.initialize();
        }, 1000);
      } else {
        throw new Error('导入数据失败');
      }
    } catch (error) {
      console.error('导入数据失败:', error);
      this.showToast('导入数据失败: ' + error.message, 'error');
    }
  }

  async clearAllData() {
    if (!confirm('确定要清除所有数据吗？此操作不可恢复！')) {
      return;
    }

    if (!confirm('最后确认：这将删除所有标签页数据、分组和设置，确定要继续吗？')) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'clearAllData'
      });

      if (response.success) {
        this.showToast('所有数据已清除', 'success');

        // 重置UI
        this.settings = {
          encryptNotes: false,
          excludeDomains: [],
          autoCleanupDays: 30,
          enableLogging: false,
          groupDisplayMode: 'sidebar'
        };
        this.updateUI();
      }
    } catch (error) {
      console.error('清除数据失败:', error);
      this.showToast('清除数据失败: ' + error.message, 'error');
    }
  }

  resetToDefault() {
    if (!confirm('确定要重置所有设置为默认值吗？')) {
      return;
    }

    this.settings = {
      encryptNotes: false,
      excludeDomains: [],
      autoCleanupDays: 30,
      enableLogging: false,
      groupDisplayMode: 'sidebar'
    };

    this.aiConfig = {
      enableSemanticAnalysis: true,
      enableSceneClassification: true,
      enableDomainCorrelation: true,
      enableBehaviorLearning: true,
      confidenceThreshold: 0.6,
      learningRate: 0.1
    };

    this.globalWindowConfig = {
      enableAutoMergeDuplicates: true,
      enableHibernation: true,
      hibernationThresholdMinutes: 30,
      maxHibernatedTabs: 50,
      duplicateDetectionMode: 'url'
    };

    this.updateUI();
    this.saveSettings();
  }

  normalizeSettings(rawSettings) {
    const privacy = rawSettings?.privacy || rawSettings || {};
    const autoCleanupDays = Number.parseInt(privacy.autoCleanupDays, 10);

    return {
      encryptNotes: Boolean(privacy.encryptNotes),
      excludeDomains: Array.isArray(privacy.excludeDomains) ? privacy.excludeDomains : [],
      autoCleanupDays: Number.isFinite(autoCleanupDays) ? autoCleanupDays : 30,
      enableLogging: Boolean(rawSettings?.preferences?.enableLogging),
      groupDisplayMode: rawSettings?.preferences?.groupDisplayMode === 'tab' ? 'tab' : 'sidebar'
    };
  }

  toPrivacySettingsPayload(flatSettings) {
    return {
      privacy: {
        encryptNotes: Boolean(flatSettings.encryptNotes),
        excludeDomains: Array.isArray(flatSettings.excludeDomains) ? flatSettings.excludeDomains : [],
        autoCleanupDays: Number.parseInt(flatSettings.autoCleanupDays, 10) || 0
      },
      preferences: {
        groupDisplayMode: flatSettings.groupDisplayMode === 'tab' ? 'tab' : 'sidebar'
      }
    };
  }

  openFeedback() {
    // 打开反馈页面或发送邮件
    const subject = encodeURIComponent('SuperTab 插件反馈');
    const body = encodeURIComponent('请描述您遇到的问题或建议：\n\n');
    window.open(`mailto:feedback@tabflow.com?subject=${subject}&body=${body}`);
  }

  // 导航到规则管理页面
  navigateToRules() {
    // 创建规则管理页面的容器
    const container = document.createElement('div');
    container.id = 'rules-page-container';
    container.innerHTML = '<div class="loading">加载中...</div>';

    // 清空当前页面内容
    document.body.innerHTML = '';
    document.body.appendChild(container);

    // 动态加载规则管理页面
    this.loadRulesPage();
  }

  // 加载规则管理页面
  async loadRulesPage() {
    try {
      // 加载HTML内容
      const response = await fetch(chrome.runtime.getURL('ui/rules/rules.html'));
      const html = await response.text();

      const container = document.getElementById('rules-page-container');
      const parser = new DOMParser();
      const parsed = parser.parseFromString(html, 'text/html');
      const rulesApp = parsed.querySelector('#rules-app');
      container.innerHTML = rulesApp ? rulesApp.outerHTML : html;

      // 加载CSS
      if (!document.getElementById('rules-page-styles')) {
        const link = document.createElement('link');
        link.id = 'rules-page-styles';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('ui/rules/rules.css');
        document.head.appendChild(link);
      }

      // 加载JavaScript
      const existingScript = document.getElementById('rules-page-script');
      if (existingScript) {
        existingScript.remove();
      }

      const script = document.createElement('script');
      script.id = 'rules-page-script';
      script.src = chrome.runtime.getURL('ui/rules/rules-manager.js');
      script.onload = () => {
        console.log('✅ Rules page loaded');
      };
      document.body.appendChild(script);

    } catch (error) {
      console.error('Error loading rules page:', error);
      const container = document.getElementById('rules-page-container');
      container.innerHTML = '<div class="error">加载规则管理页面失败</div>';
    }
  }

  // 返回设置页面的功能（可选）
  navigateBackToSettings() {
    // 重新加载设置页面
    location.reload();
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `tf-toast tf-toast-${type}`;
    toast.textContent = message;

    // 样式
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
      color: white;
    `;

    // 根据类型设置背景色
    switch (type) {
      case 'success':
        toast.style.background = '#28a745';
        break;
      case 'error':
        toast.style.background = '#dc3545';
        break;
      case 'warning':
        toast.style.background = '#ffc107';
        toast.style.color = '#212529';
        break;
      default:
        toast.style.background = '#6c757d';
    }

    document.body.appendChild(toast);

    // 自动移除
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }
}

// 初始化设置页面
document.addEventListener('DOMContentLoaded', () => {
  new SuperTabSettings();
});
