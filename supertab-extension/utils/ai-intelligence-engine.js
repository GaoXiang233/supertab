/**
 * AIIntelligenceEngine - AI智能理解引擎核心类
 * 
 * 负责：
 * - 语义分析和主题识别
 * - 场景意图智能分类
 * - 跨域名关联归类
 * - 用户行为学习与规则优化
 */

class AIIntelligenceEngine {
  constructor(storageManager, eventBus) {
    this.storageManager = storageManager;
    this.eventBus = eventBus;
    this.semanticAnalyzer = null;
    this.sceneClassifier = null;
    this.domainCorrelator = null;
    this.behaviorLearner = null;
    this.initialized = false;
    this.config = {
      enableSemanticAnalysis: true,
      enableSceneClassification: true,
      enableDomainCorrelation: true,
      enableBehaviorLearning: true,
      confidenceThreshold: 0.6,
      learningRate: 0.1
    };

    console.log('🔧 AIIntelligenceEngine constructed');
  }

  /**
   * 初始化AI引擎
   */
  async initialize() {
    if (this.initialized) {
      console.log('⚠️ AIIntelligenceEngine already initialized');
      return;
    }

    try {
      console.log('🔧 AIIntelligenceEngine initializing...');

      await this.loadConfig();

      if (this.config.enableSemanticAnalysis) {
        this.semanticAnalyzer = new SemanticAnalyzer();
      }

      if (this.config.enableSceneClassification) {
        this.sceneClassifier = new SceneClassifier();
      }

      if (this.config.enableDomainCorrelation) {
        this.domainCorrelator = new DomainCorrelator(this.storageManager);
        await this.domainCorrelator.initialize();
      }

      if (this.config.enableBehaviorLearning) {
        this.behaviorLearner = new BehaviorLearner(this.storageManager, this.eventBus);
        await this.behaviorLearner.initialize();
      }

      this.initialized = true;
      console.log('✅ AIIntelligenceEngine initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize AIIntelligenceEngine:', error);
      throw error;
    }
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      const savedConfig = await this.storageManager.getMetadata('aiConfig');
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      }
    } catch (error) {
      console.warn('⚠️ Failed to load AI config, using defaults:', error);
    }
  }

  /**
   * 保存配置
   */
  async saveConfig() {
    try {
      await this.storageManager.saveMetadata('aiConfig', this.config);
      console.log('✅ AI config saved');
    } catch (error) {
      console.error('❌ Failed to save AI config:', error);
    }
  }

  /**
   * 分析标签页内容并生成智能分类
   * @param {Object} tab - 标签页对象
   * @returns {Object} 分析结果
   */
  async analyzeTab(tab) {
    const result = {
      tabUuid: tab.uuid || tab.id,
      title: tab.title,
      url: tab.url,
      timestamp: Date.now(),
      semanticAnalysis: null,
      sceneClassification: null,
      domainCorrelation: null,
      suggestedGroup: null
    };

    try {
      if (this.config.enableSemanticAnalysis && this.semanticAnalyzer) {
        result.semanticAnalysis = this.semanticAnalyzer.analyze(tab);
      }

      if (this.config.enableSceneClassification && this.sceneClassifier) {
        result.sceneClassification = this.sceneClassifier.classify(tab, result.semanticAnalysis);
      }

      if (this.config.enableDomainCorrelation && this.domainCorrelator) {
        result.domainCorrelation = await this.domainCorrelator.analyze(tab);
      }

      result.suggestedGroup = this.generateSuggestedGroup(result);

      if (this.config.enableBehaviorLearning && this.behaviorLearner) {
        await this.behaviorLearner.recordTabAnalysis(tab, result);
      }

      console.log(`✅ Tab analyzed: ${tab.title}`, result);
      return result;
    } catch (error) {
      console.error('❌ Error analyzing tab:', error);
      return result;
    }
  }

  /**
   * 生成建议的分组
   */
  generateSuggestedGroup(analysisResult) {
    const suggestions = [];

    if (analysisResult.sceneClassification && 
        analysisResult.sceneClassification.confidence >= this.config.confidenceThreshold) {
      suggestions.push({
        type: 'scene',
        name: analysisResult.sceneClassification.scene,
        confidence: analysisResult.sceneClassification.confidence,
        source: 'scene_classification'
      });
    }

    if (analysisResult.domainCorrelation && 
        analysisResult.domainCorrelation.relatedDomains.length > 0) {
      const topRelated = analysisResult.domainCorrelation.relatedDomains[0];
      suggestions.push({
        type: 'domain_correlation',
        name: topRelated.domain,
        confidence: topRelated.correlation,
        source: 'domain_correlation'
      });
    }

    if (analysisResult.semanticAnalysis && analysisResult.semanticAnalysis.topics.length > 0) {
      const mainTopic = analysisResult.semanticAnalysis.topics[0];
      suggestions.push({
        type: 'topic',
        name: mainTopic.word,
        confidence: mainTopic.score,
        source: 'semantic_analysis'
      });
    }

    if (suggestions.length === 0) {
      return null;
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);
    return suggestions[0];
  }

  /**
   * 批量分析标签页
   */
  async analyzeTabs(tabs) {
    const results = [];
    for (const tab of tabs) {
      const result = await this.analyzeTab(tab);
      results.push(result);
    }
    return results;
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
    console.log('✅ AI config updated');
  }

  /**
   * 获取行为学习统计
   */
  getBehaviorStats() {
    if (this.behaviorLearner) {
      return this.behaviorLearner.getStats();
    }
    return null;
  }

  /**
   * 获取域关联统计
   */
  getDomainCorrelationStats() {
    if (this.domainCorrelator) {
      return this.domainCorrelator.getStats();
    }
    return null;
  }
}

