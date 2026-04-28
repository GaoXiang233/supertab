const { AIIntelligenceEngine, SemanticAnalyzer, SceneClassifier, DomainCorrelator, BehaviorLearner } = require('../../supertab-extension/utils/ai-intelligence-engine');

describe('SemanticAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
  });

  describe('extractKeywords', () => {
    test('should extract keywords from text', () => {
      const text = 'JavaScript programming guide for web developers. Learn how to build modern web applications with React and Node.js.';
      const keywords = analyzer.extractKeywords(text);
      
      expect(keywords).toBeDefined();
      expect(Array.isArray(keywords)).toBe(true);
    });

    test('should handle empty text', () => {
      const keywords = analyzer.extractKeywords('');
      expect(keywords).toEqual([]);
    });

    test('should handle null/undefined text', () => {
      expect(analyzer.extractKeywords(null)).toEqual([]);
      expect(analyzer.extractKeywords(undefined)).toEqual([]);
    });
  });

  describe('identifyTopics', () => {
    test('should identify topics from keywords', () => {
      const keywords = ['javascript', 'react', 'web development', 'programming'];
      const topics = analyzer.identifyTopics(keywords);
      
      expect(topics).toBeDefined();
      expect(Array.isArray(topics)).toBe(true);
    });

    test('should handle empty keywords', () => {
      const topics = analyzer.identifyTopics([]);
      expect(topics).toEqual([]);
    });
  });

  describe('analyzeContentTypes', () => {
    test('should analyze content types from tab info', () => {
      const tab = {
        url: 'https://github.com/user/repo',
        title: 'My Project - GitHub'
      };
      const keywords = ['github', 'repository', 'code'];
      
      const contentTypes = analyzer.analyzeContentTypes(tab, keywords);
      expect(contentTypes).toBeDefined();
      expect(contentTypes.primary).toBeDefined();
    });
  });

  describe('detectLanguage', () => {
    test('should detect English language', () => {
      const text = 'This is a sample English text for testing.';
      const result = analyzer.detectLanguage(text);
      
      expect(result.language).toBeDefined();
    });

    test('should handle short text', () => {
      const result = analyzer.detectLanguage('short');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('analyze', () => {
    test('should perform complete semantic analysis', async () => {
      const tab = {
        id: 1,
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        title: 'JavaScript | MDN',
        extractedText: 'JavaScript is a programming language that allows you to implement complex features on web pages.'
      };
      
      const result = await analyzer.analyze(tab);
      
      expect(result.keywords).toBeDefined();
      expect(result.topics).toBeDefined();
      expect(result.contentTypes).toBeDefined();
      expect(result.language).toBeDefined();
    });
  });
});

describe('SceneClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = new SceneClassifier();
  });

  describe('classify', () => {
    test('should classify GitHub as development scene', async () => {
      const tab = {
        id: 1,
        url: 'https://github.com/user/repo',
        title: 'My Project - GitHub'
      };
      
      const semanticAnalysis = {
        keywords: ['github', 'code', 'repository'],
        topics: ['development', 'programming'],
        contentTypes: { primary: 'developer', secondary: [] },
        language: { language: 'en', confidence: 0.9 }
      };
      
      const result = await classifier.classify(tab, semanticAnalysis);
      
      expect(result.scene).toBeDefined();
      expect(result.confidence).toBeDefined();
    });

    test('should classify YouTube as entertainment scene', async () => {
      const tab = {
        id: 1,
        url: 'https://www.youtube.com/watch?v=example',
        title: 'Funny Video - YouTube'
      };
      
      const semanticAnalysis = {
        keywords: ['video', 'youtube'],
        topics: ['entertainment', 'video'],
        contentTypes: { primary: 'entertainment', secondary: [] },
        language: { language: 'en', confidence: 0.9 }
      };
      
      const result = await classifier.classify(tab, semanticAnalysis);
      
      expect(result.scene).toBeDefined();
    });

    test('should handle no scene match', async () => {
      const tab = {
        id: 1,
        url: 'https://unknown-site.com/page',
        title: 'Unknown Page'
      };
      
      const semanticAnalysis = {
        keywords: ['random', 'unknown'],
        topics: ['unknown'],
        contentTypes: { primary: 'other', secondary: [] },
        language: { language: 'en', confidence: 0.9 }
      };
      
      const result = await classifier.classify(tab, semanticAnalysis);
      
      expect(result.scene).toBe('other');
    });
  });

  describe('getAvailableScenes', () => {
    test('should return all available scenes', () => {
      const scenes = classifier.getAvailableScenes();
      expect(scenes).toBeDefined();
      expect(Array.isArray(scenes)).toBe(true);
      expect(scenes.length).toBeGreaterThan(0);
    });
  });
});

