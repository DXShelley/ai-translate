const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");

function loadPlugin(requestUrl = async () => ({ status: 200, text: "{}" })) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request !== "obsidian") return originalLoad.call(this, request, parent, isMain);
    return {
      Plugin: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {}, Setting: class {}, setIcon: () => {}, requestUrl
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