/**
 * SemanticAnalyzer - 语义分析模块
 * 
 * 负责：
 * - 关键词提取
 * - 主题识别
 * - 内容类型分析
 */
class SemanticAnalyzer {
  constructor() {
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
      'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are',
      'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
      'does', 'did', 'will', 'would', 'could', 'should', 'may',
      'might', 'must', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
      'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'all',
      'each', 'every', 'both', 'few', 'more', 'most', 'other',
      'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
      'so', 'than', 'too', 'very', 'just', 'also', 'now', 'new',
      '首页', '登录', '注册', '搜索', '帮助', '关于', '我们',
      '我的', '你的', '他的', '她的', '它的', '的', '了', '是',
      '在', '和', '与', '或', '但', '而', '也', '都', '就',
      '又', '还', '再', '已', '被', '把', '让', '给', '到',
      '从', '向', '对', '于', '为', '以', '及', '等', '着',
      '过', '地', '得', '啊', '吧', '呢', '吗', '呀', '哦'
    ]);

    console.log('🔧 SemanticAnalyzer initialized');
  }

  /**
   * 分析标签页内容
   */
  analyze(tab) {
    const result = {
      keywords: [],
      topics: [],
      contentTypes: [],
      language: this.detectLanguage(tab.title || ''),
      confidence: 0
    };

    const text = this.extractTextFromTab(tab);
    if (!text || text.length < 3) {
      return result;
    }

    result.keywords = this.extractKeywords(text);
    result.topics = this.identifyTopics(result.keywords);
    result.contentTypes = this.analyzeContentTypes(tab, result.keywords);
    result.confidence = this.calculateConfidence(result);

    return result;
  }

  /**
   * 从标签页提取文本
   */
  extractTextFromTab(tab) {
    const parts = [];
    if (tab.title) parts.push(tab.title);
    if (tab.url) {
      try {
        const urlObj = new URL(tab.url);
        parts.push(urlObj.pathname.replace(/[\/\-_\.]/g, ' '));
      } catch (e) {}
    }
    return parts.join(' ');
  }

  /**
   * 提取关键词
   */
  extractKeywords(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
      .split(/\s+/)
      .filter(word => {
        if (word.length < 2) return false;
        if (this.stopWords.has(word.toLowerCase())) return false;
        return true;
      });

    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    return Object.entries(wordFreq)
      .map(([word, freq]) => ({ word, freq }))
      .sort((a, b) => b.freq - a.freq)
      .slice(0, 10);
  }

  /**
   * 识别主题
   */
  identifyTopics(keywords) {
    return keywords.slice(0, 5).map((kw, index) => ({
      word: kw.word,
      score: kw.freq / Math.max(1, keywords[0]?.freq || 1),
      rank: index + 1
    }));
  }

  /**
   * 分析内容类型
   */
  analyzeContentTypes(tab, keywords) {
    const types = [];
    const url = tab.url || '';
    const title = (tab.title || '').toLowerCase();
    const keywordWords = keywords.map(k => k.word);

    const typePatterns = {
      article: {
        patterns: ['blog', 'article', '新闻', '文章', '教程', 'guide', 'tutorial', 'how-to'],
        indicators: ['read', '阅读', '分享', 'comment', '评论']
      },
      video: {
        patterns: ['video', '视频', 'watch', '观看', 'youtube', 'bilibili', 'youku'],
        indicators: ['播放', 'play', 'episode', '集']
      },
      shopping: {
        patterns: ['shop', '购物', 'store', '商城', 'buy', '购买', 'product', '商品', 'amazon', 'taobao', 'jd', 'pinduoduo'],
        indicators: ['价格', 'price', '¥', '$', 'cart', '购物车', 'checkout', '结算']
      },
      social: {
        patterns: ['social', '社交', 'facebook', 'twitter', 'weibo', 'wechat', 'linkedin', 'instagram', 'reddit'],
        indicators: ['friend', '朋友', 'follow', '关注', 'like', '点赞', 'share', '分享', 'post', '帖子']
      },
      development: {
        patterns: ['dev', '开发', 'code', '代码', 'program', '编程', 'github', 'gitlab', 'stackoverflow', 'developer', 'api', 'documentation'],
        indicators: ['function', 'class', 'import', 'export', 'npm', 'pip', 'maven', 'gradle']
      },
      learning: {
        patterns: ['learn', '学习', 'course', '课程', 'education', '教育', 'training', '培训', 'school', '学校', 'university', '大学'],
        indicators: ['exam', '考试', 'quiz', '测验', 'lesson', '课', 'chapter', '章节']
      },
      work: {
        patterns: ['work', '工作', 'office', '办公', 'email', '邮件', 'meeting', '会议', 'calendar', '日历', 'slack', 'teams', 'notion'],
        indicators: ['deadline', '截止', 'task', '任务', 'project', '项目']
      },
      entertainment: {
        patterns: ['game', '游戏', 'play', '玩', 'music', '音乐', 'movie', '电影', 'entertainment', '娱乐'],
        indicators: ['level', '关卡', 'score', '分数', 'rank', '排名']
      },
      finance: {
        patterns: ['finance', '金融', 'bank', '银行', 'stock', '股票', 'fund', '基金', 'investment', '投资', 'trading', '交易'],
        indicators: ['price', '价格', 'market', '市场', 'trade', '交易']
      },
      news: {
        patterns: ['news', '新闻', 'media', '媒体', 'headline', '头条', 'report', '报道'],
        indicators: ['breaking', '突发', 'live', '直播', 'update', '更新']
      }
    };

    for (const [type, config] of Object.entries(typePatterns)) {
      let score = 0;

      for (const pattern of config.patterns) {
        if (title.includes(pattern.toLowerCase())) {
          score += 0.3;
        }
        if (url.toLowerCase().includes(pattern.toLowerCase())) {
          score += 0.4;
        }
        if (keywordWords.includes(pattern.toLowerCase())) {
          score += 0.3;
        }
      }

      for (const indicator of config.indicators) {
        if (title.includes(indicator.toLowerCase())) {
          score += 0.1;
        }
        if (keywordWords.includes(indicator.toLowerCase())) {
          score += 0.1;
        }
      }

      if (score > 0) {
        types.push({
          type,
          score: Math.min(score, 1.0)
        });
      }
    }

    return types.sort((a, b) => b.score - a.score);
  }

  /**
   * 检测语言
   */
  detectLanguage(text) {
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    const englishChars = text.match(/[a-zA-Z]/g) || [];

    if (chineseChars.length > englishChars.length * 0.5) {
      return 'zh';
    }
    return 'en';
  }

  /**
   * 计算置信度
   */
  calculateConfidence(result) {
    let score = 0;
    let maxScore = 0;

    if (result.keywords.length > 0) {
      score += Math.min(result.keywords.length, 5) * 0.1;
      maxScore += 0.5;
    }

    if (result.topics.length > 0) {
      score += result.topics[0].score * 0.3;
      maxScore += 0.3;
    }

    if (result.contentTypes.length > 0) {
      score += result.contentTypes[0].score * 0.2;
      maxScore += 0.2;
    }

    return maxScore > 0 ? score / maxScore : 0;
  }
}

