import { App, Editor, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl, setIcon, type SettingDefinitionItem } from "obsidian";
import vocabularyModule from "../../shared/vocabulary.js";

type VocabularyApi = {
  buildPayload(word: string, info: WordInfo): Record<string, string>;
  buildRequest(template: string, variables: Record<string, string>): Record<string, unknown>;
  parseHeaders(value: string): Record<string, string>;
  applyAuth(headers: Record<string, string>, authType: string, credential: string, encodeBase64: (value: string) => string): void;
  addIdempotencyKey(headers: Record<string, string>, randomUUID: () => string): void;
  createSaveCoordinator(): { run<T>(key: string, save: () => Promise<T>): Promise<T> };
  toQueryEntries(payload: Record<string, unknown>): string[][];
};
const vocabulary = vocabularyModule as VocabularyApi;

const ENGLISH_WORD = /^[A-Za-z][A-Za-z'-]*$/;
const WORD_BOOK_API_URL = "http://127.0.0.1:3000/api/v1/words";
const DEFAULT_TEMPLATE = '{\n  "headword": "{{headword}}",\n  "phoneticUs": "{{phoneticUs}}",\n  "phoneticUk": "{{phoneticUk}}",\n  "definitionZh": "{{definitionZh}}",\n  "definitionEn": "{{definitionEn}}"\n}';

interface WordInfo {
  word: string;
  phoneticUS: string;
  phoneticUK: string;
  definitionsZh: string[];
  definitionsEn: string[];
  speechUrls: { us: string; uk: string };
}

interface AITranslateSettings {
  builtinApiEnabled: boolean;
  baseUrl: string;
  endpointPath: string;
  model: string;
  targetLanguage: string;
  timeoutMs: number;
  vocabularyEnabled: boolean;
  vocabularyAutoSave: boolean;
  vocabularyUrl: string;
  vocabularyMethod: "POST" | "GET";
  vocabularyCustomHeaders: string;
  vocabularyAuthType: "none" | "bearer" | "basic";
  vocabularyAuthCredential: string;
  vocabularyRequestTemplate: string;
}

const DEFAULT_SETTINGS: AITranslateSettings = {
  builtinApiEnabled: true, baseUrl: "http://localhost:1234/v1", endpointPath: "/chat/completions", model: "local-model", targetLanguage: "简体中文", timeoutMs: 45000,
  vocabularyEnabled: false, vocabularyAutoSave: true, vocabularyUrl: WORD_BOOK_API_URL, vocabularyMethod: "POST", vocabularyCustomHeaders: "{}", vocabularyAuthType: "bearer", vocabularyAuthCredential: "", vocabularyRequestTemplate: DEFAULT_TEMPLATE
};

export default class AITranslatePlugin extends Plugin {
  settings: AITranslateSettings = DEFAULT_SETTINGS;
  private readonly wordCache = new Map<string, WordInfo>();
  private readonly vocabularySaveCoordinator = vocabulary.createSaveCoordinator();
  private activeResultModal: ResultModal | null = null;

  async onload() {
    this.settings = migrateSettings(await this.loadData());
    this.addSettingTab(new AITranslateSettingTab(this.app, this));
    this.addRibbonIcon("languages", "AI Translate: 查词或翻译", () => new LookupModal(this.app, this).open());
    this.addCommand({ id: "lookup", name: "查词或翻译", callback: () => new LookupModal(this.app, this).open() });
    this.addCommand({
      id: "lookup-selection", name: "查询选中文本", editorCheckCallback: (checking, editor) => {
        if (!editor.getSelection().trim()) return false;
        if (!checking) void this.lookup(editor.getSelection(), editor);
        return true;
      }
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      const selection = editor.getSelection().trim();
      if (selection) menu.addItem((item) => item.setTitle("AI Translate: 查询选中文本").setIcon("languages").onClick(() => void this.lookup(selection, editor)));
    }));
  }

  async saveSettings() { await this.saveData(this.settings); }

  async lookup(rawText: string, editor?: Editor) {
    const text = rawText.trim();
    if (!text) return;
    const modal = this.activeResultModal?.isOpen()
      ? this.activeResultModal
      : new ResultModal(this.app, this, () => { this.activeResultModal = null; });
    this.activeResultModal = modal;
    if (!modal.isOpen()) modal.open();
    const requestId = modal.beginQuery(text);
    try {
      if (ENGLISH_WORD.test(text)) {
        const info = await this.getWordInfo(text);
        if (!modal.isCurrent(requestId)) return;
        modal.renderWord(info);
        if (this.settings.vocabularyEnabled && this.settings.vocabularyAutoSave) {
          void this.saveVocabulary(text, info).catch((error) => console.warn("AI Translate vocabulary auto-save failed:", error));
        }
      } else {
        const translation = await this.translate(text);
        if (modal.isCurrent(requestId)) modal.renderTranslation(translation);
      }
    } catch (error) {
      if (modal.isCurrent(requestId)) modal.renderError(toErrorMessage(error));
    }
  }

  async getWordInfo(word: string): Promise<WordInfo> {
    const key = word.toLowerCase();
    const cached = this.wordCache.get(key);
    if (cached) return cached;
    let info: WordInfo | null = null;
    if (this.settings.builtinApiEnabled) info = await requestYoudaoWordInfo(word).catch(() => null);
    if (!info) {
      const definition = await this.translate(word);
      info = { word, phoneticUS: "", phoneticUK: "", definitionsZh: [definition], definitionsEn: [], speechUrls: { us: "", uk: "" } };
    }
    this.wordCache.set(key, info);
    return info;
  }

  async translate(text: string): Promise<string> {
    if (this.settings.builtinApiEnabled) {
      const builtin = await requestYoudaoTranslation(text).catch(() => "");
      if (builtin) return builtin;
    }
    const url = joinUrl(this.settings.baseUrl, this.settings.endpointPath);
    const result = await requestUrl({ url, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: this.settings.model, temperature: 0.2, messages: [{ role: "system", content: "You are a precise translation engine. Return only the translation. Do not explain." }, { role: "user", content: `Translate the following text to ${isMostlyChinese(text) ? "English" : this.settings.targetLanguage}.\n\nText: ${text}` }] }), throw: false });
    if (result.status < 200 || result.status >= 300) throw new Error(`翻译接口请求失败 (${result.status}): ${result.text}`);
    const translation = extractTranslation(result.text);
    if (!translation) throw new Error("翻译接口未返回文本");
    return translation;
  }

  async saveVocabulary(word: string, info: WordInfo) {
    if (!this.settings.vocabularyEnabled) throw new Error("单词本适配未启用");
    if (!this.settings.vocabularyUrl) throw new Error("请先在设置中填写单词本 API 地址");
    if (!ENGLISH_WORD.test(word)) throw new Error("单词本仅支持英文单词");
    return this.vocabularySaveCoordinator.run(word, () => this.postVocabulary(word, info));
  }

  private async postVocabulary(word: string, info: WordInfo) {
    const variables = vocabulary.buildPayload(word, info);
    const headers: Record<string, string> = { "Content-Type": "application/json", ...vocabulary.parseHeaders(this.settings.vocabularyCustomHeaders) };
    vocabulary.applyAuth(headers, this.settings.vocabularyAuthType, this.settings.vocabularyAuthCredential, btoa);
    vocabulary.addIdempotencyKey(headers, () => crypto.randomUUID());
    let url = this.settings.vocabularyUrl;
    let body: string | undefined;
    const payload = vocabulary.buildRequest(this.settings.vocabularyRequestTemplate, variables);
    if (this.settings.vocabularyMethod === "GET") {
      const query = new URLSearchParams(vocabulary.toQueryEntries(payload));
      if (query.size) url += `${url.includes("?") ? "&" : "?"}${query}`;
    } else {
      body = JSON.stringify(payload);
    }
    const response = await requestUrl({ url, method: this.settings.vocabularyMethod, headers, body, throw: false });
    if (response.status < 200 || response.status >= 300) throw new Error(`单词本请求失败 (${response.status}): ${response.text}`);
  }
}

