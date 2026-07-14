"use strict";

const vscode = require("vscode");

const ENGLISH_WORD_PATTERN = /^[A-Za-z][A-Za-z'-]*$/;
const CHINESE_WORD_PATTERN = /^[\u3400-\u9fff]{1,12}$/;
const translationCache = new Map();
const pendingTranslations = new Map();
const wordInfoCache = new Map();
const pendingWordInfo = new Map();
const PRONUNCIATION_DOMAIN = "https://dict.youdao.com";
const TRANSLATION_CACHE_LIMIT = 500;
const WORD_INFO_CACHE_LIMIT = 1000;
const TRANSLATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const WORD_INFO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let pronunciationPanel;
let keyboardHoverRequestExpiresAt = 0;

function activate(context) {
  ensurePronunciationDomainTrusted().catch((error) => {
    console.warn("AI Translate could not update trusted domains:", formatError(error));
  });

  const provider = vscode.languages.registerHoverProvider({ scheme: "*" }, {
    provideHover(document, position, token) {
      const keyboardInitiated = Date.now() < keyboardHoverRequestExpiresAt;
      if (!isHoverTriggerEnabled() && !keyboardInitiated) return undefined;
      if (keyboardInitiated) keyboardHoverRequestExpiresAt = 0;
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document !== document || editor.selection.isEmpty) return undefined;

      const selectedRange = new vscode.Range(editor.selection.start, editor.selection.end);
      if (!isHoveringSelectedWord(document, selectedRange, position)) return undefined;

      const selectedText = document.getText(selectedRange).trim();
      if (!isSingleWord(selectedText)) return undefined;

      return provideDelayedHover(document, selectedRange, selectedText, token);
    }
  });

  const command = vscode.commands.registerCommand("aiTranslateHover.translateSelection", async () => {
    if (!isKeyboardTriggerEnabled()) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showInformationMessage("AI Translate: select one word first.");
      return;
    }
    const text = editor.document.getText(editor.selection).trim();
    if (!isSingleWord(text)) {
      vscode.window.showInformationMessage("AI Translate: the selection must be one word.");
      return;
    }
    keyboardHoverRequestExpiresAt = Date.now() + 1000;
    await vscode.commands.executeCommand("editor.action.showHover");
  });

  const openSettingsCommand = vscode.commands.registerCommand("aiTranslateHover.openSettings", () =>
    vscode.commands.executeCommand("workbench.action.openSettings", "@ext:local-ai-translate.ai-translate-hover")
  );
  const playPronunciationCommand = vscode.commands.registerCommand("aiTranslateHover.playPronunciation", (audioUrl, label) =>
    playPronunciation(audioUrl, label)
  );
  const updateKeyboardTriggerContext = () =>
    vscode.commands.executeCommand("setContext", "aiTranslateHover.keyboardTriggerEnabled", isKeyboardTriggerEnabled());
  updateKeyboardTriggerContext();
  const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("aiTranslateHover.triggerMode")) {
      updateKeyboardTriggerContext();
    }
  });

  context.subscriptions.push(provider, command, openSettingsCommand, playPronunciationCommand, configurationListener);
}

async function provideDelayedHover(document, range, text, token) {
  const config = getConfig();
  await delay(config.hoverDelayMs, token);
  if (token.isCancellationRequested || !selectionStillMatches(document, range, text)) return undefined;

  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = { enabledCommands: ["aiTranslateHover.playPronunciation"] };
  markdown.appendMarkdown(`**${escapeMarkdown(text)}**\n\n`);
  try {
    const wordInfo = ENGLISH_WORD_PATTERN.test(text) ? await getWordInfo(text, token).catch(() => null) : null;
    const translation = wordInfo ? "" : await translate(text, token);
    if (token.isCancellationRequested || !selectionStillMatches(document, range, text)) return undefined;
    appendDictionaryMarkdown(markdown, wordInfo, translation);
  } catch (error) {
    if (token.isCancellationRequested) return undefined;
    markdown.appendMarkdown(`Translation failed: ${escapeMarkdown(formatError(error))}`);
  }
  return new vscode.Hover(markdown, range);
}

