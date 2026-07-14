importScripts("vendor/jsonrepair.min.js");
importScripts("browser-adapter.js");

const DEFAULT_PROFILE = {
  id: "default",
  name: "本地模型",
  apiType: "openai-chat",
  baseUrl: "http://localhost:1234/v1",
  endpointPath: "/chat/completions",
  apiKey: "",
  model: "local-model",
  authType: "bearer",
  translationMode: "auto-zh-en",
  sourceLanguage: "自动检测",
  targetLanguage: "简体中文",
  extraBody: {
    enable_thinking: false,
    thinking: false,
    reasoning: { enabled: false }
  },
  temperature: 0.2,
  timeoutMs: 45000,
  priority: 1,
  enabled: true,
  systemPrompt:
    "You are a precise translation engine. Translate faithfully, keep formatting where useful, preserve names, code, URLs, numbers, and technical terms.",
  userPromptTemplate:
    "{{instruction}}\nReturn only the translation text.\nDo not explain. Do not add alternatives. Do not output reasoning, analysis, hidden thoughts, or <think> tags.\nKeep line breaks when they carry meaning.\nUse the surrounding context and previous translations to keep terms, names, pronouns, and style consistent.\n\n{{contextBlock}}\n{{previousTranslationsBlock}}\n\nText to translate:\n{{text}}"
};

const DEFAULT_CONFIG = {
  activeProfileId: DEFAULT_PROFILE.id,
  profiles: [DEFAULT_PROFILE],
  settings: {
    displayMode: "bilingual",
    hoverTranslate: true,
    hoverModifier: "ctrl",
    inputTranslate: true,
    inputTriggerSpaces: 3,
    bilingualLayout: "vertical",
    requestLogging: false,
    builtinApiEnabled: true,
    popupLanguage: "all",
    translationMode: DEFAULT_PROFILE.translationMode,
    sourceLanguage: DEFAULT_PROFILE.sourceLanguage,
    targetLanguage: DEFAULT_PROFILE.targetLanguage
  }
};

const BUILTIN_WORD_API_ADAPTERS = [
  {
    id: "youdao-mobile",
    name: "有道移动词典",
    query: queryYoudaoMobileWordInfo
  }
];

const BUILTIN_TRANSLATION_API_ADAPTERS = [
  {
    id: "youdao-mobile-translate",
    name: "有道移动翻译",
    query: queryYoudaoMobileTranslation
  }
];

const browserApi = globalThis.litBrowser;

browserApi.raw.runtime.onInstalled.addListener(() => {
  browserApi.contextMenus.create({
    id: "translate-selection",
    title: "翻译选中文本",
    contexts: ["selection"]
  });
});

browserApi.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "translate-selection" || !tab?.id) return;
  browserApi.tabs.sendMessage(tab.id, {
    type: "LIT_TRANSLATE_SELECTION",
    mode: "auto",
    text: info.selectionText || ""
  }).catch((err) => {
    console.warn("翻译消息发送失败，内容脚本可能未就绪:", err.message);
  });
});

browserApi.commands.onCommand.addListener((command, tab) => {
  if (command !== "translate-selection" || !tab?.id) return;
  browserApi.tabs.sendMessage(tab.id, {
    type: "LIT_TRANSLATE_SELECTION",
    mode: "auto"
  }).catch((err) => {
    console.warn("翻译消息发送失败，内容脚本可能未就绪:", err.message);
  });
});

browserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LIT_TRANSLATE") {
    translate(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "LIT_LIST_MODELS") {
    listModels(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "LIT_WORD_INFO") {
    getWordInfo(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "LIT_GET_CONFIG") {
    getConfig()
      .then((config) => sendResponse({ ok: true, config }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "LIT_SPEAK_TEXT") {
    speakText(message.payload)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "LIT_FETCH_SPEECH_AUDIO") {
    fetchSpeechAudio(message.payload)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }
});

async function getCurrentSettings() {
  const saved = await browserApi.storage.sync.get(null);
  const profiles = Array.isArray(saved.profiles) && saved.profiles.length ? saved.profiles : [saved];
  return normalizeSettings({ ...(profiles[0] || {}), ...(saved.settings || {}) });
}

async function getConfig() {
  const saved = await browserApi.storage.sync.get(null);
  const profiles = Array.isArray(saved.profiles) && saved.profiles.length
    ? saved.profiles.map(normalizeProfile)
    : [normalizeProfile({ ...DEFAULT_PROFILE, ...saved })];
  const activeProfileId = profiles.some((profile) => profile.id === saved.activeProfileId)
    ? saved.activeProfileId
    : profiles[0].id;

  return {
    activeProfileId,
    profiles,
    activeProfile: profiles.find((profile) => profile.id === activeProfileId) || profiles[0],
    settings: normalizeSettings({ ...(profiles[0] || {}), ...(saved.settings || {}) })
  };
}

function normalizeSettings(source = {}) {
  return {
    displayMode: ["bilingual", "translationOnly", "sourceCollapsed"].includes(source.displayMode)
      ? source.displayMode
      : DEFAULT_CONFIG.settings.displayMode,
    hoverTranslate: typeof source.hoverTranslate === "boolean"
      ? source.hoverTranslate
      : DEFAULT_CONFIG.settings.hoverTranslate,
    hoverModifier: ["ctrl", "alt", "shift", "none"].includes(source.hoverModifier)
      ? source.hoverModifier
      : DEFAULT_CONFIG.settings.hoverModifier,
    inputTranslate: typeof source.inputTranslate === "boolean"
      ? source.inputTranslate
      : DEFAULT_CONFIG.settings.inputTranslate,
    inputTriggerSpaces: clampNumber(Number(source.inputTriggerSpaces || DEFAULT_CONFIG.settings.inputTriggerSpaces), 2, 6),
    bilingualLayout: ["vertical", "horizontal"].includes(source.bilingualLayout)
      ? source.bilingualLayout
      : DEFAULT_CONFIG.settings.bilingualLayout,
    requestLogging: typeof source.requestLogging === "boolean"
      ? source.requestLogging
      : DEFAULT_CONFIG.settings.requestLogging,
    builtinApiEnabled: typeof source.builtinApiEnabled === "boolean"
      ? source.builtinApiEnabled
      : DEFAULT_CONFIG.settings.builtinApiEnabled,
    translationMode: ["auto-zh-en", "manual"].includes(source.translationMode)
      ? source.translationMode
      : DEFAULT_CONFIG.settings.translationMode,
    sourceLanguage: String(source.sourceLanguage || DEFAULT_CONFIG.settings.sourceLanguage).trim() || DEFAULT_CONFIG.settings.sourceLanguage,
    targetLanguage: String(source.targetLanguage || DEFAULT_CONFIG.settings.targetLanguage).trim() || DEFAULT_CONFIG.settings.targetLanguage,
    popupLanguage: normalizePopupLanguage(source.popupLanguage || DEFAULT_CONFIG.settings.popupLanguage)
  };
}

function normalizePopupLanguage(value) {
  const code = String(value || "all").trim().toLowerCase();
  if (["", "all", "auto", "*", "any"].includes(code)) return "all";
  if (["en", "eng", "english"].includes(code)) return "en";
  if (["zh", "zh-cn", "zh-tw", "cn", "chinese", "中文", "简体中文", "繁體中文"].includes(code)) return "zh";
  if (["ja", "jp", "japanese", "日本語"].includes(code)) return "ja";
  if (["ko", "kr", "korean", "한국어"].includes(code)) return "ko";
  return "all";
}

async function translate(payload) {
  // 如果有测试配置，直接使用该配置（无论该模型是否启用）
  if (payload?.testProfile) {
    const text = String(payload?.text || "").trim();
    const mode = payload?.mode || "selection";
    const context = payload?.context || {};

    if (!text) {
      throw new Error("没有可翻译的文本");
    }

    const settings = await getCurrentSettings();
    const targetLanguage = resolveTargetLanguage(text, settings);
    const requestContext = {
      ...context,
      sourceLanguage: resolveSourceLanguage(settings)
    };
    const messages = buildTranslationMessages(
      payload.testProfile,
      text,
      mode,
      requestContext,
      targetLanguage
    );
    const body = await requestChatCompletion(
      payload.testProfile,
      messages,
      Number(payload.testProfile.temperature) || 0,
      { type: "translate", settings }
    );

    const content = extractChatContent(body);
    if (!content) {
      throw new Error("接口未返回 choices[0].message.content");
    }

    const normalized = normalizeTranslationContent(content, text);
    return {
      source: text,
      translation: normalized.translation,
      alignments: normalized.alignments,
      mode,
      targetLanguage,
      model: payload.testProfile.model,
      profileName: payload.testProfile.name
    };
  }

  // 正常流程，使用配置中的启用模型
  const config = await getConfig();
  const text = String(payload?.text || "").trim();
  const mode = payload?.mode || "selection";
  const context = payload?.context || {};

  if (!text) {
    throw new Error("没有可翻译的文本");
  }

  const adapterResult = await queryTranslationAdapters(text, mode, config.settings);
  if (adapterResult) {
    return adapterResult;
  }

  return tryProfiles(config, async (profile) => {
    const targetLanguage = resolveTargetLanguage(text, config.settings);
    const requestContext = {
      ...context,
      sourceLanguage: resolveSourceLanguage(config.settings)
    };
    const messages = buildTranslationMessages(profile, text, mode, requestContext, targetLanguage);
    const body = await requestChatCompletion(
      profile,
      messages,
      Number(profile.temperature) || 0,
      { type: "translate", settings: config.settings }
    );

    const content = extractChatContent(body);
    if (!content) {
      throw new Error("接口未返回 choices[0].message.content");
    }

    const normalized = normalizeTranslationContent(content, text);
    return {
      source: text,
      translation: normalized.translation,
      alignments: normalized.alignments,
      mode,
      targetLanguage,
      model: profile.model,
      profileName: profile.name
    };
  });
}

async function getWordInfo(payload) {
  const config = await getConfig();
  const word = String(payload?.word || "").trim();

  if (!word) {
    throw new Error("没有可查询的单词");
  }

  const adapterInfo = config.settings.builtinApiEnabled === false ? null : await queryWordInfoAdapters(word);
  if (adapterInfo) {
    return adapterInfo;
  }

  return tryProfiles(config, async (profile) => {
    const messages = buildWordInfoMessages(profile, word);
    const body = await requestChatCompletion(profile, messages, 0, { type: "word", settings: config.settings });

    const content = extractChatContent(body);
    if (!content) {
      throw new Error("接口未返回词典信息");
    }

    return normalizeWordInfo(content);
  });
}

async function listModels(profilePayload) {
  const profile = normalizeProfile(profilePayload || (await getConfig()).activeProfile);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(profile.timeoutMs) || 45000);

  try {
    const response = await fetch(joinUrl(profile.baseUrl, "/models"), {
      method: "GET",
      signal: controller.signal,
      headers: buildHeaders(profile)
    });

    const bodyText = await response.text();
    let body;
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = { raw: bodyText };
    }

    if (!response.ok) {
      const detail = body?.error?.message || body?.message || bodyText || response.statusText;
      throw new Error(`模型列表获取失败 (${response.status}): ${detail}`);
    }

    const models = Array.isArray(body?.data)
      ? body.data.map((item) => item.id || item.name).filter(Boolean)
      : [];
    if (!models.length) {
      throw new Error("接口未返回 data[].id 模型列表");
    }

    return { models };
  } finally {
    clearTimeout(timer);
  }
}

