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
    requestLogging: false
  }
};

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
  });
});

browserApi.commands.onCommand.addListener((command, tab) => {
  if (command !== "translate-selection" || !tab?.id) return;
  browserApi.tabs.sendMessage(tab.id, {
    type: "LIT_TRANSLATE_SELECTION",
    mode: "auto"
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
});

async function getCurrentSettings() {
  const saved = await browserApi.storage.sync.get(null);
  return { ...DEFAULT_CONFIG.settings, ...(saved.settings || {}) };
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
    settings: { ...DEFAULT_CONFIG.settings, ...(saved.settings || {}) }
  };
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

    const targetLanguage = resolveTargetLanguage(text, payload.testProfile);
    const requestContext = {
      ...context,
      sourceLanguage: resolveSourceLanguage(payload.testProfile)
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
      { type: "translate", settings: await getCurrentSettings() }
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

  return tryProfiles(config, async (profile) => {
    const targetLanguage = resolveTargetLanguage(text, profile);
    const requestContext = {
      ...context,
      sourceLanguage: resolveSourceLanguage(profile)
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
    raw: parsed
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
    if (typeof item === "string") return { en: item, zh: "" };
    return {
      en: String(item?.en || item?.sentence || "").trim(),
      zh: String(item?.zh || item?.translation || "").trim()
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
  for (const profile of getProfilesByPriority(config)) {
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
  await browserApi.storage.local.set({ requestLogs: [item, ...logs].slice(0, 50) }).catch(() => {});
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

function buildTranslationMessages(profile, text, mode, context, targetLanguage = resolveTargetLanguage(text, profile)) {
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

function resolveTargetLanguage(text, profile) {
  if (profile.translationMode === "manual") {
    return profile.targetLanguage || DEFAULT_PROFILE.targetLanguage;
  }
  return isMostlyChinese(text) ? "English" : (profile.targetLanguage || DEFAULT_PROFILE.targetLanguage);
}

function resolveSourceLanguage(profile) {
  return profile.translationMode === "manual" ? profile.sourceLanguage : "";
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