/**
 * SceneClassifier - 场景意图分类器
 * 
 * 负责：
 * - 按工作、学习、娱乐、开发、购物等场景分类
 * - 基于内容和行为的智能分类
 */
class SceneClassifier {
  constructor() {
    this.sceneDefinitions = {
      work: {
        name: '工作',
        icon: '💼',
        color: '#3498db',
        keywords: ['work', '工作', 'office', '办公', 'email', '邮件', 'meeting', '会议', 
                   'slack', 'teams', 'notion', 'confluence', 'jira', 'trello', 'asana',
                   'calendar', '日历', 'schedule', '日程', 'deadline', '截止', 'task', '任务'],
        domains: ['linkedin.com', 'gmail.com', 'outlook.com', 'office.com', 'slack.com',
                  'notion.so', 'asana.com', 'trello.com', 'atlassian.com', 'zoom.us',
                  'teams.microsoft.com', 'calendar.google.com']
      },
      learning: {
        name: '学习',
        icon: '📚',
        color: '#2ecc71',
        keywords: ['learn', '学习', 'course', '课程', 'education', '教育', 'training', '培训',
                   'tutorial', '教程', 'guide', '指南', 'documentation', '文档', 'school', '学校',
                   'university', '大学', 'college', '学院', 'exam', '考试', 'quiz', '测验',
                   'mooc', '网课', '在线课程'],
        domains: ['coursera.org', 'edx.org', 'udemy.com', 'khanacademy.org', 'codecademy.com',
                  'freecodecamp.org', 'w3schools.com', 'zhihu.com', 'jianshu.com', 'csdn.net',
                  'segmentfault.com', '掘金', 'juejin.cn']
      },
      development: {
        name: '开发',
        icon: '💻',
        color: '#9b59b6',
        keywords: ['code', '代码', 'program', '编程', 'develop', '开发', 'debug', '调试',
                   'build', '构建', 'deploy', '部署', 'api', 'interface', '接口',
                   'function', '函数', 'class', '类', 'module', '模块', 'library', '库',
                   'framework', '框架', 'npm', 'pip', 'maven', 'gradle', 'docker', 'kubernetes'],
        domains: ['github.com', 'gitlab.com', 'stackoverflow.com', 'npmjs.com', 'pypi.org',
                  'docker.com', 'kubernetes.io', 'vercel.com', 'netlify.com', 'cloudflare.com',
                  'aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com']
      },
      shopping: {
        name: '购物',
        icon: '🛒',
        color: '#e74c3c',
        keywords: ['shop', '购物', 'buy', '购买', 'store', '商城', 'product', '商品',
                   'price', '价格', 'cart', '购物车', 'checkout', '结算', 'order', '订单',
                   'discount', '优惠', 'coupon', '优惠券', 'sale', '促销', 'deal', '交易'],
        domains: ['amazon.com', 'taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com',
                  'ebay.com', 'aliexpress.com', 'shopify.com', 'etsy.com', 'bestbuy.com',
                  'walmart.com', 'target.com']
      },
      entertainment: {
        name: '娱乐',
        icon: '🎮',
        color: '#f39c12',
        keywords: ['game', '游戏', 'play', '玩', 'video', '视频', 'movie', '电影',
                   'music', '音乐', 'song', '歌曲', 'streaming', '流媒体', 'live', '直播',
                   'tv', '电视', 'show', '节目', 'entertainment', '娱乐', '休闲', 'relax'],
        domains: ['youtube.com', 'bilibili.com', 'youku.com', 'iqiyi.com', 'tencent.com',
                  'netflix.com', 'hulu.com', 'disneyplus.com', 'spotify.com', 'music.163.com',
                  'qq.com', 'zhihu.com', 'weibo.com', 'twitter.com', 'instagram.com',
                  'reddit.com', 'tiktok.com', 'douyin.com']
      },
      social: {
        name: '社交',
        icon: '👥',
        color: '#1abc9c',
        keywords: ['social', '社交', 'friend', '朋友', 'follow', '关注', 'like', '点赞',
                   'share', '分享', 'post', '帖子', 'comment', '评论', 'message', '消息',
                   'chat', '聊天', 'community', '社区', 'forum', '论坛'],
        domains: ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'reddit.com',
                  'weibo.com', 'weixin.qq.com', 'qq.com', 'zhihu.com', 'douban.com',
                  'tieba.baidu.com', 'discord.com', 'telegram.org', 'whatsapp.com']
      },
      finance: {
        name: '金融',
        icon: '💰',
        color: '#27ae60',
        keywords: ['finance', '金融', 'bank', '银行', 'stock', '股票', 'fund', '基金',
                   'investment', '投资', 'trading', '交易', 'market', '市场', 'price', '价格',
                   'crypto', '加密货币', 'bitcoin', '比特币', 'ethereum', '以太坊',
                   'wallet', '钱包', 'payment', '支付', 'transfer', '转账'],
        domains: ['finance.yahoo.com', 'bloomberg.com', 'reuters.com', 'wsj.com',
                  'ft.com', 'cnbc.com', 'investopedia.com', 'tradingview.com',
                  'coinbase.com', 'binance.com', 'huobi.com', 'okex.com']
      },
      news: {
        name: '新闻',
        icon: '📰',
        color: '#34495e',
        keywords: ['news', '新闻', 'media', '媒体', 'headline', '头条', 'report', '报道',
                   'breaking', '突发', 'live', '直播', 'update', '更新', 'daily', '日报',
                   'weekly', '周刊', 'magazine', '杂志', 'journal', '期刊'],
        domains: ['cnn.com', 'bbc.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com',
                  'reuters.com', 'apnews.com', 'bloomberg.com', 'wsj.com', 'ft.com',
                  'ifeng.com', 'sina.com.cn', '163.com', 'qq.com', 'sohu.com']
      }
    };