async function speakText(payload) {
  const text = String(payload?.text || "").trim();
  const lang = String(payload?.lang || "en-US").trim() || "en-US";
  const rate = clampNumber(Number(payload?.rate || 1), 0.1, 10);
  const pitch = clampNumber(Number(payload?.pitch || 1), 0, 2);
  const volume = clampNumber(Number(payload?.volume || 1), 0, 1);
  if (!text) throw new Error("没有可朗读的文本");

  const tts = browserApi.raw?.tts;
  if (!tts?.speak) throw new Error("当前浏览器不支持扩展朗读接口");
  const voice = await findExtensionTtsVoice(tts, lang);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      handler(value);
    };

    try {
      tts.stop?.();
      tts.speak(text, {
        lang,
        rate,
        pitch,
        volume,
        enqueue: false,
        ...(voice?.voiceName ? { voiceName: voice.voiceName } : {}),
        onEvent(event) {
          if (event?.type === "start") {
            finish(resolve, { engine: "extension-tts", voiceName: voice?.voiceName || "" });
            return;
          }
          if (event?.type === "error") {
            finish(reject, new Error(event.errorMessage || "扩展朗读失败"));
            return;
          }
          if (event?.type === "interrupted" || event?.type === "cancelled") {
            finish(reject, new Error("扩展朗读已中断"));
          }
        }
      }, () => {
        const lastError = browserApi.raw?.runtime?.lastError;
        if (lastError) {
          finish(reject, new Error(lastError.message || String(lastError)));
          return;
        }
        finish(resolve, { engine: "extension-tts", voiceName: voice?.voiceName || "" });
      });
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function queryTranslationAdapters(text, mode, settings) {
  if (settings?.builtinApiEnabled === false) return null;
  if (!shouldUseBuiltinTranslationAdapter(text, mode)) return null;

  for (const adapter of BUILTIN_TRANSLATION_API_ADAPTERS) {
    try {
      const result = await adapter.query(text, mode, settings);
      if (hasTranslationContent(result)) {
        return withTranslationAdapterMeta(result, adapter);
      }
    } catch (error) {
      console.warn(`${adapter.name || adapter.id} 翻译失败，回退到大模型:`, normalizeError(error));
    }
  }
  return null;
}

function shouldUseBuiltinTranslationAdapter(text, mode) {
  if (!["selection", "sentence", "paragraph", "input"].includes(mode)) return false;
  const value = String(text || "").trim();
  return value.length > 1 && value.length <= 5000;
}

function hasTranslationContent(result) {
  return Boolean(String(result?.translation || "").trim());
}

function withTranslationAdapterMeta(result, adapter) {
  return {
    ...result,
    alignments: [],
    provider: adapter.id,
    profileName: adapter.name || adapter.id,
    model: adapter.id
  };
}

async function queryYoudaoMobileTranslation(text, mode, settings) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const direction = resolveYoudaoTranslateType(text, settings);
  const body = new URLSearchParams({
    inputtext: text,
    type: direction
  });

  try {
    const response = await fetch("https://mobile.youdao.com/translate", {
      method: "POST",
      signal: controller.signal,
      body,
      referrer: "https://mobile.youdao.com/translate",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://mobile.youdao.com",
        Pragma: "no-cache",
        "Cache-Control": "no-cache"
      }
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`有道翻译请求失败 (${response.status}): ${response.statusText}`);
    }

    const translation = parseYoudaoMobileTranslation(html);
    if (!translation) return null;
    return {
      source: text,
      translation,
      alignments: [],
      mode,
      targetLanguage: resolveYoudaoTranslationTargetLanguage(direction, text, settings)
    };
  } finally {
    clearTimeout(timer);
  }
}

function resolveYoudaoTranslateType(text, settings) {
  const translationSettings = getTranslationSettings(settings);
  if (translationSettings.translationMode !== "manual") return "AUTO";

  const source = normalizeLanguageLabel(translationSettings.sourceLanguage);
  const target = normalizeLanguageLabel(translationSettings.targetLanguage);
  if (source === "zh" && target === "en") return "ZH_CN2EN";
  if (source === "en" && target === "zh") return "EN2ZH_CN";
  if (source === "zh" && target === "ja") return "ZH_CN2JA";
  if (source === "ja" && target === "zh") return "JA2ZH_CN";
  if (source === "zh" && target === "ko") return "ZH_CN2KR";
  if (source === "ko" && target === "zh") return "KR2ZH_CN";
  if (source === "zh" && target === "fr") return "ZH_CN2FR";
  if (source === "fr" && target === "zh") return "FR2ZH_CN";
  if (source === "zh" && target === "ru") return "ZH_CN2RU";
  if (source === "ru" && target === "zh") return "RU2ZH_CN";
  if (source === "zh" && target === "es") return "ZH_CN2SP";
  if (source === "es" && target === "zh") return "SP2ZH_CN";
  return "AUTO";
}

function resolveYoudaoTranslationTargetLanguage(direction, text, settings) {
  if (direction === "AUTO") return resolveTargetLanguage(text, settings);
  if (/2ZH_CN$/.test(direction)) return "简体中文";
  if (/2EN$/.test(direction)) return "English";
  if (/2JA$/.test(direction)) return "日本語";
  if (/2KR$/.test(direction)) return "한국어";
  if (/2FR$/.test(direction)) return "Français";
  if (/2RU$/.test(direction)) return "Русский";
  if (/2SP$/.test(direction)) return "Español";
  return resolveTargetLanguage(text, settings);
}

function parseYoudaoMobileTranslation(html) {
  const section = extractHtmlSection(String(html || ""), /<ul\s+id=["']translateResult["'][^>]*>/i, /<\/ul>/i);
  if (!section) return "";

  const lines = [];
  const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = itemPattern.exec(section))) {
    const line = cleanHtmlText(match[1]);
    if (line) lines.push(line);
  }
  return lines.join("\n").trim();
}

function normalizeLanguageLabel(value) {
  const label = String(value || "").trim().toLowerCase();
  if (["自动检测", "auto"].includes(label)) return "auto";
  if (["zh", "zh-cn", "cn", "chinese", "中文", "简体中文"].includes(label)) return "zh";
  if (["en", "eng", "english", "英文"].includes(label)) return "en";
  if (["ja", "jp", "japanese", "日本語", "日文"].includes(label)) return "ja";
  if (["ko", "kr", "korean", "한국어", "韩文"].includes(label)) return "ko";
  if (["fr", "french", "français", "法文", "法语"].includes(label)) return "fr";
  if (["ru", "russian", "русский", "俄文", "俄语"].includes(label)) return "ru";
  if (["es", "sp", "spanish", "español", "西文", "西语", "西班牙语"].includes(label)) return "es";
  return label || "auto";
}

