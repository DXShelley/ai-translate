const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");

function loadSettingsMigration() {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request !== "obsidian") return originalLoad.call(this, request, parent, isMain);
    return {
      Plugin: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {}, Setting: class {}, setIcon: () => {}, requestUrl: async () => ({ status: 200, text: "{}" })
    };
  };
  try {
    delete require.cache[require.resolve("../main.js")];
    return require("../main.js").migrateSettings;
  } finally {
    Module._load = originalLoad;
  }
}

test("drops the deprecated fallback API key from saved settings", () => {
  const migrateSettings = loadSettingsMigration();
  const settings = migrateSettings({ apiKey: "obsolete-secret", vocabularyAuthCredential: "vocabulary-secret" });

  assert.equal("apiKey" in settings, false);
  assert.equal(settings.vocabularyAuthCredential, "vocabulary-secret");
  assert.equal(settings.vocabularyMethod, "POST");
});