    console.log('🔧 SceneClassifier initialized');
  }

  /**
   * 分类标签页到场景
   */
  classify(tab, semanticAnalysis = null) {
    const result = {
      scene: null,
      confidence: 0,
      scores: {},
      matchedKeywords: [],
      matchedDomains: []
    };

    const url = tab.url || '';
    const title = (tab.title || '').toLowerCase();
    let domain = '';

    try {
      domain = new URL(url).hostname;
    } catch (e) {}

    for (const [sceneKey, scene] of Object.entries(this.sceneDefinitions)) {
      let score = 0;
      const matchedKeywords = [];
      const matchedDomains = [];

      for (const keyword of scene.keywords) {
        const keywordLower = keyword.toLowerCase();
        if (title.includes(keywordLower)) {
          score += 0.15;
          matchedKeywords.push(keyword);
        }
        if (url.toLowerCase().includes(keywordLower)) {
          score += 0.1;
          matchedKeywords.push(keyword);
        }
      }

      for (const sceneDomain of scene.domains) {
        if (domain.includes(sceneDomain) || sceneDomain.includes(domain)) {
          score += 0.4;
          matchedDomains.push(sceneDomain);
        }
      }

      if (semanticAnalysis && semanticAnalysis.contentTypes) {
        const contentTypeMatch = semanticAnalysis.contentTypes.find(ct => ct.type === sceneKey);
        if (contentTypeMatch) {
          score += contentTypeMatch.score * 0.2;
        }
      }

      result.scores[sceneKey] = Math.min(score, 1.0);

      if (matchedKeywords.length > 0 || matchedDomains.length > 0) {
        result.matchedKeywords.push(...matchedKeywords);
        result.matchedDomains.push(...matchedDomains);
      }
    }

    const sortedScenes = Object.entries(result.scores)
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1]);

    if (sortedScenes.length > 0) {
      result.scene = sortedScenes[0][0];
      result.confidence = sortedScenes[0][1];
      result.sceneInfo = this.sceneDefinitions[result.scene];
    }

    return result;
  }

  /**
   * 获取场景定义
   */
  getSceneDefinitions() {
    return { ...this.sceneDefinitions };
  }

  /**
   * 获取指定场景信息
   */
  getSceneInfo(sceneKey) {
    return this.sceneDefinitions[sceneKey] || null;
  }
}