async function fetchSpeechAudio(payload) {
  const audioUrl = normalizeSpeechAudioUrl(payload?.url);
  if (!audioUrl) throw new Error("无效的发音音频地址");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(audioUrl, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      credentials: "include",
      referrer: "https://mobile.youdao.com/",
      headers: {
        Accept: "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,*/*;q=0.5",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.6,en;q=0.5",
        Range: "bytes=0-",
        Pragma: "no-cache",
        "Cache-Control": "no-cache"
      }
    });
    if (!response.ok && response.status !== 206) {
      throw new Error(`发音音频请求失败 (${response.status}): ${response.statusText}`);
    }

    const contentType = normalizeAudioContentType(response.headers.get("content-type"));
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) throw new Error("发音音频为空");

    return {
      audioUrl,
      contentType,
      dataUrl: `data:${contentType};base64,${arrayBufferToBase64(buffer)}`
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSpeechAudioUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value.startsWith("//") ? `https:${value}` : value);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "dict.youdao.com" || parsed.pathname !== "/dictvoice") {
    return "";
  }
  return parsed.href;
}

function normalizeAudioContentType(contentType) {
  const value = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (value && /^audio\//.test(value)) return value;
  return "audio/mpeg";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function queryWordInfoAdapters(word) {
  for (const adapter of BUILTIN_WORD_API_ADAPTERS) {
    try {
      const info = await adapter.query(word);
      if (hasWordInfoContent(info)) {
        return withWordInfoAdapterMeta(info, adapter);
      }
    } catch (error) {
      console.warn(`${adapter.name || adapter.id} 查询失败，继续尝试下一个词典适配器:`, normalizeError(error));
    }
  }
  return null;
}

function withWordInfoAdapterMeta(info, adapter) {
  return {
    ...info,
    raw: {
      ...(info?.raw && typeof info.raw === "object" ? info.raw : {}),
      adapterId: adapter.id,
      adapterName: adapter.name || adapter.id
    }
  };
}

async function queryYoudaoMobileWordInfo(word) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const url = `https://mobile.youdao.com/dict?le=eng&q=${encodeURIComponent(word)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
      }
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`有道词典请求失败 (${response.status}): ${response.statusText}`);
    }
    const wordInfo = parseYoudaoMobileWordInfo(html, word);
    if (!wordInfo) return null;
    const supplements = await fetchYoudaoMobileSupplements(word);
    return mergeWordInfo(wordInfo, supplements);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYoudaoMobileSupplements(word) {
  const [englishDefinitions, specialDefinitions, synonyms, examples] = await Promise.all([
    fetchYoudaoMobileSection(word, "ee").then(parseYoudaoEnglishDefinitions).catch(() => []),
    fetchYoudaoMobileSection(word, "special").then(parseYoudaoSpecialDefinitions).catch(() => []),
    fetchYoudaoMobileSection(word, "syno").then(parseYoudaoSynonyms).catch(() => []),
    fetchYoudaoMobileSection(word, "blng_sents_part").then(parseYoudaoBilingualExamples).catch(() => [])
  ]);

  return {
    definitionsEn: englishDefinitions,
    webDefinitions: specialDefinitions,
    synonyms,
    examples
  };
}

async function fetchYoudaoMobileSection(word, dict) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const url = `https://mobile.youdao.com/singledict?q=${encodeURIComponent(word)}&dict=${encodeURIComponent(dict)}&le=eng&more=false`;

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      referrer: "https://mobile.youdao.com/",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
      }
    });
    if (!response.ok) return "";
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function mergeWordInfo(base, additions) {
  return formatWordInfoJson({
    ...base,
    definitionsEn: [
      ...normalizeArray(base?.definitionsEn),
      ...normalizeArray(additions?.definitionsEn)
    ],
    webDefinitions: [
      ...normalizeArray(base?.webDefinitions),
      ...normalizeArray(additions?.webDefinitions)
    ],
    synonyms: [
      ...normalizeArray(base?.synonyms),
      ...normalizeArray(additions?.synonyms)
    ],
    examples: [
      ...normalizeExamples(base?.examples),
      ...normalizeExamples(additions?.examples)
    ],
    raw: {
      ...(base?.raw && typeof base.raw === "object" ? base.raw : {}),
      supplements: additions
    }
  });
}