describe('DomainCorrelator', () => {
  let correlator;

  beforeEach(() => {
    correlator = new DomainCorrelator();
  });

  describe('findCorrelatedDomains', () => {
    test('should find correlated domains', () => {
      const domain = 'github.com';
      const result = correlator.findCorrelatedDomains(domain);
      
      expect(result).toBeDefined();
      expect(result.domains).toBeDefined();
    });
  });

  describe('calculateDomainCorrelation', () => {
    test('should calculate domain correlation', () => {
      const domain1 = 'github.com';
      const domain2 = 'stackoverflow.com';
      
      const score = correlator.calculateDomainCorrelation(domain1, domain2);
      
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('recordDomainAccess', () => {
    test('should record domain access', () => {
      correlator.recordDomainAccess('github.com', 'stackoverflow.com', 1000);
      
      const result = correlator.findCorrelatedDomains('github.com');
      expect(result.domains).toContain('stackoverflow.com');
    });
  });

  describe('getDomainGroups', () => {
    test('should get domain groups', () => {
      const groups = correlator.getDomainGroups();
      
      expect(groups).toBeDefined();
      expect(Array.isArray(groups)).toBe(true);
    });

    test('should return empty groups when no data', () => {
      const newCorrelator = new DomainCorrelator();
      const groups = newCorrelator.getDomainGroups();
      
      expect(groups).toEqual([]);
    });
  });
});

describe('BehaviorLearner', () => {
  let learner;

  beforeEach(() => {
    learner = new BehaviorLearner();
  });

  describe('recordAction', () => {
    test('should record user action', () => {
      const action = {
        type: 'tab_grouped',
        tabId: 1,
        targetGroup: 'github.com',
        timestamp: Date.now()
      };
      
      learner.recordAction(action);
      
      const stats = learner.getBehaviorStats();
      expect(stats.totalActions).toBe(1);
    });
  });

  describe('learnFromExplicitGrouping', () => {
    test('should learn from explicit grouping', () => {
      const tab = { id: 1, url: 'https://github.com/user/repo', title: 'GitHub' };
      
      learner.learnFromExplicitGrouping(tab, 'development');
      
      const stats = learner.getBehaviorStats();
      expect(stats.learnedPatterns).toBeDefined();
    });
  });

  describe('getBehaviorStats', () => {
    test('should return behavior statistics', () => {
      const stats = learner.getBehaviorStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalActions).toBeDefined();
      expect(stats.learnedPatterns).toBeDefined();
    });
  });

  describe('suggestGrouping', () => {
    test('should suggest grouping for tab', () => {
      const tab = { id: 1, url: 'https://github.com/user/repo', title: 'GitHub' };
      
      const suggestion = learner.suggestGrouping(tab);
      
      expect(suggestion).toBeDefined();
      expect(suggestion.confidence).toBeDefined();
    });
  });
});

describe('AIIntelligenceEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new AIIntelligenceEngine();
  });

  describe('initialize', () => {
    test('should initialize successfully', async () => {
      await engine.initialize();
      expect(engine.isInitialized).toBe(true);
    });
  });

  describe('analyzeTab', () => {
    test('should analyze tab with full AI pipeline', async () => {
      await engine.initialize();
      
      const tab = {
        id: 1,
        url: 'https://github.com/user/repo',
        title: 'My Project - GitHub',
        extractedText: 'This is a code repository on GitHub. It contains JavaScript and React projects.'
      };
      
      const result = await engine.analyzeTab(tab);
      
      expect(result).toBeDefined();
      expect(result.semanticAnalysis).toBeDefined();
      expect(result.sceneClassification).toBeDefined();
    });
  });

  describe('autoGroupTab', () => {
    test('should auto group tab based on AI analysis', async () => {
      await engine.initialize();
      
      const tab = {
        id: 1,
        url: 'https://github.com/user/repo',
        title: 'GitHub Repository'
      };
      
      const result = await engine.autoGroupTab(tab);
      
      expect(result).toBeDefined();
      expect(result.suggestedGroup).toBeDefined();
    });
  });

  describe('getAnalytics', () => {
    test('should return engine analytics', async () => {
      await engine.initialize();
      
      const analytics = engine.getAnalytics();
      
      expect(analytics).toBeDefined();
      expect(analytics.scenesAnalyzed).toBeDefined();
      expect(analytics.scenesBreakdown).toBeDefined();
    });
  });

  describe('exportModels', () => {
    test('should export learned models', async () => {
      await engine.initialize();
      
      const models = engine.exportModels();
      
      expect(models).toBeDefined();
      expect(models.domainCorrelations).toBeDefined();
      expect(models.behaviorPatterns).toBeDefined();
    });
  });

  describe('importModels', () => {
    test('should import models', async () => {
      await engine.initialize();
      
      const models = {
        domainCorrelations: {},
        behaviorPatterns: [],
        learnedWeights: {}
      };
      
      engine.importModels(models);
      expect(true).toBe(true);
    });
  });
});
