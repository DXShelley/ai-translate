importScripts("vendor/jsonrepair.min.js");

const DEFAULT_PROFILE = {
  id: "default",
  name: "本地模型",
  apiType: "openai-chat",
  baseUrl: "http://localhost:1234/v1",
  endpointPath: "/chat/completions",
  apiKey: "",
  model: "local-model",
  authType: "bearer",
  targetLanguage: "简体中文",
  temperature: 0.2,
  timeoutMs: 45000,
  priority: 1,
  systemPrompt:
    "You are a precise translation engine. Translate faithfully, keep formatting where useful, preserve names, code, URLs, numbers, and technical terms. Return only the translation."
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
    bilingualLayout: "vertical"
  }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "翻译选中文本",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "translate-selection" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "LIT_TRANSLATE_SELECTION",
    mode: "selection",
    text: info.selectionText || ""
  });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "translate-selection" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "LIT_TRANSLATE_SELECTION",
    mode: "selection"
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

async function getConfig() {
  const saved = await chrome.storage.sync.get(null);
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
  const config = await getConfig();
  const text = String(payload?.text || "").trim();
  const mode = payload?.mode || "selection";
  const context = payload?.context || {};

  if (!text) {
    throw new Error("没有可翻译的文本");
  }

  return tryProfiles(config, async (profile) => {
    const body = await requestChatCompletion(
      profile,
      buildTranslationMessages(profile, text, mode, context),
      Number(profile.temperature) || 0
    );

    const content = extractChatContent(body);
    if (!content) {
      throw new Error("接口未返回 choices[0].message.content");
    }

    return {
      source: text,
      translation: String(content).trim(),
      mode,
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
    const body = await requestChatCompletion(profile, [
      {
        role: "system",
        content:
          "You are a bilingual English dictionary. Return only valid compact JSON. Do not wrap it in markdown."
      },
      { role: "user", content: buildWordInfoPrompt(word) }
    ], 0);

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
    '  "definitionsZh": string[],',
    '  "definitionsEn": string[],',
    '  "synonyms": string[],',
    '  "antonyms": string[],',
    '  "examples": [{"en": string, "zh": string}]',
    "}",
    "Rules:",
    "- Return one valid JSON object only.",
    "- Do not add pinyin.",
    "- definitionsZh must be Chinese meanings only.",
    "- definitionsEn must be English definitions only.",
    "- synonyms and antonyms must be flat string arrays.",
    "- Use IPA for phoneticUS and phoneticUK.",
    "- Keep arrays concise, maximum 5 items each. Include 2 classic, natural example sentences."
  ].join("\n");
}

function normalizeWordInfo(content) {
  const text = String(content || "").trim();
  const jsonText = stripJsonFence(text);
  try {
    const repaired = globalThis.JSONRepair.jsonrepair(jsonText);
    const parsed = JSON.parse(repaired);
    return formatWordInfoJson(parsed);
  } catch (error) {
    throw new Error(`词典 JSON 解析失败：${error?.message || String(error)}`);
  }
}

function formatWordInfoJson(parsed) {
  return {
    word: String(parsed?.word || ""),
    phoneticUS: formatPhonetic(parsed?.phoneticUS),
    phoneticUK: formatPhonetic(parsed?.phoneticUK),
    definitionsZh: normalizeArray(parsed?.definitionsZh),
    definitionsEn: normalizeArray(parsed?.definitionsEn),
    synonyms: normalizeArray(parsed?.synonyms),
    antonyms: normalizeArray(parsed?.antonyms),
    examples: normalizeExamples(parsed?.examples),
    raw: parsed
  };
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
    priority: clampNumber(Number(profile?.priority || DEFAULT_PROFILE.priority), 1, 999)
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
  const active = config.activeProfile;
  const rest = config.profiles
    .filter((profile) => profile.id !== active.id)
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
  return [active, ...rest];
}

async function requestChatCompletion(profile, messages, temperature) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(profile.timeoutMs) || 45000);

  try {
    const response = await fetch(joinUrl(profile.baseUrl, profile.endpointPath), {
      method: "POST",
      signal: controller.signal,
      headers: buildHeaders(profile),
      body: JSON.stringify({
        model: profile.model,
        temperature,
        messages
      })
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
      throw new Error(`接口请求失败 (${response.status}): ${detail}`);
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
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

function buildTranslationMessages(profile, text, mode, context) {
  if (isHyTranslationModel(profile)) {
    return [{ role: "user", content: buildHyTranslationPrompt(text, profile.targetLanguage, context) }];
  }

  return [
    { role: "system", content: profile.systemPrompt },
    { role: "user", content: buildUserPrompt(text, mode, profile.targetLanguage, context) }
  ];
}

function isHyTranslationModel(profile) {
  return /^hy[-_]?mt/i.test(String(profile?.model || ""));
}

function buildHyTranslationPrompt(text, targetLanguage, context = {}) {
  const lines = [
    `请将下面内容翻译成${targetLanguage}，只输出译文。`,
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

function buildUserPrompt(text, mode, targetLanguage, context = {}) {
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

  return [
    `Translate the following ${labels[mode] || "text"} into ${targetLanguage}.`,
    "Do not explain. Do not add alternatives. Keep line breaks when they carry meaning.",
    "Use the surrounding context and previous translations to keep terms, names, pronouns, and style consistent.",
    context.scope ? "" : null,
    context.scope ? "Surrounding context:" : null,
    context.scope ? context.scope : null,
    previousTranslations ? "" : null,
    previousTranslations ? "Previous translations in the same popup:" : null,
    previousTranslations || null,
    "",
    "Text to translate:",
    text
  ].filter((line) => line !== null).join("\n");
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