function parseYoudaoMobileWordInfo(html, queryWord) {
  const text = String(html || "");
  if (!text || /该词条暂未被收录/i.test(text)) return null;

  const basicSection = extractHtmlSection(text, /<div\s+id=["']ec["'][^>]*>/i, /<div\s+id=["']collins_contentWrp["'][^>]*>/i);
  if (!basicSection) return null;

  const phonetics = extractYoudaoPhonetics(basicSection);
  const speechUrls = extractYoudaoSpeechUrls(basicSection);
  const partsOfSpeech = extractYoudaoMeanings(basicSection);
  const inflections = extractYoudaoInflections(basicSection);
  const word = extractYoudaoHeadword(basicSection) || queryWord;

  return formatWordInfoJson({
    word,
    phoneticUS: phonetics.us,
    phoneticUK: phonetics.uk,
    speechUrls,
    partsOfSpeech,
    inflections,
    definitionsZh: partsOfSpeech.map((item) => item.pos ? `${item.pos} ${item.meaning}` : item.meaning),
    definitionsEn: [],
    webDefinitions: [],
    synonyms: [],
    antonyms: [],
    examples: [],
    raw: {
      source: "youdao-mobile",
      url: `https://mobile.youdao.com/dict?le=eng&q=${encodeURIComponent(queryWord)}`
    }
  });
}

function parseYoudaoEnglishDefinitions(html) {
  const definitions = [];
  const pattern = /<li\b[^>]*class=["'][^"']*\bper-tran\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    const text = cleanHtmlText(match[1])
      .replace(/^\d+\.\s*/, "")
      .replace(/^[a-z]+\.\s*/i, "")
      .trim();
    if (text) definitions.push(text);
  }
  return uniqueStrings(definitions);
}

function parseYoudaoSpecialDefinitions(html) {
  const definitions = [];
  const items = String(html || "").match(/<li\b[^>]*class=["'][^"']*\bmcols-layout\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi) || [];
  for (const item of items) {
    const field = cleanHtmlText((/<p\s+class=["']grey["'][^>]*>([\s\S]*?)<\/p>/i.exec(item) || [])[1] || "");
    const terms = [];
    const termPattern = /<p>\s*<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/p>/gi;
    let termMatch;
    while ((termMatch = termPattern.exec(item))) {
      const term = cleanHtmlText(termMatch[1]);
      if (term) terms.push(term);
    }
    for (const term of terms) {
      definitions.push(field ? `${field}：${term}` : term);
    }
  }
  return uniqueStrings(definitions);
}

function parseYoudaoSynonyms(html) {
  const synonyms = [];
  const linkPattern = /<a\b[^>]*class=["'][^"']*\bclickable\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(String(html || "")))) {
    const word = cleanHtmlText(match[1]);
    if (word) synonyms.push(word);
  }
  return uniqueStrings(synonyms);
}

function parseYoudaoBilingualExamples(html) {
  const examples = [];
  const itemPattern = /<li\b[^>]*class=["'][^"']*\bmcols-layout\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = itemPattern.exec(String(html || "")))) {
    const item = match[1];
    const audioUrl = normalizeYoudaoAudioUrl(decodeHtmlEntities((/data-rel=["']([^"']+)["']/i.exec(item) || [])[1] || ""));
    const paragraphs = [];
    const pPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pPattern.exec(item))) {
      const className = pMatch[1] || "";
      const text = cleanHtmlText(pMatch[2]);
      if (!text || /speech-size/.test(className)) continue;
      paragraphs.push({ className, text });
    }
    const en = paragraphs.find((part) => !/\bgrey\b/.test(part.className))?.text || "";
    const zh = paragraphs.find((part) => /\bgrey\b/.test(part.className))?.text || "";
    if (en) examples.push({ en, zh, audioUrl });
  }
  return examples;
}

function uniqueStrings(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const text = String(item || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function extractHtmlSection(html, startPattern, endPattern) {
  const startMatch = startPattern.exec(html);
  if (!startMatch) return "";
  const start = startMatch.index;
  const rest = html.slice(start + startMatch[0].length);
  const endMatch = endPattern.exec(rest);
  return endMatch ? html.slice(start, start + startMatch[0].length + endMatch.index) : html.slice(start);
}

function extractYoudaoHeadword(section) {
  const match = /<h2\b[^>]*>[\s\S]*?<span\b[^>]*>\s*([\s\S]*?)\s*<\/span>/i.exec(section);
  return cleanHtmlText(match?.[1] || "");
}

function extractYoudaoPhonetics(section) {
  const result = { us: "", uk: "" };
  const pattern = /<span\b[^>]*>\s*(英|美)[\s\S]*?<span\s+class=["']phonetic["'][^>]*>\s*([^<]*)<\/span>/gi;
  let match;
  while ((match = pattern.exec(section))) {
    const value = cleanHtmlText(match[2]).replace(/^\[|\]$/g, "");
    if (match[1] === "美") result.us = value;
    if (match[1] === "英") result.uk = value;
  }
  return result;
}

function extractYoudaoSpeechUrls(section) {
  const result = { us: "", uk: "" };
  const pattern = /data-rel=["']([^"']*dictvoice\?[^"']*type=(1|2)[^"']*)["']/gi;
  let match;
  while ((match = pattern.exec(section))) {
    const url = normalizeYoudaoAudioUrl(decodeHtmlEntities(match[1]));
    if (match[2] === "2") result.us = url;
    if (match[2] === "1") result.uk = url;
  }
  return result;
}

function normalizeYoudaoAudioUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return "";
}

function extractYoudaoMeanings(section) {
  const listMatch = /<ul\b[^>]*>([\s\S]*?)<\/ul>/i.exec(section);
  if (!listMatch) return [];
  const meanings = [];
  const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = itemPattern.exec(listMatch[1]))) {
    const text = cleanHtmlText(match[1]);
    if (!text) continue;
    const posMatch = /^([a-z]+\.|abbr\.|aux\.|conj\.|det\.|interj\.|num\.|prep\.|pron\.)\s*(.+)$/i.exec(text);
    meanings.push({
      pos: posMatch ? posMatch[1] : "",
      meaning: posMatch ? posMatch[2] : text
    });
  }
  return meanings;
}

function extractYoudaoInflections(section) {
  const inflections = [];
  const pattern = /<p\s+class=["']grey["'][^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pattern.exec(section))) {
    const text = cleanHtmlText(match[1]);
    if (text) inflections.push(text);
  }
  return inflections;
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    const key = entity.toLowerCase();
    if (key[0] === "#") {
      const code = key[1] === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return named[key] ?? "";
  });
}

function hasWordInfoContent(info) {
  return Boolean(
    info &&
    (
      info.phoneticUS ||
      info.phoneticUK ||
      info.partsOfSpeech?.length ||
      info.definitionsZh?.length ||
      info.definitionsEn?.length ||
      info.webDefinitions?.length
    )
  );
}

function findExtensionTtsVoice(tts, lang) {
  if (!tts?.getVoices) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      tts.getVoices((voices) => {
        const normalizedLang = String(lang || "en-US").toLowerCase();
        const family = normalizedLang.slice(0, 2);
        const list = Array.isArray(voices) ? voices : [];
        resolve(
          list.find((voice) => String(voice.lang || "").toLowerCase() === normalizedLang) ||
          list.find((voice) =>
            String(voice.lang || "").toLowerCase().startsWith(`${family}-`) &&
            /microsoft|google|apple|system/i.test(`${voice.voiceName || ""} ${voice.extensionId || ""}`)
          ) ||
          list.find((voice) => String(voice.lang || "").toLowerCase().startsWith(`${family}-`)) ||
          null
        );
      });
    } catch {
      resolve(null);
    }
  });
}

function buildWordInfoPrompt(word) {
  return [
    `Analyze the English word: ${word}`,
    "Return JSON with exactly these keys:",
    "{",
    '  "word": string,',
    '  "phoneticUS": string,',
    '  "phoneticUK": string,',
    '  "partsOfSpeech": [{"pos": string, "meaning": string}],',
    '  "inflections": string[],',
    '  "definitionsZh": string[],',
    '  "definitionsEn": string[],',
    '  "webDefinitions": string[],',
    '  "synonyms": string[],',
    '  "antonyms": string[],',
    '  "examples": [{"en": string, "zh": string}]',
    "}",
    "Rules:",
    "- Return one valid JSON object only.",
    "- Do not output reasoning, analysis, hidden thoughts, or <think> tags.",
    "- Do not add pinyin.",
    "- definitionsZh must be Chinese meanings only.",
    '- partsOfSpeech should contain concise Chinese meanings grouped by part of speech, for example {"pos":"n.","meaning":"招呼，问候"}.',
    '- inflections should contain concise Chinese labels, for example "复数 hellos".',
    "- definitionsEn must be English definitions only.",
    '- webDefinitions should contain concise common online meanings in Chinese, for example "电脑".',
    "- synonyms and antonyms must be flat string arrays.",
    "- Use IPA for phoneticUS and phoneticUK.",
    "- Keep arrays concise, maximum 5 items each. Include 2 classic, natural example sentences."
  ].join("\n");
}

function normalizeWordInfo(content) {
  const text = stripThinkingText(content);
  const jsonText = stripJsonFence(text);
  try {
    const repaired = globalThis.JSONRepair.jsonrepair(jsonText);
    const parsed = JSON.parse(repaired);
    return formatWordInfoJson(parsed);
  } catch (error) {
    throw new Error(`词典 JSON 解析失败：${error?.message || String(error)}`);
  }
}

function normalizeTranslationContent(content, source) {
  const text = stripThinkingText(content);
  const jsonText = stripJsonFence(text);
  try {
    const repaired = globalThis.JSONRepair.jsonrepair(jsonText);
    const parsed = JSON.parse(repaired);
    const translation = String(parsed?.translation || parsed?.target || parsed?.text || "").trim();
    if (!translation) throw new Error("missing translation");
    return {
      translation,
      alignments: []
    };
  } catch {
    return {
      translation: text,
      alignments: []
    };
  }
}

function normalizeAlignments(value, source, translation) {
  if (!Array.isArray(value)) return [];
  const sourceText = String(source || "");
  const targetText = String(translation || "");
  return value.map((item) => {
    const sourceStart = clampNumber(Math.floor(Number(item?.sourceStart)), 0, sourceText.length);
    const sourceEnd = clampNumber(Math.floor(Number(item?.sourceEnd)), sourceStart, sourceText.length);
    const targetStart = clampNumber(Math.floor(Number(item?.targetStart)), 0, targetText.length);
    const targetEnd = clampNumber(Math.floor(Number(item?.targetEnd)), targetStart, targetText.length);
    if (sourceEnd <= sourceStart || targetEnd <= targetStart) return null;
    return {
      sourceStart,
      sourceEnd,
      targetStart,
      targetEnd,
      sourceText: String(item?.sourceText || sourceText.slice(sourceStart, sourceEnd)),
      targetText: String(item?.targetText || targetText.slice(targetStart, targetEnd)),
      confidence: clampNumber(Number(item?.confidence || 0), 0, 1)
    };
  }).filter(Boolean);
}

function formatWordInfoJson(parsed) {
  return {
    word: String(parsed?.word || ""),
    phoneticUS: formatPhonetic(parsed?.phoneticUS),
    phoneticUK: formatPhonetic(parsed?.phoneticUK),
    partsOfSpeech: normalizePartsOfSpeech(parsed?.partsOfSpeech || parsed?.pos || parsed?.meanings),
    inflections: normalizeArray(parsed?.inflections || parsed?.forms),
    definitionsZh: normalizeArray(parsed?.definitionsZh),
    definitionsEn: normalizeArray(parsed?.definitionsEn),
    webDefinitions: normalizeArray(parsed?.webDefinitions || parsed?.networkDefinitions || parsed?.webMeanings),
    synonyms: normalizeArray(parsed?.synonyms),
    antonyms: normalizeArray(parsed?.antonyms),
    examples: normalizeExamples(parsed?.examples),
    speechUrls: normalizeSpeechUrls(parsed?.speechUrls || parsed?.audioUrls || parsed?.pronunciationUrls),
    raw: parsed
  };
}

function normalizeSpeechUrls(value) {
  const source = normalizeObject(value, {});
  return {
    us: normalizeYoudaoAudioUrl(source.us || source.US || source.american || source.am),
    uk: normalizeYoudaoAudioUrl(source.uk || source.UK || source.british || source.en)
  };
}

function normalizePartsOfSpeech(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { pos: "", meaning: item.trim() };
    return {
      pos: String(item?.pos || item?.partOfSpeech || item?.type || "").trim(),
      meaning: String(item?.meaning || item?.zh || item?.definition || "").trim()
    };
  }).filter((item) => item.pos || item.meaning);
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(formatDictionaryItem).filter(Boolean);
}