function appendDictionaryMarkdown(markdown, wordInfo, translation) {
  if (wordInfo) {
    const pronunciations = [];
    if (wordInfo.phoneticUK) pronunciations.push(`英 /${escapeMarkdown(wordInfo.phoneticUK)}/`);
    if (wordInfo.speechUrls.uk) pronunciations.push(toPronunciationCommandLink("英式发音", wordInfo.speechUrls.uk));
    if (wordInfo.phoneticUS) pronunciations.push(`美 /${escapeMarkdown(wordInfo.phoneticUS)}/`);
    if (wordInfo.speechUrls.us) pronunciations.push(toPronunciationCommandLink("美式发音", wordInfo.speechUrls.us));
    if (pronunciations.length) markdown.appendMarkdown(`${pronunciations.join("  ")}\n\n`);

    appendDefinitionList(markdown, "中文释义", wordInfo.definitionsZh);
    appendDefinitionList(markdown, "English definitions", wordInfo.definitionsEn);
    return;
  }
  markdown.appendMarkdown(escapeMarkdown(translation));
}

function appendDefinitionList(markdown, title, definitions) {
  const items = Array.isArray(definitions) ? definitions.filter(Boolean).slice(0, 6) : [];
  if (!items.length) return;
  markdown.appendMarkdown(`**${title}**\n\n`);
  for (const item of items) markdown.appendMarkdown(`- ${escapeMarkdown(item)}\n`);
  markdown.appendMarkdown("\n");
}

function toPronunciationCommandLink(label, url) {
  const safeUrl = normalizeYoudaoAudioUrl(url);
  if (!safeUrl) return "";
  const args = encodeURIComponent(JSON.stringify([safeUrl, label]));
  return `[${label}](command:aiTranslateHover.playPronunciation?${args})`;
}

function playPronunciation(audioUrl, label = "Pronunciation") {
  if (Array.isArray(audioUrl)) [audioUrl, label = "Pronunciation"] = audioUrl;
  const safeUrl = normalizeYoudaoAudioUrl(audioUrl);
  if (!safeUrl) {
    vscode.window.showErrorMessage("AI Translate: invalid pronunciation URL.");
    return;
  }
  if (!pronunciationPanel) {
    pronunciationPanel = vscode.window.createWebviewPanel(
      "aiTranslateHover.pronunciation",
      "AI Translate Pronunciation",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    );
    pronunciationPanel.onDidDispose(() => { pronunciationPanel = undefined; });
    pronunciationPanel.webview.html = createPronunciationPlayerHtml(safeUrl, label);
  }
  pronunciationPanel.title = `AI Translate: ${label}`;
  pronunciationPanel.webview.postMessage({ type: "setAudio", audioUrl: safeUrl, label });
}

function createPronunciationPlayerHtml(initialAudioUrl = "", initialLabel = "Pronunciation") {
  const safeInitialAudioUrl = normalizeYoudaoAudioUrl(initialAudioUrl);
  const initialPayload = Buffer.from(JSON.stringify({
    audioUrl: safeInitialAudioUrl,
    label: String(initialLabel || "Pronunciation")
  }), "utf8").toString("base64");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src https://dict.youdao.com; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 20px; }
    h1 { font-size: 16px; font-weight: 600; margin: 0 0 14px; }
    audio { width: 100%; }
  </style>
</head>
<body>
  <h1 id="label">Pronunciation</h1>
  <audio id="pronunciation" controls></audio>
  <script>
    const player = document.getElementById('pronunciation');
    const label = document.getElementById('label');
    function setAudio(message) {
      player.pause();
      label.textContent = message.label || 'Pronunciation';
      player.src = message.audioUrl;
      player.load();
      player.play().catch(() => {});
    }
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'setAudio') setAudio(event.data);
    });
    const initialPayload = JSON.parse(atob(${JSON.stringify(initialPayload)}));
    if (initialPayload.audioUrl) setAudio(initialPayload);
  </script>