/**
 * DomainCorrelator - 跨域名关联分析器
 * 
 * 负责：
 * - 分析域名之间的关联关系
 * - 基于用户行为和内容相似度进行关联
 * - 支持跨域名归类
 */
class DomainCorrelator {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.domainRelations = new Map();
    this.domainVisits = new Map();
    this.domainContext = new Map();
    this.maxRelationsPerDomain = 10;
    this.correlationThreshold = 0.3;

    console.log('🔧 DomainCorrelator initialized');
  }

  /**
   * 初始化
   */
  async initialize() {
    try {
      const savedData = await this.storageManager.getMetadata('domainCorrelations');
      if (savedData) {
        if (savedData.relations) {
          this.domainRelations = new Map(Object.entries(savedData.relations));
        }
        if (savedData.visits) {
          this.domainVisits = new Map(Object.entries(savedData.visits));
        }
        if (savedData.context) {
          this.domainContext = new Map(Object.entries(savedData.context));
        }
      }
      console.log('✅ DomainCorrelator loaded saved data');
    } catch (error) {
      console.warn('⚠️ Failed to load domain correlations:', error);
    }
  }

  /**
   * 保存数据
   */
  async save() {
    try {
      const data = {
        relations: Object.fromEntries(this.domainRelations),
        visits: Object.fromEntries(this.domainVisits),
        context: Object.fromEntries(this.domainContext)
      };
      await this.storageManager.saveMetadata('domainCorrelations', data);
    } catch (error) {
      console.error('❌ Failed to save domain correlations:', error);
    }
  }

  /**
   * 分析标签页的域关联
   */
  async analyze(tab) {
    const result = {
      currentDomain: '',
      relatedDomains: [],
      context: null,
      suggestedGroup: null
    };

    let domain = '';
    try {
      domain = new URL(tab.url).hostname;
      result.currentDomain = domain;
    } catch (e) {
      return result;
    }

    this.recordDomainVisit(domain, tab);

    this.updateContext(domain, tab);

    result.relatedDomains = this.findRelatedDomains(domain);

    result.context = this.domainContext.get(domain) || null;

    if (result.relatedDomains.length > 0) {
      const topRelated = result.relatedDomains[0];
      result.suggestedGroup = {
        domain: topRelated.domain,
        correlation: topRelated.correlation,
        reason: topRelated.reason
      };
    }

    await this.save();

    return result;
  }

  /**
   * 记录域名访问
   */
  recordDomainVisit(domain, tab) {
    if (!this.domainVisits.has(domain)) {
      this.domainVisits.set(domain, {
        count: 0,
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        tabs: []
      });
    }

    const visitData = this.domainVisits.get(domain);
    visitData.count++;
    visitData.lastVisit = Date.now();
    visitData.tabs.push({
      uuid: tab.uuid,
      title: tab.title,
      url: tab.url,
      timestamp: Date.now()
    });

    if (visitData.tabs.length > 100) {
      visitData.tabs = visitData.tabs.slice(-50);
    }
  }

  /**
   * 更新域上下文
   */
  updateContext(domain, tab) {
    if (!this.domainContext.has(domain)) {
      this.domainContext.set(domain, {
        keywords: new Set(),
        titles: [],
        averageVisitDuration: 0,
        totalVisits: 0
      });
    }

    const context = this.domainContext.get(domain);
    context.totalVisits++;

    if (tab.title) {
      context.titles.push(tab.title);
      if (context.titles.length > 20) {
        context.titles = context.titles.slice(-20);
      }

      const words = tab.title.toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2);

      words.forEach(word => context.keywords.add(word));
    }
  }

  /**
   * 查找关联域名
   */
  findRelatedDomains(targetDomain) {
    const related = [];

    for (const [domain, relations] of this.domainRelations.entries()) {
      if (domain === targetDomain) continue;

      for (const rel of relations) {
        if (rel.target === targetDomain && rel.correlation >= this.correlationThreshold) {
          related.push({
            domain,
            correlation: rel.correlation,
            reason: rel.reason,
            lastUpdated: rel.lastUpdated
          });
        }
      }
    }

    const targetRelations = this.domainRelations.get(targetDomain) || [];
    for (const rel of targetRelations) {
      if (rel.correlation >= this.correlationThreshold) {
        const existing = related.find(r => r.domain === rel.target);
        if (!existing) {
          related.push({
            domain: rel.target,
            correlation: rel.correlation,
            reason: rel.reason,
            lastUpdated: rel.lastUpdated
          });
        } else if (rel.correlation > existing.correlation) {
          existing.correlation = rel.correlation;
          existing.reason = rel.reason;
        }
      }
    }

    const keywordBased = this.findRelatedByKeywords(targetDomain);
    for (const kb of keywordBased) {
      const existing = related.find(r => r.domain === kb.domain);
      if (!existing) {
        related.push(kb);
      } else if (kb.correlation > existing.correlation) {
        existing.correlation = kb.correlation;
        existing.reason = kb.reason;
      }
    }

    return related
      .sort((a, b) => b.correlation - a.correlation)
      .slice(0, this.maxRelationsPerDomain);
  }

  /**
   * 基于关键词查找关联域名
   */
  findRelatedByKeywords(targetDomain) {
    const targetContext = this.domainContext.get(targetDomain);
    if (!targetContext || targetContext.keywords.size === 0) {
      return [];
    }

    const related = [];
    const targetKeywords = targetContext.keywords;

    for (const [domain, context] of this.domainContext.entries()) {
      if (domain === targetDomain) continue;

      let commonKeywords = 0;
      const matchedKeywords = [];

      for (const keyword of targetKeywords) {
        if (context.keywords.has(keyword)) {
          commonKeywords++;
          matchedKeywords.push(keyword);
        }
      }

      if (commonKeywords > 0) {
        const correlation = commonKeywords / Math.max(targetKeywords.size, context.keywords.size);
        if (correlation >= this.correlationThreshold) {
          related.push({
            domain,
            correlation,
            reason: `shared_keywords: ${matchedKeywords.slice(0, 3).join(', ')}`,
            lastUpdated: Date.now()
          });
        }
      }
    }

    return related;
  }

  /**
   * 记录两个域名之间的关联
   */
  recordDomainRelation(sourceDomain, targetDomain, reason = 'user_behavior', initialCorrelation = 0.5) {
    if (!this.domainRelations.has(sourceDomain)) {
      this.domainRelations.set(sourceDomain, []);
    }

    const relations = this.domainRelations.get(sourceDomain);
    const existing = relations.find(r => r.target === targetDomain);

    if (existing) {
      existing.correlation = Math.min(1.0, existing.correlation + 0.1);
      existing.lastUpdated = Date.now();
      existing.count = (existing.count || 1) + 1;
    } else {
      relations.push({
        target: targetDomain,
        correlation: initialCorrelation,
        reason,
        count: 1,
        lastUpdated: Date.now()
      });
    }

    relations.sort((a, b) => b.correlation - a.correlation);
    if (relations.length > this.maxRelationsPerDomain) {
      relations.splice(this.maxRelationsPerDomain);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalDomains: this.domainVisits.size,
      totalRelations: Array.from(this.domainRelations.values()).reduce((sum, rels) => sum + rels.length, 0),
      topDomains: Array.from(this.domainVisits.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([domain, data]) => ({
          domain,
          visitCount: data.count,
          lastVisit: data.lastVisit
        }))
    };
  }
}