function formatDictionaryItem(item) {
  if (Array.isArray(item)) {
    return item.map((part) => String(part || "").trim()).filter(Boolean).join(" / ");
  }
  if (item && typeof item === "object") {
    return [item.zh, item.en, item.word, item.meaning, item.definition]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" / ");
  }
  return String(item || "").trim();
}

function stripJsonFence(text) {
  return String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function stripThinkingText(content) {
  return String(content || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .trim();
}

function formatPhonetic(value) {
  const text = String(value || "")
    .replace(/^(美|英|us|uk|american|british)\s*[:：]?\s*/i, "")
    .replace(/^\/|\/$/g, "")
    .trim();
  return text ? `/${text}/` : "";
}

function normalizeExamples(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((item) => {
    if (typeof item === "string") return { en: item, zh: "", audioUrl: "" };
    return {
      en: String(item?.en || item?.sentence || "").trim(),
      zh: String(item?.zh || item?.translation || "").trim(),
      audioUrl: normalizeYoudaoAudioUrl(item?.audioUrl || item?.speechUrl || item?.audio || "")
    };
  }).filter((item) => item.en);
}

function normalizeProfile(profile) {
  return {
    ...DEFAULT_PROFILE,
    ...profile,
    id: profile?.id || crypto.randomUUID(),
    endpointPath: profile?.endpointPath || "/chat/completions",
    authType: profile?.authType || "bearer",
    translationMode: ["auto-zh-en", "manual"].includes(profile?.translationMode)
      ? profile.translationMode
      : DEFAULT_PROFILE.translationMode,
    sourceLanguage: String(profile?.sourceLanguage || DEFAULT_PROFILE.sourceLanguage).trim() || DEFAULT_PROFILE.sourceLanguage,
    targetLanguage: String(profile?.targetLanguage || DEFAULT_PROFILE.targetLanguage).trim() || DEFAULT_PROFILE.targetLanguage,
    extraBody: normalizeObject(profile?.extraBody, DEFAULT_PROFILE.extraBody),
    userPromptTemplate: String(profile?.userPromptTemplate || DEFAULT_PROFILE.userPromptTemplate).trim() || DEFAULT_PROFILE.userPromptTemplate,
    priority: clampNumber(Number(profile?.priority || DEFAULT_PROFILE.priority), 1, 999),
    enabled: typeof profile?.enabled === "boolean" ? profile.enabled : DEFAULT_PROFILE.enabled
  };
}

async function tryProfiles(config, task) {
  const errors = [];
  const profiles = getProfilesByPriority(config);
  if (!profiles.length) {
    throw new Error("没有启用的大模型配置。请在配置页启用内置翻译，或至少启用一个大模型配置。");
  }
  for (const profile of profiles) {
    try {
      return await task(profile);
    } catch (error) {
      errors.push(`${profile.name || profile.model}: ${normalizeError(error)}`);
    }
  }
  throw new Error(`所有模型均不可用：${errors.join("；")}`);
}

function getProfilesByPriority(config) {
  // 筛选出启用的模型
  const enabledProfiles = config.profiles.filter(profile => profile.enabled);

  if (enabledProfiles.length === 0) {
    return [];
  }

  const order = new Map(config.profiles.map((profile, index) => [profile.id, index]));

  // 按优先级排序
  return enabledProfiles.sort((a, b) =>
    Number(a.priority || 999) - Number(b.priority || 999) ||
    Number(order.get(a.id) ?? 999) - Number(order.get(b.id) ?? 999)
  );
}

async function requestChatCompletion(profile, messages, temperature, meta = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(profile.timeoutMs) || 45000);
  const requestBody = buildChatRequestBody(profile, messages, temperature);
  const startedAt = Date.now();
  const url = joinUrl(profile.baseUrl, profile.endpointPath);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: buildHeaders(profile),
      body: JSON.stringify(requestBody)
    });

    const bodyText = await response.text();
    let body;
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = { raw: bodyText };
    }

    if (!response.ok) {
      const detail = body?.error?.message || body?.message || bodyText || response.statusText;
      await saveRequestLog(meta.settings, {
        type: meta.type || "chat",
        ok: false,
        durationMs: Date.now() - startedAt,
        profile,
        url,
        requestBody,
        responseStatus: response.status,
        responseBody: body,
        responseText: bodyText,
        error: detail
      });
      throw new Error(`接口请求失败 (${response.status}): ${detail}`);
    }

    await saveRequestLog(meta.settings, {
      type: meta.type || "chat",
      ok: true,
      durationMs: Date.now() - startedAt,
      profile,
      url,
      requestBody,
      responseStatus: response.status,
      responseBody: body,
      responseText: bodyText
    });
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function saveRequestLog(settings, entry) {
  if (!settings?.requestLogging) return;
  const saved = await browserApi.storage.local.get("requestLogs").catch(() => ({}));
  const logs = Array.isArray(saved.requestLogs) ? saved.requestLogs : [];
  const item = {
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    type: entry.type,
    ok: entry.ok,
    durationMs: entry.durationMs,
    profileName: entry.profile?.name || "",
    model: entry.profile?.model || "",
    presetId: entry.profile?.presetId || "",
    url: entry.url,
    requestBody: entry.requestBody,
    responseStatus: entry.responseStatus,
    responseBody: entry.responseBody,
    responseText: entry.responseText,
    error: entry.error || ""
  };
  await browserApi.storage.local.set({ requestLogs: [item, ...logs].slice(0, 20) }).catch(() => {});
}