</body>
</html>`;
}

function selectionStillMatches(document, range, text) {
  const editor = vscode.window.activeTextEditor;
  return Boolean(
    editor &&
    editor.document === document &&
    editor.selection.start.isEqual(range.start) &&
    editor.selection.end.isEqual(range.end) &&
    document.getText(range).trim() === text
  );
}

function isHoveringSelectedWord(document, selectionRange, position) {
  if (selectionRange.contains(position)) return true;

  // VS Code may report an adjacent position when the pointer is on a selection edge.
  if (selectionRange.start.line === selectionRange.end.line && position.line === selectionRange.start.line) {
    return position.character >= Math.max(0, selectionRange.start.character - 1) &&
      position.character <= selectionRange.end.character + 1;
  }

  const hoveredWordRange = document.getWordRangeAtPosition(position, /[A-Za-z][A-Za-z'-]*/);
  return Boolean(
    hoveredWordRange &&
    normalizeWordForMatch(document.getText(hoveredWordRange)) === normalizeWordForMatch(document.getText(selectionRange))
  );
}

function normalizeWordForMatch(value) {
  return String(value || "").trim().toLowerCase();
}

function delay(milliseconds, token) {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    const cancellation = token.onCancellationRequested(finish);
    function finish() {
      clearTimeout(timer);
      cancellation.dispose();
      resolve();
    }
  });
}

async function translate(text, token) {
  const config = getConfig();
  const cacheKey = JSON.stringify([text.toLowerCase(), config.builtinApiEnabled, config.baseUrl, config.endpointPath, config.model, config.targetLanguage]);
  const cached = readCache(translationCache, cacheKey);
  if (cached !== undefined) return cached;
  if (!pendingTranslations.has(cacheKey)) {
    pendingTranslations.set(cacheKey, requestWithFallback(text, config, token));
  }
  try {
    const result = await pendingTranslations.get(cacheKey);
    writeCache(translationCache, cacheKey, result, TRANSLATION_CACHE_LIMIT, TRANSLATION_CACHE_TTL_MS);
    return result;
  } finally {
    pendingTranslations.delete(cacheKey);
  }
}

async function requestWithFallback(text, config, token) {
  if (config.builtinApiEnabled) {
    try {
      const builtinTranslation = await requestYoudaoTranslation(text, config, token);
      if (builtinTranslation) return builtinTranslation;
    } catch (error) {
      if (isCancellationError(error)) throw error;
      // The configured model remains the fallback when the built-in service is unavailable.
    }
  }
  return requestTranslation(text, config, token);
}

async function getWordInfo(word, token) {
  const key = word.toLowerCase();
  const cached = readCache(wordInfoCache, key);
  if (cached !== undefined) return cached;
  if (!pendingWordInfo.has(key)) pendingWordInfo.set(key, requestYoudaoWordInfo(word, token));
  try {
    const result = await pendingWordInfo.get(key);
    if (result) writeCache(wordInfoCache, key, result, WORD_INFO_CACHE_LIMIT, WORD_INFO_CACHE_TTL_MS);
    return result;
  } finally {
    pendingWordInfo.delete(key);
  }
}

async function requestYoudaoWordInfo(word, token) {
  const url = `https://mobile.youdao.com/dict?le=eng&q=${encodeURIComponent(word)}`;
  const [response, englishDefinitions] = await Promise.all([
    fetchWithTimeout(url, {
        method: "GET",
        headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" }
      }, 6000, token),
    fetchYoudaoEnglishDefinitions(word, token).catch((error) => {
      if (isCancellationError(error)) throw error;
      return [];
    })
  ]);
  if (!response.ok) throw new Error(`Youdao dictionary HTTP ${response.status}`);
  const info = parseYoudaoWordInfo(await response.text(), word);
  return info ? { ...info, definitionsEn: englishDefinitions } : null;
}

async function fetchYoudaoEnglishDefinitions(word, token) {
  const response = await fetchWithTimeout(
    `https://mobile.youdao.com/singledict?q=${encodeURIComponent(word)}&dict=ee&le=eng&more=false`,
    {
      headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" }
    },
    6000,
    token
  );
  if (!response.ok) return [];
  return parseYoudaoEnglishDefinitions(await response.text());
}

async function requestYoudaoTranslation(text, config, token) {
  const response = await fetchWithTimeout("https://mobile.youdao.com/translate", {
      method: "POST",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://mobile.youdao.com",
        Pragma: "no-cache",
        "Cache-Control": "no-cache"
      },
      body: new URLSearchParams({ inputtext: text, type: "AUTO" })
    }, 8000, token);
  if (!response.ok) throw new Error(`Youdao HTTP ${response.status}`);
  return parseYoudaoMobileTranslation(await response.text());
}