/**
 * BehaviorLearner - 用户行为学习器
 * 
 * 负责：
 * - 记录用户操作行为
 * - 分析行为模式
 * - 动态优化分组规则
 * - 基于反馈改进分类
 */
class BehaviorLearner {
  constructor(storageManager, eventBus) {
    this.storageManager = storageManager;
    this.eventBus = eventBus;
    this.behaviorHistory = [];
    this.maxHistorySize = 1000;
    this.learningRate = 0.1;
    this.patterns = new Map();
    this.feedback = new Map();
    this.groupPreferences = new Map();

    console.log('🔧 BehaviorLearner initialized');
  }

  /**
   * 初始化
   */
  async initialize() {
    try {
      const savedData = await this.storageManager.getMetadata('behaviorLearning');
      if (savedData) {
        if (savedData.history) {
          this.behaviorHistory = savedData.history;
        }
        if (savedData.patterns) {
          this.patterns = new Map(Object.entries(savedData.patterns));
        }
        if (savedData.feedback) {
          this.feedback = new Map(Object.entries(savedData.feedback));
        }
        if (savedData.groupPreferences) {
          this.groupPreferences = new Map(Object.entries(savedData.groupPreferences));
        }
      }

      this.setupEventListeners();

      console.log('✅ BehaviorLearner initialized');
    } catch (error) {
      console.error('❌ Failed to initialize BehaviorLearner:', error);
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    if (this.eventBus) {
      this.eventBus.on('tab_created', (tab) => this.recordBehavior('tab_created', tab));
      this.eventBus.on('tab_group_assigned', (data) => this.recordBehavior('tab_group_assigned', data));
      this.eventBus.on('group_created', (group) => this.recordBehavior('group_created', group));
      this.eventBus.on('tab_moved_to_group', (data) => this.recordBehavior('tab_moved_to_group', data));
      this.eventBus.on('tab_activated', (tab) => this.recordBehavior('tab_activated', tab));
      this.eventBus.on('tab_closed', (tab) => this.recordBehavior('tab_closed', tab));
    }
  }

  /**
   * 保存数据
   */
  async save() {
    try {
      const data = {
        history: this.behaviorHistory,
        patterns: Object.fromEntries(this.patterns),
        feedback: Object.fromEntries(this.feedback),
        groupPreferences: Object.fromEntries(this.groupPreferences)
      };
      await this.storageManager.saveMetadata('behaviorLearning', data);
    } catch (error) {
      console.error('❌ Failed to save behavior learning data:', error);
    }
  }

  /**
   * 记录行为
   */
  async recordBehavior(action, data) {
    const behavior = {
      action,
      data: this.sanitizeData(data),
      timestamp: Date.now()
    };

    this.behaviorHistory.push(behavior);

    if (this.behaviorHistory.length > this.maxHistorySize) {
      this.behaviorHistory = this.behaviorHistory.slice(-this.maxHistorySize);
    }

    await this.analyzeBehavior(behavior);

    await this.save();
  }

  /**
   * 记录标签页分析结果
   */
  async recordTabAnalysis(tab, analysisResult) {
    if (!tab || !tab.uuid) return;

    await this.recordBehavior('tab_analyzed', {
      tabUuid: tab.uuid,
      title: tab.title,
      url: tab.url,
      analysis: analysisResult
    });
  }

  /**
   * 记录用户反馈
   */
  async recordFeedback(tabUuid, feedbackType, feedbackData = {}) {
    const key = `${tabUuid}_${feedbackType}`;
    this.feedback.set(key, {
      tabUuid,
      feedbackType,
      data: feedbackData,
      timestamp: Date.now()
    });

    await this.recordBehavior('user_feedback', {
      tabUuid,
      feedbackType,
      ...feedbackData
    });

    await this.updateFromFeedback(tabUuid, feedbackType, feedbackData);

    await this.save();
  }

  /**
   * 分析行为
   */
  async analyzeBehavior(behavior) {
    switch (behavior.action) {
      case 'tab_moved_to_group':
        await this.learnFromManualMove(behavior.data);
        break;
      case 'group_created':
        await this.learnFromGroupCreation(behavior.data);
        break;
      case 'tab_activated':
        await this.learnFromTabActivation(behavior.data);
        break;
      case 'user_feedback':
        await this.learnFromFeedback(behavior.data);
        break;
    }
  }

  /**
   * 从手动移动标签页学习
   */
  async learnFromManualMove(data) {
    if (!data || !data.tabData || !data.groupId) return;

    const tabData = data.tabData;
    const groupId = data.groupId;

    let domain = '';
    try {
      domain = new URL(tabData.url).hostname;
    } catch (e) {}

    if (domain) {
      if (!this.groupPreferences.has(groupId)) {
        this.groupPreferences.set(groupId, {
          domains: new Map(),
          keywords: new Map(),
          count: 0
        });
      }

      const pref = this.groupPreferences.get(groupId);
      pref.count++;

      const currentDomainCount = pref.domains.get(domain) || 0;
      pref.domains.set(domain, currentDomainCount + 1);

      if (tabData.title) {
        const words = tabData.title.toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 2);

        words.forEach(word => {
          const currentCount = pref.keywords.get(word) || 0;
          pref.keywords.set(word, currentCount + 1);
        });
      }

      console.log(`📚 Learned from manual move: ${domain} -> ${groupId}`);
    }
  }