function buildChatRequestBody(profile, messages, temperature) {
  const body = {
    model: profile.model,
    temperature,
    messages
  };
  Object.assign(body, normalizeObject(profile.extraBody, {}));
  return body;
}

function inferProviderFromBaseUrl(baseUrl) {
  const value = String(baseUrl || "").toLowerCase();
  if (value.includes("dashscope.aliyuncs.com")) return "dashscope";
  if (value.includes("siliconflow.cn")) return "siliconflow";
  if (value.includes("moonshot.ai")) return "kimi";
  if (value.includes("bigmodel.cn")) return "zhipu";
  if (value.includes("openrouter.ai")) return "openrouter";
  if (value.includes("api.openai.com")) return "openai";
  if (value.includes("api.deepseek.com")) return "deepseek";
  if (value.includes("codingplanx.ai")) return "codeplan";
  return "";
}

function normalizeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function extractChatContent(body) {
  return body?.choices?.[0]?.message?.content ??
    body?.choices?.[0]?.text ??
    body?.reply ??
    body?.output_text ??
    body?.message?.content;
}

function buildHeaders(config) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (config.apiKey && config.authType !== "none") {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
}

function buildTranslationMessages(profile, text, mode, context, targetLanguage = resolveTargetLanguage(text, DEFAULT_CONFIG.settings)) {
  if (isHyTranslationModel(profile) || isTranslateGemmaModel(profile)) {
    return [{ role: "user", content: buildHyTranslationPrompt(text, targetLanguage, context) }];
  }

  // 检查是否是本地模型（LM Studio），如果是，只发送用户提示，避免系统提示导致的模板错误
  const isLocalModel = profile.baseUrl?.includes("localhost") || profile.baseUrl?.includes("127.0.0.1") || profile.baseUrl?.includes("macmini");
  if (isLocalModel) {
    const userPrompt = buildUserPrompt(profile, text, mode, targetLanguage, context);
    // 将系统提示内容合并到用户提示中，以确保模型能够理解任务要求
    const combinedPrompt = `${normalizeTranslationSystemPrompt(profile.systemPrompt)}\n\n${userPrompt}`;
    return [{ role: "user", content: combinedPrompt }];
  }

  // 对于其他模型，保持原有的系统提示 + 用户提示的格式
  return [
    {
      role: "system",
      content: normalizeTranslationSystemPrompt(profile.systemPrompt)
    },
    { role: "user", content: buildUserPrompt(profile, text, mode, targetLanguage, context) }
  ];
}

