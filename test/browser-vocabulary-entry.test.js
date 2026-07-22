const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("browser background entry sends one idempotent request for concurrent saves", async () => {
  let requests = 0;
  let requestHeaders;
  const settings = {
    vocabularyEnabled: true, vocabularyAutoSave: true, vocabularyMethod: "POST",
    vocabularyUrl: "https://word-book.test/words", vocabularyRequestTemplate: '{"headword":"{{headword}}"}',
    vocabularyAuthCredential: "token", vocabularyAuthType: "bearer", vocabularyCustomHeaders: "{}", requestLogging: false,
  };
  const listener = () => {};
  const chrome = {
    runtime: { onInstalled: { addListener: listener }, onMessage: { addListener: listener } },
    storage: {
      sync: { get: (_keys, callback) => callback({ settings }) },
      local: { get: (_keys, callback) => callback({}), set: (_value, callback) => callback?.() },
    },
    contextMenus: { create: () => {}, onClicked: { addListener: listener } },
    commands: { onCommand: { addListener: listener } },
    tabs: { sendMessage: () => Promise.resolve() },
  };
  const sandbox = {
    AbortController, URLSearchParams, chrome, console, crypto, setTimeout, clearTimeout,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    fetch: async (_url, init) => {
      requests += 1; requestHeaders = init.headers;
      await new Promise((resolve) => setImmediate(resolve));
      return { ok: true, status: 201, statusText: "Created", text: async () => "{}" };
    },
    __AI_TRANSLATE_TEST__: {},
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "packages", "chrome", "background.js"), "utf8"), sandbox);
  const save = sandbox.__AI_TRANSLATE_TEST__.saveVocabulary;
  await Promise.all([
    save({ word: "hello", wordInfo: { definitionsZh: ["你好"] } }),
    save({ word: "HELLO", wordInfo: { definitionsZh: ["你好"] } }),
  ]);
  assert.equal(requests, 1);
  assert.equal(requestHeaders.Authorization, "Bearer token");
  assert.match(requestHeaders["Idempotency-Key"], /^ai-translate-/);
});