  /**
   * 从分组创建学习
   */
  async learnFromGroupCreation(group) {
    if (!group || !group.id) return;

    await this.recordBehavior('group_created_learned', {
      groupId: group.id,
      groupName: group.name,
      tabCount: group.assignedCount || 0
    });

    console.log(`📚 Learned from group creation: ${group.name}`);
  }

  /**
   * 从标签页激活学习
   */
  async learnFromTabActivation(tab) {
    if (!tab || !tab.uuid) return;

    if (!this.patterns.has('tab_activation_patterns')) {
      this.patterns.set('tab_activation_patterns', {
        sequences: [],
        coOccurrences: new Map()
      });
    }
  }

  /**
   * 从反馈学习
   */
  async learnFromFeedback(data) {
    console.log(`📚 Learning from feedback: ${data.feedbackType}`);
  }

  /**
   * 根据反馈更新模型
   */
  async updateFromFeedback(tabUuid, feedbackType, feedbackData) {
    if (feedbackType === 'wrong_group' && feedbackData.suggestedGroup) {
      console.log(`🔄 Updating model based on feedback: wrong group for ${tabUuid}`);
    }

    if (feedbackType === 'better_group' && feedbackData.preferredGroup) {
      console.log(`🔄 Updating model based on feedback: better group for ${tabUuid}`);
    }
  }