function resolveTargetLanguage(text, settings) {
  const translationSettings = getTranslationSettings(settings);
  if (translationSettings.translationMode === "manual") {
    return translationSettings.targetLanguage;
  }
  return isMostlyChinese(text) ? "English" : translationSettings.targetLanguage;
}

function resolveSourceLanguage(settings) {
  const translationSettings = getTranslationSettings(settings);
  return translationSettings.translationMode === "manual" ? translationSettings.sourceLanguage : "";
}

function getTranslationSettings(settings = {}) {
  return {
    translationMode: ["auto-zh-en", "manual"].includes(settings.translationMode)
      ? settings.translationMode
      : DEFAULT_CONFIG.settings.translationMode,
    sourceLanguage: String(settings.sourceLanguage || DEFAULT_CONFIG.settings.sourceLanguage).trim() || DEFAULT_CONFIG.settings.sourceLanguage,
    targetLanguage: String(settings.targetLanguage || DEFAULT_CONFIG.settings.targetLanguage).trim() || DEFAULT_CONFIG.settings.targetLanguage
  };
}

function isMostlyChinese(text) {
  const normalized = String(text || "").replace(/\s+/g, "");
  if (!normalized) return false;
  const chineseCount = (normalized.match(/[\u3400-\u9fff]/g) || []).length;
  const latinCount = (normalized.match(/[A-Za-z]/g) || []).length;
  return chineseCount > 0 && chineseCount / Math.max(1, chineseCount + latinCount) >= 0.3;
}

function normalizeTranslationSystemPrompt(prompt) {
  return String(prompt || "")
    .replace(/\s*Return only the translation\.?\s*$/i, "")
    .trim();
}

function isHyTranslationModel(profile) {
  return /^hy[-_]?mt/i.test(String(profile?.model || ""));
}

function isTranslateGemmaModel(profile) {
  return /translategemma/i.test(String(profile?.model || ""));
}

function buildHyTranslationPrompt(text, targetLanguage, context = {}) {
  const lines = [
    context.sourceLanguage && context.sourceLanguage !== "自动检测"
      ? `请将下面内容从${context.sourceLanguage}翻译成${targetLanguage}，只输出译文。`
      : `请将下面内容翻译成${targetLanguage}，只输出译文。`,
    "不要解释。不要添加替代方案。当换行具有意义时，请保持原有的换行格式。"
  ];

  if (context.scope) {
    lines.push("", "上下文：", context.scope);
  }

  if (Array.isArray(context.previousTranslations) && context.previousTranslations.length) {
    lines.push("", "之前的翻译结果：");
    for (const item of context.previousTranslations.slice(-3)) {
      lines.push(`${item.source} => ${item.translation}`);
    }
  }

  lines.push("", "待翻译内容：", text);
  return lines.join("\n");
}

function buildWordInfoMessages(profile, word) {
  const systemPrompt = "You are a bilingual English dictionary. Return only valid compact JSON. Do not wrap it in markdown.";
  const userPrompt = buildWordInfoPrompt(word);

  if (isHyTranslationModel(profile) || isTranslateGemmaModel(profile)) {
    return [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }];
  }

  const isLocalModel = profile.baseUrl?.includes("localhost") || profile.baseUrl?.includes("127.0.0.1") || profile.baseUrl?.includes("macmini");
  if (isLocalModel) {
    return [{ role: "user", content: `${systemPrompt}\n\n${userPrompt}` }];
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
}

function buildUserPrompt(profile, text, mode, targetLanguage, context = {}) {
  const labels = {
    selection: "selected text",
    sentence: "sentence",
    paragraph: "paragraph",
    input: "input text"
  };

  const previousTranslations = Array.isArray(context.previousTranslations)
    ? context.previousTranslations
      .slice(-3)
      .map((item) => `- ${item.mode}: ${item.source}\n  => ${item.translation}`)
      .join("\n")
    : "";

  const contextBlock = context.scope ? `Surrounding context:\n${context.scope}` : "";
  const previousTranslationsBlock = previousTranslations
    ? `Previous translations in the same popup:\n${previousTranslations}`
    : "";

  return renderPromptTemplate(profile.userPromptTemplate, {
    instruction: buildTranslateInstruction(labels[mode] || "text", targetLanguage, context.sourceLanguage),
    modeLabel: labels[mode] || "text",
    targetLanguage,
    sourceLanguage: context.sourceLanguage || "",
    context: context.scope || "",
    contextBlock,
    previousTranslations,
    previousTranslationsBlock,
    text
  });
}

function buildTranslateInstruction(label, targetLanguage, sourceLanguage) {
  if (sourceLanguage && sourceLanguage !== "自动检测") {
    return `Translate the following ${label} from ${sourceLanguage} into ${targetLanguage}.`;
  }
  return `Translate the following ${label} into ${targetLanguage}.`;
}

function renderPromptTemplate(template, values) {
  return String(template || DEFAULT_PROFILE.userPromptTemplate)
    .replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function joinUrl(baseUrl, path) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}${path}`;
}

function normalizeError(error) {
  if (error?.name === "AbortError") {
    return "请求超时，请检查本地模型服务是否可用";
  }
  return error?.message || String(error);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