class LookupModal extends Modal {
  constructor(app: App, private plugin: AITranslatePlugin) { super(app); }
  onOpen() {
    this.modalEl.addClass("ai-translate-modal", "ai-translate-lookup-modal");
    this.setTitle("AI Translate");
    this.contentEl.createEl("p", { text: "输入英文单词查词，或输入选中的文本进行翻译。", cls: "ai-translate-helper" });
    const form = this.contentEl.createDiv({ cls: "ai-translate-lookup-form" });
    const input = form.createEl("input", { type: "text", placeholder: "输入单词或文本" });
    input.setAttr("aria-label", "输入单词或待翻译文本");
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { this.close(); void this.plugin.lookup(input.value); } });
    window.setTimeout(() => input.focus(), 0);
  }
}

class ResultModal extends Modal {
  private opened = false;
  private currentRequestId = 0;
  constructor(app: App, private plugin: AITranslatePlugin, private readonly onDismiss: () => void) { super(app); }
  onOpen() {
    this.opened = true;
    this.modalEl.addClass("ai-translate-modal", "ai-translate-result-modal");
  }
  onClose() {
    this.opened = false;
    this.currentRequestId += 1;
    this.contentEl.empty();
    this.onDismiss();
  }
  isOpen() { return this.opened; }
  beginQuery(query: string) {
    this.currentRequestId += 1;
    this.setTitle(query);
    this.contentEl.empty();
    this.contentEl.createDiv({ cls: "ai-translate-loading", text: "正在查询..." });
    return this.currentRequestId;
  }
  isCurrent(requestId: number) {
    return this.opened && requestId === this.currentRequestId;
  }
  renderError(error: string) {
    this.contentEl.empty();
    const state = this.contentEl.createDiv({ cls: "ai-translate-state ai-translate-error" });
    state.createEl("strong", { text: "查询失败" });
    state.createEl("p", { text: error });
  }
  renderTranslation(translation: string) {
    this.contentEl.empty();
    const section = this.contentEl.createDiv({ cls: "ai-translate-section ai-translate-translation" });
    section.createDiv({ text: "翻译", cls: "ai-translate-section-title" });
    section.createDiv({ text: translation, cls: "ai-translate-result" });
  }
  renderWord(info: WordInfo) {
    this.contentEl.empty();
    const pronunciation = this.contentEl.createDiv({ cls: "ai-translate-pronunciation" });
    addPronunciation(pronunciation, "英", info.phoneticUK, info.speechUrls.uk);
    addPronunciation(pronunciation, "美", info.phoneticUS, info.speechUrls.us);
    if (!pronunciation.childElementCount) pronunciation.remove();
    appendList(this.contentEl, "中文释义", info.definitionsZh, "zh");
    appendList(this.contentEl, "英文释义", info.definitionsEn, "en");
    if (this.plugin.settings.vocabularyEnabled && !this.plugin.settings.vocabularyAutoSave) {
      const footer = this.contentEl.createDiv({ cls: "ai-translate-actions" });
      const save = footer.createEl("button", { text: "收藏到单词本", cls: "mod-cta ai-translate-save" });
      const word = info.word || this.titleEl.textContent || "";
      save.addEventListener("click", () => void this.plugin.saveVocabulary(word, info).then(() => { save.disabled = true; save.setText("已收藏"); new Notice(`已收藏 ${word}`); }).catch((error) => new Notice(`收藏失败：${toErrorMessage(error)}`)));
    }
  }
}

class AITranslateSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AITranslatePlugin) { super(app, plugin); }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const vocabularyFieldsVisible = () => this.plugin.settings.vocabularyEnabled;
    return [
      {
        type: "group",
        heading: "Translation",
        items: [
          { name: "内置有道服务", desc: "优先使用有道移动词典和翻译；不可用时使用 OpenAI 兼容接口。", control: { type: "toggle", key: "builtinApiEnabled" } },
          { name: "API Base URL", desc: "OpenAI 兼容 API，例如 http://localhost:1234/v1", control: { type: "text", key: "baseUrl" } },
          { name: "Endpoint Path", desc: "通常为 /chat/completions", control: { type: "text", key: "endpointPath" } },
          { name: "Model", desc: "内置服务不可用时使用的模型", control: { type: "text", key: "model" } },
          { name: "目标语言", desc: "非中文文本的翻译目标", control: { type: "text", key: "targetLanguage" } }
        ]
      },
      {
        type: "group",
        heading: "外部单词本",
        items: [
          { name: "启用单词本适配", desc: "仅提交英文单词查询结果；请求失败不影响查词。", control: { type: "toggle", key: "vocabularyEnabled" } },
          { name: "查询后自动收藏", desc: "关闭后，在查词结果中手动收藏。", visible: vocabularyFieldsVisible, control: { type: "toggle", key: "vocabularyAutoSave" } },
          { name: "单词本 API 地址", desc: "完整 URL", visible: vocabularyFieldsVisible, control: { type: "text", key: "vocabularyUrl" } },
          { name: "请求方法", visible: vocabularyFieldsVisible, control: { type: "dropdown", key: "vocabularyMethod", options: { POST: "POST", GET: "GET" } } },
          { name: "请求参数（JSON）", desc: "支持 headword、phoneticUs、phoneticUk、definitionZh、definitionEn", visible: vocabularyFieldsVisible, control: { type: "textarea", key: "vocabularyRequestTemplate", rows: 4 } },
          { name: "认证方式", visible: vocabularyFieldsVisible, control: { type: "dropdown", key: "vocabularyAuthType", options: { none: "无", bearer: "Bearer Token", basic: "Basic" } } },
          { name: "认证凭据", desc: "有认证时填写；无认证时留空", visible: vocabularyFieldsVisible, render: (setting) => addPasswordText(setting, this.plugin.settings.vocabularyAuthCredential, async (value) => { this.plugin.settings.vocabularyAuthCredential = value; await this.plugin.saveSettings(); }) },
          { name: "自定义请求头（JSON）", desc: "可填写自定义认证或特殊请求头", visible: vocabularyFieldsVisible, control: { type: "textarea", key: "vocabularyCustomHeaders", rows: 4 } }
        ]
      }
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof AITranslateSettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (!isSettingsKey(key)) return;
    const currentValue = this.plugin.settings[key];
    if (typeof value !== typeof currentValue) return;
    this.plugin.settings[key] = value as never;
    await this.plugin.saveSettings();
    if (key === "vocabularyEnabled") this.update();
  }

}

