const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");

function loadPlugin(requestUrl = async () => ({ status: 200, text: "{}" }), obsidianOverrides = {}) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request !== "obsidian") return originalLoad.call(this, request, parent, isMain);
    return {
      Plugin: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {}, Setting: class {}, setIcon: () => {}, requestUrl,
      ...obsidianOverrides
    };
  };
  try {
    delete require.cache[require.resolve("../main.js")];
    return require("../main.js");
  } finally {
    Module._load = originalLoad;
  }
}

test("drops the deprecated fallback API key from saved settings", () => {
  const { migrateSettings } = loadPlugin();
  const settings = migrateSettings({ apiKey: "obsolete-secret", vocabularyAuthCredential: "vocabulary-secret" });

  assert.equal("apiKey" in settings, false);
  assert.equal(settings.vocabularyAuthCredential, "vocabulary-secret");
  assert.equal(settings.vocabularyMethod, "POST");
});

test("fallback translation never sends a removed API key", async () => {
  let request;
  const Plugin = loadPlugin(async (options) => {
    request = options;
    return { status: 200, text: '{"choices":[{"message":{"content":"translated"}}]}' };
  }).default;
  const plugin = new Plugin();
  plugin.settings = {
    builtinApiEnabled: false,
    baseUrl: "https://translation.test/v1",
    endpointPath: "/chat/completions",
    model: "test-model",
    targetLanguage: "English"
  };

  assert.equal(await plugin.translate("hello"), "translated");
  assert.deepEqual(request.headers, { "Content-Type": "application/json" });
  assert.equal("Authorization" in request.headers, false);
});

test("keeps root and plugin manifests compatible with Obsidian 1.12.2", () => {
  const pluginRoot = path.join(__dirname, "..");
  const manifests = [
    path.join(pluginRoot, "manifest.json"),
    path.join(pluginRoot, "..", "manifest.json"),
  ].map((manifestPath) => JSON.parse(fs.readFileSync(manifestPath, "utf8")));
  assert.ok(manifests.every((manifest) => manifest.minAppVersion === "1.12.2"));
  assert.equal(manifests[0].version, manifests[1].version);
});

test("uses one legacy-compatible settings implementation", () => {
  const pluginRoot = path.join(__dirname, "..");
  const source = fs.readFileSync(path.join(pluginRoot, "src", "main.ts"), "utf8");

  assert.match(source, /^\s*display\(\)/m);
  assert.doesNotMatch(source, /SettingDefinitionItem|getSettingDefinitions|getControlValue|setControlValue|this\.update\(/);
  assert.equal((source.match(/"认证凭据"/g) || []).length, 1);
  assert.match(source, /"认证凭据"[\s\S]*?"password"/);
  assert.doesNotMatch(source, /setPlaceholder\(value\)/);
});

test("renders and refreshes settings with the Obsidian 1.12 API surface", async () => {
  const rendered = [];
  let emptyCalls = 0;
  class PluginSettingTab {
    constructor(app, plugin) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = { empty: () => { emptyCalls += 1; } };
    }
  }
  class Setting {
    constructor() {
      this.entry = { controls: [] };
      rendered.push(this.entry);
    }
    setName(name) { this.entry.name = name; return this; }
    setDesc() { return this; }
    setHeading() { this.entry.heading = true; return this; }
    addToggle(callback) { return this.addControl("toggle", callback); }
    addDropdown(callback) { return this.addControl("dropdown", callback, { addOptions() { return this; } }); }
    addText(callback) { return this.addControl("text", callback, { inputEl: { type: "text" }, setPlaceholder() { return this; } }); }
    addTextArea(callback) { return this.addControl("textarea", callback); }
    addControl(type, callback, extra = {}) {
      const control = Object.assign({
        type,
        setValue() { return this; },
        onChange(handler) { this.change = handler; return this; }
      }, extra);
      this.entry.controls.push(control);
      callback(control);
      return this;
    }
  }
  const { AITranslateSettingTab } = loadPlugin(undefined, { PluginSettingTab, Setting });
  const plugin = {
    settings: {
      builtinApiEnabled: true, baseUrl: "", endpointPath: "", model: "", targetLanguage: "",
      vocabularyEnabled: false, vocabularyAutoSave: true, vocabularyUrl: "", vocabularyMethod: "POST",
      vocabularyRequestTemplate: "{}", vocabularyAuthType: "none", vocabularyAuthCredential: "secret",
      vocabularyCustomHeaders: "{}"
    },
    saveSettings: async () => {}
  };
  const tab = new AITranslateSettingTab({}, plugin);

  tab.display();
  const enableToggle = rendered.find((entry) => entry.name === "启用单词本适配").controls[0];
  await enableToggle.change(true);

  assert.equal(emptyCalls, 2);
  assert.equal(rendered.filter((entry) => entry.name === "认证凭据").length, 1);
  assert.equal(rendered.find((entry) => entry.name === "认证凭据").controls[0].inputEl.type, "password");
  assert.equal(rendered.flatMap((entry) => entry.controls).filter((control) => control.type === "textarea").length, 2);
});

test("does not return the pronunciation playback promise from its event handler", () => {
  const pluginRoot = path.join(__dirname, "..");
  const source = fs.readFileSync(path.join(pluginRoot, "src", "main.ts"), "utf8");

  assert.match(source, /void new Audio\(audioUrl\)\.play\(\)/);
});