  /**
   * 获取分组建议
   */
  getGroupSuggestions(tab) {
    const suggestions = [];

    let domain = '';
    try {
      domain = new URL(tab.url).hostname;
    } catch (e) {
      return suggestions;
    }

    for (const [groupId, pref] of this.groupPreferences.entries()) {
      let score = 0;

      const domainCount = pref.domains.get(domain);
      if (domainCount) {
        const totalMoves = pref.count;
        score = domainCount / totalMoves;
      }

      if (tab.title && pref.keywords.size > 0) {
        const words = tab.title.toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 2);

        let keywordScore = 0;
        let matchedKeywords = 0;

        words.forEach(word => {
          const count = pref.keywords.get(word);
          if (count) {
            keywordScore += count / pref.count;
            matchedKeywords++;
          }
        });

        if (matchedKeywords > 0) {
          score = Math.max(score, keywordScore / matchedKeywords);
        }
      }

      if (score > 0.1) {
        suggestions.push({
          groupId,
          score,
          source: 'behavior_learning'
        });
      }
    }

    return suggestions.sort((a, b) => b.score - a.score);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      historyCount: this.behaviorHistory.length,
      patternsCount: this.patterns.size,
      feedbackCount: this.feedback.size,
      groupPreferencesCount: this.groupPreferences.size,
      recentBehaviors: this.behaviorHistory.slice(-10).map(b => ({
        action: b.action,
        timestamp: b.timestamp
      }))
    };
  }

  /**
   * 清理数据
   */
  sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = {};
    const allowedKeys = [
      'uuid', 'tabUuid', 'id', 'groupId', 'title', 'url', 'name',
      'description', 'type', 'assignedCount', 'feedbackType', 'suggestedGroup',
      'preferredGroup', 'domain', 'groupName', 'tabCount', 'action', 'data'
    ];

    for (const key of allowedKeys) {
      if (data[key] !== undefined) {
        sanitized[key] = data[key];
      }
    }

    return sanitized;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AIIntelligenceEngine,
    SemanticAnalyzer,
    SceneClassifier,
    DomainCorrelator,
    BehaviorLearner
  };
}

if (typeof window !== 'undefined') {
  window.AIIntelligenceEngine = AIIntelligenceEngine;
  window.SemanticAnalyzer = SemanticAnalyzer;
  window.SceneClassifier = SceneClassifier;
  window.DomainCorrelator = DomainCorrelator;
  window.BehaviorLearner = BehaviorLearner;
}