function addPasswordText(setting: Setting, value: string, onChange: (value: string) => Promise<void>) {
  setting.addText((text) => {
    text.setValue(value).setPlaceholder(value ? "Stored locally" : "Optional").onChange(onChange);
    text.inputEl.type = "password";
  });
}

function addPronunciation(parent: HTMLElement, label: string, phonetic: string, audioUrl: string) {
  if (!phonetic && !audioUrl) return;
  const item = parent.createDiv({ cls: "ai-translate-pronunciation-item" });
  item.createSpan({ text: label, cls: "ai-translate-pronunciation-label" });
  if (phonetic) item.createSpan({ text: `/${phonetic}/`, cls: "ai-translate-phonetic" });
  if (audioUrl) {
    const play = item.createEl("button", { cls: "clickable-icon ai-translate-audio-button" });
    play.setAttr("aria-label", `播放${label}式发音`);
    play.setAttr("title", `播放${label}式发音`);
    setIcon(play, "volume-2");
    play.addEventListener("click", () => { void new Audio(audioUrl).play().catch(() => new Notice("发音播放失败")); });
  }
}
function appendList(parent: HTMLElement, title: string, values: string[], language: "zh" | "en") {
  if (!values.length) return;
  const section = parent.createDiv({ cls: `ai-translate-section ai-translate-section-${language}` });
  section.createDiv({ text: title, cls: "ai-translate-section-title" });
  const list = section.createEl("ul", { cls: "ai-translate-definition-list" });
  values.slice(0, 8).forEach((value) => list.createEl("li", { text: value }));
}
function extractTranslation(text: string): string {
  try {
    const response: unknown = JSON.parse(text);
    if (!isRecord(response)) return "";
    const choices = response.choices;
    const firstChoice = Array.isArray(choices) && isRecord(choices[0]) ? choices[0] : undefined;
    const message = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : undefined;
    const content = message?.content ?? response.output_text;
    return typeof content === "string" ? content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim() : "";
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function migrateSettings(raw: unknown): AITranslateSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };
  const stored = raw as Partial<AITranslateSettings & { apiKey?: unknown }>;
  const { apiKey: _deprecatedApiKey, ...settings } = stored;
  return { ...DEFAULT_SETTINGS, ...settings };
}

