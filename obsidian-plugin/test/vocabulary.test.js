const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
const vocabulary = require("../../shared/vocabulary.js");

test("shares Obsidian request construction with the other plugins", () => {
  const headers = { "Content-Type": "application/json", ...vocabulary.parseHeaders("{}") };
  vocabulary.applyAuth(headers, "basic", "user:password", (value) => Buffer.from(value).toString("base64"));
  vocabulary.addIdempotencyKey(headers, () => "obsidian-request");
  assert.equal(headers.Authorization, "Basic dXNlcjpwYXNzd29yZA==");
  assert.equal(headers["Idempotency-Key"], "ai-translate-obsidian-request");
  const payload = vocabulary.buildPayload("note", { phoneticUS: "noʊt", definitionsZh: ["笔记"] });
  assert.equal(payload.headword, "note");
  assert.equal(payload.phoneticUs, "/noʊt/");
  assert.equal(payload.definitionZh, "笔记");
  assert.equal(payload.word, "note");
});

test("merges concurrent Obsidian saves for the same normalized word", async () => {
  const coordinator = vocabulary.createSaveCoordinator();
  let calls = 0;
  const save = () => coordinator.run("NOTE", async () => { calls += 1; return "saved"; });
  assert.deepEqual(await Promise.all([save(), save()]), ["saved", "saved"]);
  assert.equal(calls, 1);
});

test("Obsidian plugin entry sends one idempotent request for concurrent saves", async () => {
  let calls = 0;
  let headers;
  let body;
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request !== "obsidian") return originalLoad.call(this, request, parent, isMain);
    return {
      Plugin: class {}, PluginSettingTab: class {}, Modal: class {}, Notice: class {}, Setting: class {}, setIcon: () => {},
      requestUrl: async (request) => {
        calls += 1; headers = request.headers; body = request.body;
        await new Promise((resolve) => setImmediate(resolve));
        return { status: 201, text: "{}" };
      },
    };
  };
  try {
    delete require.cache[require.resolve("../main.js")];
    const Plugin = require("../main.js").default;
    const plugin = new Plugin();
    plugin.settings = {
      vocabularyEnabled: true, vocabularyAutoSave: true, vocabularyUrl: "https://word-book.test/words", vocabularyMethod: "POST",
      vocabularyCustomHeaders: "{}", vocabularyAuthType: "bearer", vocabularyAuthCredential: "token",
      vocabularyRequestTemplate: '{"headword":"{{headword}}","phoneticUs":"{{phoneticUs}}","phoneticUk":"{{phoneticUk}}","definitionZh":"{{definitionZh}}","definitionEn":"{{definitionEn}}"}',
    };
    await Promise.all([
      plugin.saveVocabulary("note", { definitionsZh: ["笔记"], definitionsEn: [], phoneticUS: "", phoneticUK: "", speechUrls: { us: "", uk: "" } }),
      plugin.saveVocabulary("NOTE", { definitionsZh: ["笔记"], definitionsEn: [], phoneticUS: "", phoneticUK: "", speechUrls: { us: "", uk: "" } }),
    ]);
    assert.equal(calls, 1);
    assert.equal(headers.Authorization, "Bearer token");
    assert.match(headers["Idempotency-Key"], /^ai-translate-/);
    assert.deepEqual(JSON.parse(body), { headword: "note", definitionZh: "笔记" });
  } finally {
    Module._load = originalLoad;
  }
});
