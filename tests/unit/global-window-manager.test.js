const { GlobalWindowManager } = require('../../supertab-extension/utils/global-window-manager');

describe('GlobalWindowManager', () => {
  let manager;

  beforeEach(() => {
    global.chrome = {
      tabs: {
        query: jest.fn(),
        get: jest.fn(),
        move: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        create: jest.fn()
      },
      windows: {
        getAll: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        get: jest.fn()
      },
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn()
        }
      },
      runtime: {
        getURL: jest.fn((path) => `chrome-extension://test/${path}`)
      }
    };
    
    manager = new GlobalWindowManager();
  });

  afterEach(() => {
    delete global.chrome;
  });

  describe('generateId', () => {
    test('should generate unique IDs', () => {
      const id1 = manager.generateId('test');
      const id2 = manager.generateId('test');
      
      expect(id1).toMatch(/^test_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^test_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateRandomColor', () => {
    test('should generate valid hex colors', () => {
      const color = manager.generateRandomColor();
      
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    test('should generate different colors', () => {
      const colors = new Set();
      for (let i = 0; i < 10; i++) {
        colors.add(manager.generateRandomColor());
      }
      
      expect(colors.size).toBeGreaterThan(1);
    });
  });

  describe('calculateRelevanceScore', () => {
    test('should calculate higher score for title start match', () => {
      const query = 'github';
      const tab1 = { title: 'GitHub Repository', url: 'https://github.com', active: false };
      const tab2 = { title: 'Visit GitHub', url: 'https://github.com', active: false };
      
      const score1 = manager.calculateRelevanceScore(tab1, query);
      const score2 = manager.calculateRelevanceScore(tab2, query);
      
      expect(score1).toBeGreaterThan(score2);
    });

    test('should give bonus to active tabs', () => {
      const query = 'test';
      const activeTab = { title: 'Test Page', url: 'https://test.com', active: true };
      const inactiveTab = { title: 'Test Page', url: 'https://test.com', active: false };
      
      const score1 = manager.calculateRelevanceScore(activeTab, query);
      const score2 = manager.calculateRelevanceScore(inactiveTab, query);
      
      expect(score1).toBeGreaterThan(score2);
    });

    test('should handle empty/null values', () => {
      const query = 'test';
      const tab = { title: null, url: undefined, active: false };
      
      const score = manager.calculateRelevanceScore(tab, query);
      
      expect(typeof score).toBe('number');
    });
  });

  describe('findDuplicateTabs', () => {
    test('should find duplicates by URL', () => {
      const tabs = [
        { id: 1, url: 'https://github.com', title: 'GitHub 1', windowId: 1 },
        { id: 2, url: 'https://github.com', title: 'GitHub 2', windowId: 1 },
        { id: 3, url: 'https://stackoverflow.com', title: 'Stack Overflow', windowId: 1 }
      ];
      
      const duplicates = manager.findDuplicateTabs(tabs, 'url');
      
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].tabs).toHaveLength(2);
    });

    test('should find duplicates by title', () => {
      const tabs = [
        { id: 1, url: 'https://github.com/user1', title: 'GitHub', windowId: 1 },
        { id: 2, url: 'https://github.com/user2', title: 'GitHub', windowId: 1 },
        { id: 3, url: 'https://stackoverflow.com', title: 'Stack Overflow', windowId: 1 }
      ];
      
      const duplicates = manager.findDuplicateTabs(tabs, 'title');
      
      expect(duplicates).toHaveLength(1);
    });

    test('should return empty array when no duplicates', () => {
      const tabs = [
        { id: 1, url: 'https://github.com', title: 'GitHub', windowId: 1 },
        { id: 2, url: 'https://stackoverflow.com', title: 'Stack Overflow', windowId: 1 }
      ];
      
      const duplicates = manager.findDuplicateTabs(tabs, 'url');
      
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('isValidTab', () => {
    test('should consider http/https tabs valid', () => {
      expect(manager.isValidTab({ url: 'https://github.com' })).toBe(true);
      expect(manager.isValidTab({ url: 'http://example.com' })).toBe(true);
    });

    test('should consider chrome tabs invalid', () => {
      expect(manager.isValidTab({ url: 'chrome://extensions' })).toBe(false);
      expect(manager.isValidTab({ url: 'chrome://newtab' })).toBe(false);
    });

    test('should consider file tabs invalid', () => {
      expect(manager.isValidTab({ url: 'file:///path/to/file' })).toBe(false);
    });

    test('should handle null/undefined url', () => {
      expect(manager.isValidTab({ url: null })).toBe(false);
      expect(manager.isValidTab({ url: undefined })).toBe(false);
      expect(manager.isValidTab({})).toBe(false);
    });
  });

  describe('shouldHibernateTab', () => {
    test('should not hibernate active tab', () => {
      const tab = {
        id: 1,
        active: true,
        lastAccessed: Date.now() - (60 * 60 * 1000),
        url: 'https://github.com'
      };
      
      const result = manager.shouldHibernateTab(tab, 30);
      
      expect(result).toBe(false);
    });

    test('should not hibernate recently accessed tab', () => {
      const tab = {
        id: 1,
        active: false,
        lastAccessed: Date.now() - (5 * 60 * 1000),
        url: 'https://github.com'
      };
      
      const result = manager.shouldHibernateTab(tab, 30);
      
      expect(result).toBe(false);
    });

    test('should hibernate old inactive tab', () => {
      const tab = {
        id: 1,
        active: false,
        lastAccessed: Date.now() - (60 * 60 * 1000),
        url: 'https://github.com'
      };
      
      const result = manager.shouldHibernateTab(tab, 30);
      
      expect(result).toBe(true);
    });

    test('should not hibernate chrome urls', () => {
      const tab = {
        id: 1,
        active: false,
        lastAccessed: Date.now() - (60 * 60 * 1000),
        url: 'chrome://extensions'
      };
      
      const result = manager.shouldHibernateTab(tab, 30);
      
      expect(result).toBe(false);
    });
  });

  describe('createWorkspace', () => {
    test('should create workspace with default values', () => {
      const tabs = [
        { id: 1, url: 'https://github.com', title: 'GitHub' },
        { id: 2, url: 'https://stackoverflow.com', title: 'Stack Overflow' }
      ];
      
      const workspace = manager.createWorkspace('My Workspace', 'Test workspace', { tabs });
      
      expect(workspace.id).toBeDefined();
      expect(workspace.name).toBe('My Workspace');
      expect(workspace.description).toBe('Test workspace');
      expect(workspace.tabs).toHaveLength(2);
      expect(workspace.createdAt).toBeDefined();
      expect(workspace.updatedAt).toBeDefined();
    });

    test('should generate color and icon', () => {
      const workspace = manager.createWorkspace('Test', '', { tabs: [] });
      
      expect(workspace.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(workspace.icon).toBeDefined();
    });
  });

  describe('stats and diagnostics', () => {
    test('getStats should return statistics object', () => {
      const stats = manager.getStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalWindows).toBeDefined();
      expect(stats.totalTabs).toBeDefined();
      expect(stats.hibernatedTabs).toBeDefined();
      expect(stats.workspaces).toBeDefined();
    });

    test('getDiagnostics should return diagnostics info', () => {
      const diagnostics = manager.getDiagnostics();
      
      expect(diagnostics).toBeDefined();
      expect(diagnostics.status).toBeDefined();
      expect(diagnostics.errors).toBeDefined();
      expect(diagnostics.warnings).toBeDefined();
    });
  });

  describe('metadata handling', () => {
    test('getMetadataKey should return correct key', () => {
      const tab = { url: 'https://github.com/user/repo', title: 'GitHub' };
      
      const key = manager.getMetadataKey(tab);
      
      expect(key).toBe('github.com');
    });

    test('getMetadataKey should handle chrome urls', () => {
      const tab = { url: 'chrome://extensions', title: 'Extensions' };
      
      const key = manager.getMetadataKey(tab);
      
      expect(key).toBe('chrome_extensions');
    });

    test('should store and retrieve metadata', () => {
      const tab = { id: 1, url: 'https://github.com', title: 'GitHub' };
      const metadata = { customData: 'test' };
      
      manager.setMetadata(tab, metadata);
      const retrieved = manager.getMetadata(tab);
      
      expect(retrieved).toEqual(metadata);
    });
  });
});