function isSettingsKey(key: string): key is keyof AITranslateSettings {
  return key in DEFAULT_SETTINGS;
}

async function requestYoudaoTranslation(text: string): Promise<string> {
  const result = await requestUrl({ url: "https://mobile.youdao.com/translate", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept-Language": "zh-CN,zh;q=0.9" }, body: new URLSearchParams({ inputtext: text, type: "AUTO" }).toString(), throw: false });
  if (result.status !== 200) return "";
  const doc = new DOMParser().parseFromString(result.text, "text/html");
  return Array.from(doc.querySelectorAll("#translateResult li")).map((item) => item.textContent?.trim() || "").filter(Boolean).join("\n");
}

async function requestYoudaoWordInfo(word: string): Promise<WordInfo | null> {
  const [dictionary, english] = await Promise.all([requestUrl({ url: `https://mobile.youdao.com/dict?le=eng&q=${encodeURIComponent(word)}`, throw: false }), requestUrl({ url: `https://mobile.youdao.com/singledict?q=${encodeURIComponent(word)}&dict=ee&le=eng&more=false`, throw: false })]);
  if (dictionary.status !== 200) return null;
  const section = new DOMParser().parseFromString(dictionary.text, "text/html").querySelector("#ec");
  if (!section) return null;
  const getPhonetic = (label: string) => Array.from(section.querySelectorAll("span")).find((element) => element.textContent?.includes(label))?.parentElement?.querySelector(".phonetic")?.textContent?.replaceAll("[", "").replaceAll("]", "").trim() || "";
  const getAudio = (type: string) => Array.from(section.querySelectorAll("[data-rel]")).map((element) => element.getAttribute("data-rel") || "").find((url) => url.includes(`type=${type}`)) || "";
  const definitionsZh = Array.from(section.querySelectorAll("ul li")).map((item) => item.textContent?.replace(/\s+/g, " ").trim() || "").filter(Boolean);
  const definitionsEn = english.status === 200 ? Array.from(new DOMParser().parseFromString(english.text, "text/html").querySelectorAll("li.per-tran")).map((item) => item.textContent?.replace(/^\s*(\d+|[a-z]+)\.\s*/i, "").trim() || "").filter(Boolean) : [];
  return { word, phoneticUS: getPhonetic("美"), phoneticUK: getPhonetic("英"), definitionsZh: [...new Set(definitionsZh)], definitionsEn: [...new Set(definitionsEn)], speechUrls: { uk: normalizeAudio(getAudio("1")), us: normalizeAudio(getAudio("2")) } };
}
function normalizeAudio(url: string) { try { const parsed = new URL(url.startsWith("//") ? `https:${url}` : url); return parsed.protocol === "https:" && parsed.hostname === "dict.youdao.com" ? parsed.href : ""; } catch { return ""; } }
function isMostlyChinese(text: string) { const normalized = text.replace(/\s+/g, ""); const chinese = (normalized.match(/[\u3400-\u9fff]/g) || []).length; const latin = (normalized.match(/[A-Za-z]/g) || []).length; return chinese > 0 && chinese / Math.max(1, chinese + latin) >= 0.3; }
function joinUrl(base: string, path: string) { return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`; }
function toErrorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