async function requestTranslation(text, config, token) {
  const targetLanguage = isMostlyChinese(text) ? "English" : config.targetLanguage;
  const url = joinUrl(config.baseUrl, config.endpointPath);
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "You are a precise translation engine. Return only the translation. Do not explain."
          },
          {
            role: "user",
            content: `Translate the following word to ${targetLanguage}. Preserve technical terms when appropriate.\n\nWord: ${text}`
          }
        ]
      })
    }, config.timeoutMs, token);
    const bodyText = await response.text();
    let body;
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = {}; }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body?.error?.message || body?.message || bodyText || response.statusText}`);
    }
    const result = String(body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.text ?? body?.output_text ?? "").trim();
    if (!result) throw new Error("API response did not contain translated text.");
    return stripThinking(result);
  } catch (error) {
    if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
      throw new Error(`Cannot reach ${url}. Start the local model service or set AI Translate Hover baseUrl to your OpenAI-compatible API.`);
    }
    throw error;
  }
}

async function fetchWithTimeout(url, options, timeoutMs, token) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancellation = token?.onCancellationRequested?.(() => controller.abort());
  try {
    if (token?.isCancellationRequested) throw new Error("Request cancelled.");
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      if (token?.isCancellationRequested) throw new Error("Request cancelled.");
      if (timedOut) throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    cancellation?.dispose();
  }
}

function readCache(cache, key, now = Date.now()) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function writeCache(cache, key, value, limit, ttlMs, now = Date.now()) {
  cache.delete(key);
  while (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expiresAt: now + ttlMs });
}

function isCancellationError(error) {
  return formatError(error) === "Request cancelled.";
}

function getConfig() {
  const settings = vscode.workspace.getConfiguration("aiTranslateHover");
  return {
    baseUrl: String(settings.get("baseUrl") || "http://localhost:1234/v1"),
    endpointPath: String(settings.get("endpointPath") || "/chat/completions"),
    model: String(settings.get("model") || "local-model"),
    apiKey: String(settings.get("apiKey") || ""),
    targetLanguage: String(settings.get("targetLanguage") || "简体中文"),
    triggerMode: normalizeTriggerMode(settings.get("triggerMode")),
    builtinApiEnabled: settings.get("builtinApiEnabled") !== false,
    trustPronunciationDomainOnActivate: settings.get("trustPronunciationDomainOnActivate") !== false,
    hoverDelayMs: Math.max(1000, Number(settings.get("hoverDelayMs")) || 1000),
    timeoutMs: Math.max(1000, Number(settings.get("timeoutMs")) || 45000)
  };
}

function normalizeTriggerMode(value) {
  return ["hover", "keyboard", "hoverAndKeyboard"].includes(value) ? value : "hover";
}

function isHoverTriggerEnabled() {
  return getConfig().triggerMode !== "keyboard";
}

function isKeyboardTriggerEnabled() {
  return getConfig().triggerMode !== "hover";
}

async function ensurePronunciationDomainTrusted() {
  const extensionSettings = vscode.workspace.getConfiguration("aiTranslateHover");
  if (extensionSettings.get("trustPronunciationDomainOnActivate") === false) return false;
  const workbenchSettings = vscode.workspace.getConfiguration("workbench");
  const existing = workbenchSettings.get("trustedDomains", []);
  const domains = mergeTrustedDomains(existing, PRONUNCIATION_DOMAIN);
  if (Array.isArray(existing) && domains.length === existing.length) return false;
  await workbenchSettings.update("trustedDomains", domains, vscode.ConfigurationTarget.Global);
  return true;
}

function mergeTrustedDomains(existing, domain) {
  const domains = Array.isArray(existing) ? existing.filter((item) => typeof item === "string" && item.trim()) : [];
  return domains.some((item) => item.toLowerCase() === domain.toLowerCase()) ? domains : [...domains, domain];
}

function parseYoudaoMobileTranslation(html) {
  const startMatch = /<ul\s+id=["']translateResult["'][^>]*>/i.exec(String(html || ""));
  if (!startMatch || startMatch.index === undefined) return "";
  const rest = String(html).slice(startMatch.index + startMatch[0].length);
  const endIndex = rest.search(/<\/ul>/i);
  const section = endIndex >= 0 ? rest.slice(0, endIndex) : rest;
  const lines = [];
  const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = itemPattern.exec(section))) {
    const line = decodeHtmlEntities(match[1].replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
    if (line) lines.push(line);
  }
  return lines.join("\n").trim();
}

function parseYoudaoWordInfo(html, queryWord) {
  const text = String(html || "");
  if (!text || /该词条暂未被收录/i.test(text)) return null;
  const section = extractHtmlSection(text, /<div\s+id=["']ec["'][^>]*>/i, /<div\s+id=["']collins_contentWrp["'][^>]*>/i);
  if (!section) return null;
  const phonetics = { us: "", uk: "" };
  const speechUrls = { us: "", uk: "" };
  const phoneticPattern = /<span\b[^>]*>\s*(英|美)[\s\S]*?<span\s+class=["']phonetic["'][^>]*>\s*([^<]*)<\/span>/gi;
  let match;
  while ((match = phoneticPattern.exec(section))) {
    phonetics[match[1] === "英" ? "uk" : "us"] = cleanHtmlText(match[2]).replace(/^\[|\]$/g, "");
  }
  const speechPattern = /data-rel=["']([^"']*dictvoice\?[^"']*type=(1|2)[^"']*)["']/gi;
  while ((match = speechPattern.exec(section))) {
    speechUrls[match[2] === "1" ? "uk" : "us"] = normalizeYoudaoAudioUrl(decodeHtmlEntities(match[1]));
  }
  const definitionsZh = [];
  const listHtml = /<ul\b[^>]*>([\s\S]*?)<\/ul>/i.exec(section)?.[1] || "";
  const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  while ((match = itemPattern.exec(listHtml))) {
    const definition = cleanHtmlText(match[1]);
    if (definition) definitionsZh.push(definition);
  }
  return { word: extractYoudaoHeadword(section) || queryWord, phoneticUS: phonetics.us, phoneticUK: phonetics.uk, speechUrls, definitionsZh: uniqueStrings(definitionsZh), definitionsEn: [] };
}

function parseYoudaoEnglishDefinitions(html) {
  const definitions = [];
  const pattern = /<li\b[^>]*class=["'][^"']*\bper-tran\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    const definition = cleanHtmlText(match[1]).replace(/^\d+\.\s*/, "").replace(/^[a-z]+\.\s*/i, "").trim();
    if (definition) definitions.push(definition);
  }
  return uniqueStrings(definitions);
}

function extractHtmlSection(html, startPattern, endPattern) {
  const startMatch = startPattern.exec(html);
  if (!startMatch || startMatch.index === undefined) return "";
  const rest = html.slice(startMatch.index + startMatch[0].length);
  const endMatch = endPattern.exec(rest);
  return endMatch ? html.slice(startMatch.index, startMatch.index + startMatch[0].length + endMatch.index) : html.slice(startMatch.index);
}

function extractYoudaoHeadword(section) {
  const match = /<h2\b[^>]*>[\s\S]*?<span\b[^>]*>\s*([\s\S]*?)\s*<\/span>/i.exec(section);
  return cleanHtmlText(match?.[1] || "");
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function uniqueStrings(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeYoudaoAudioUrl(url) {
  const value = String(url || "").trim();
  try {
    const parsed = new URL(value.startsWith("//") ? `https:${value}` : value);
    return parsed.protocol === "https:" && parsed.hostname === "dict.youdao.com" && parsed.pathname === "/dictvoice" ? parsed.href : "";
  } catch {
    return "";
  }
}

function decodeHtmlEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#")) {
      const code = key[1] === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return named[key] || "";
  });
}

function isSingleWord(text) {
  const value = String(text).trim();
  return ENGLISH_WORD_PATTERN.test(value) || CHINESE_WORD_PATTERN.test(value);
}

function isMostlyChinese(text) {
  const normalized = String(text).replace(/\s+/g, "");
  const chinese = (normalized.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (normalized.match(/[A-Za-z]/g) || []).length;
  return chinese > 0 && chinese / Math.max(1, chinese + latin) >= 0.3;
}

function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

function stripThinking(text) {
  return String(text).replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
}

function escapeMarkdown(text) {
  return String(text).replace(/([\\`*_{}[\]<>])/g, "\\$1");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  isSingleWord,
  isMostlyChinese,
  joinUrl,
  stripThinking,
  requestTranslation,
  requestWithFallback,
  requestYoudaoTranslation,
  requestYoudaoWordInfo,
  parseYoudaoMobileTranslation,
  parseYoudaoWordInfo,
  parseYoudaoEnglishDefinitions,
  mergeTrustedDomains,
  toPronunciationCommandLink,
  createPronunciationPlayerHtml,
  normalizeWordForMatch,
  normalizeTriggerMode,
  fetchWithTimeout,
  readCache,
  writeCache
};
