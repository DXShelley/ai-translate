(() => {
  "use strict";

  const translations = {
    zh: {
      documentTitle: "AI Translate - 浏览器与 VS Code 翻译工具",
      metaDescription: "AI Translate 浏览器扩展与 VS Code 插件功能说明",
      navigationLabel: "页面导航",
      languageToggle: "EN",
      languageToggleLabel: "切换到英文",
      eyebrow: "TRANSLATION, WHERE YOU READ",
      heroTitle: "在网页与编辑器中，直接理解原文。",
      heroLead: "AI Translate 同时提供浏览器扩展和 VS Code 插件：前者处理网页划词，后者帮助中文用户阅读英文 Skill 文档。",
      releaseLabel: "当前发布版本",
      modeMarkLabel: "两个插件入口",
      overviewLabel: "两种使用场景",
      browserTitle: "浏览器扩展",
      browserSummary: "为网页阅读提供划词、句子和段落翻译。支持本地或 OpenAI 兼容模型、多模型优先级回退，以及中英自动方向判断。",
      vscodeTitle: "VS Code 插件",
      vscodeSummary: "在编辑器内选择单词后查询词典。适合阅读英文 Skill 文档时查看音标、英美发音和中英文释义。",
      browserFeatureTitle: "网页阅读的翻译工具链",
      browserFeature1: "划词、句子、段落三种翻译粒度。",
      browserFeature2: "OpenAI 兼容接口、多模型优先级与失败回退。",
      browserFeature3: "英文词典、历史记录、右键菜单与快捷键入口。",
      browserFeature4: "Chrome、Edge、Firefox 三种发布包。",
      browserDocs: "查看浏览器扩展说明",
      vscodeFeatureTitle: "为英文 Skill 文档设计的选词词典",
      vscodeFeature1: "选中英文单词或连续中文词语后，以悬停弹框呈现结果。",
      vscodeFeature2: "优先使用内置有道词典与翻译，必要时回退到 OpenAI 兼容接口。",
      vscodeFeature3: "展示英式/美式音标、英美发音入口、中文释义与英文释义。",
      vscodeFeature4: "支持悬停、快捷键或组合触发；快捷键由用户自行绑定。",
      vscodeDocs: "查看 VS Code 插件说明",
      installLabel: "安装与发布",
      installTitle: "从同一个 Release 获取全部交付物",
      installBrowserTitle: "浏览器",
      installBrowserText: "下载 Chrome、Edge 或 Firefox 对应 zip，解压后在浏览器扩展管理页加载。",
      installVscodeText: "下载 .vsix，在 Extensions 菜单中选择 Install from VSIX...。",
      latestRelease: "打开最新发布",
      supportLabel: "项目支持",
      supportTitle: "遇到问题时，从可复现的信息开始。",
      supportText: "反馈时请说明插件版本、运行环境、操作步骤、实际结果和预期结果。涉及接口问题时请注意移除 API Key 和敏感文本。",
      createIssue: "创建 GitHub Issue",
      fallbackSupport: "备用支持入口",
      releaseHistory: "查看版本记录",
      navBrowser: "浏览器扩展",
      navInstall: "安装",
      navSupport: "项目支持",
      footerProducts: "Browser Extension and VS Code Extension"
    },
    en: {
      documentTitle: "AI Translate - Browser and VS Code Translation Tools",
      metaDescription: "AI Translate browser extension and VS Code extension overview",
      navigationLabel: "Page navigation",
      languageToggle: "中文",
      languageToggleLabel: "Switch to Chinese",
      eyebrow: "TRANSLATION, WHERE YOU READ",
      heroTitle: "Understand source text directly, on the web and in your editor.",
      heroLead: "AI Translate offers both a browser extension and a VS Code extension: translate selected web content, or look up words while reading English Skill documentation.",
      releaseLabel: "Current release",
      modeMarkLabel: "Two extension entry points",
      overviewLabel: "Two ways to use it",
      browserTitle: "Browser extension",
      browserSummary: "Translate selections, sentences, and paragraphs while reading online. Supports local and OpenAI-compatible models, model-priority fallback, and automatic Chinese-English direction detection.",
      vscodeTitle: "VS Code extension",
      vscodeSummary: "Look up a selected word in the editor. Built for reading English Skill documentation with phonetics, UK/US pronunciation, and Chinese and English definitions.",
      browserFeatureTitle: "A translation toolkit for web reading",
      browserFeature1: "Three translation scopes: selection, sentence, and paragraph.",
      browserFeature2: "OpenAI-compatible APIs, model priority, and failure fallback.",
      browserFeature3: "English dictionary, history, context menu, and shortcut entry points.",
      browserFeature4: "Release packages for Chrome, Edge, and Firefox.",
      browserDocs: "Browser extension documentation",
      vscodeFeatureTitle: "A selected-word dictionary for English Skill documentation",
      vscodeFeature1: "Show results in a hover popup after selecting an English word or consecutive Chinese characters.",
      vscodeFeature2: "Uses the built-in Youdao dictionary and translation first, then falls back to an OpenAI-compatible API.",
      vscodeFeature3: "Shows UK/US phonetics, pronunciation actions, Chinese definitions, and English definitions.",
      vscodeFeature4: "Supports hover, keyboard, or both; users assign their own shortcut.",
      vscodeDocs: "VS Code extension documentation",
      installLabel: "Install and release",
      installTitle: "Get every deliverable from one Release",
      installBrowserTitle: "Browser",
      installBrowserText: "Download the Chrome, Edge, or Firefox zip, extract it, then load it from the browser extension manager.",
      installVscodeText: "Download the .vsix, then choose Install from VSIX... from the Extensions menu.",
      latestRelease: "Open latest release",
      supportLabel: "Project support",
      supportTitle: "Start with information that makes the issue reproducible.",
      supportText: "Include the extension version, environment, steps, actual result, and expected result. Remove API keys and sensitive text before reporting interface issues.",
      createIssue: "Create a GitHub Issue",
      fallbackSupport: "Fallback support portal",
      releaseHistory: "View release history",
      navBrowser: "Browser",
      navInstall: "Install",
      navSupport: "Support",
      footerProducts: "Browser Extension and VS Code Extension"
    }
  };

  const storageKey = "ai-translate-pages-language";
  const toggle = document.querySelector(".language-toggle");

  function applyLanguage(language) {
    const dictionary = translations[language];
    if (!dictionary) return;
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title = dictionary.documentTitle;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const value = dictionary[element.dataset.i18n];
      if (value) element.textContent = value;
    });
    document.querySelectorAll("[data-i18n-content]").forEach((element) => {
      const value = dictionary[element.dataset.i18nContent];
      if (value) element.content = value;
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      const value = dictionary[element.dataset.i18nAriaLabel];
      if (value) element.setAttribute("aria-label", value);
    });
    toggle?.setAttribute("aria-pressed", String(language === "en"));
    localStorage.setItem(storageKey, language);
  }

  const savedLanguage = localStorage.getItem(storageKey);
  applyLanguage(savedLanguage === "en" ? "en" : "zh");
  toggle?.addEventListener("click", () => applyLanguage(document.documentElement.lang === "en" ? "zh" : "en"));
})();
