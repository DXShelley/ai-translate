"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "vscode") return {};
  return originalLoad.call(this, request, parent, isMain);
};
const extension = require("../extension");
Module._load = originalLoad;

assert.equal(extension.isSingleWord("translation"), true);
assert.equal(extension.isSingleWord("two words"), false);
assert.equal(extension.isSingleWord("中文词语"), true);
assert.equal(extension.isSingleWord("中文 word"), false);
assert.equal(extension.normalizeWordForMatch(" Translation "), "translation");
assert.equal(extension.normalizeTriggerMode("keyboard"), "keyboard");
assert.equal(extension.normalizeTriggerMode("invalid"), "hover");
assert.equal(extension.isMostlyChinese("你好你好 world"), true);
assert.equal(extension.isMostlyChinese("hello world"), false);
assert.equal(extension.joinUrl("http://localhost:1234/v1/", "/chat/completions"), "http://localhost:1234/v1/chat/completions");
assert.equal(extension.stripThinking("<think>hidden</think>visible"), "visible");
assert.equal(
  extension.parseYoudaoMobileTranslation('<ul id="translateResult"><li>翻译 &amp; 释义</li><li><b>第二行</b></li></ul>'),
  "翻译 & 释义\n第二行"
);
const wordInfo = extension.parseYoudaoWordInfo(`
  <div id="ec"><h2><span>translation</span></h2>
  <span>英 <span class="phonetic">[trænzˈleɪʃ(ə)n]</span></span><a data-rel="https://dict.youdao.com/dictvoice?audio=translation&type=1"></a>
  <span>美 <span class="phonetic">[trænzˈleɪʃ(ə)n]</span></span><a data-rel="https://dict.youdao.com/dictvoice?audio=translation&type=2"></a>
  <ul><li>n. 翻译；译文</li></ul></div><div id="collins_contentWrp">`, "translation");
assert.deepEqual(wordInfo, {
  word: "translation",
  phoneticUS: "trænzˈleɪʃ(ə)n",
  phoneticUK: "trænzˈleɪʃ(ə)n",
  speechUrls: {
    us: "https://dict.youdao.com/dictvoice?audio=translation&type=2",
    uk: "https://dict.youdao.com/dictvoice?audio=translation&type=1"
  },
  definitionsZh: ["n. 翻译；译文"],
  definitionsEn: []
});
assert.deepEqual(extension.parseYoudaoEnglishDefinitions('<li class="per-tran">1. the act of translating</li>'), ["the act of translating"]);
assert.deepEqual(
  extension.mergeTrustedDomains(["https://example.com", "https://dict.youdao.com"], "https://dict.youdao.com"),
  ["https://example.com", "https://dict.youdao.com"]
);
assert.equal(
  extension.toPronunciationCommandLink("美式发音", "https://dict.youdao.com/dictvoice?audio=translation&type=2"),
  "[美式发音](command:aiTranslateHover.playPronunciation?%5B%22https%3A%2F%2Fdict.youdao.com%2Fdictvoice%3Faudio%3Dtranslation%26type%3D2%22%2C%22%E7%BE%8E%E5%BC%8F%E5%8F%91%E9%9F%B3%22%5D)"
);
assert.match(
  extension.createPronunciationPlayerHtml("https://dict.youdao.com/dictvoice?audio=translation&type=2", "美式发音"),
  /player\.src = message\.audioUrl/
);
assert.doesNotMatch(
  extension.createPronunciationPlayerHtml("https://dict.youdao.com/dictvoice?audio=translation&type=2", "</script><script>bad()</script>"),
  /<\/script><script>bad\(\)<\/script>/
);
assert.deepEqual(
  extension.mergeTrustedDomains(["https://example.com"], "https://dict.youdao.com"),
  ["https://example.com", "https://dict.youdao.com"]
);

async function verifyOpenAiCompatibleRequest() {
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const payload = JSON.parse(body);
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer test-key");
      assert.equal(payload.model, "test-model");
      assert.match(payload.messages[1].content, /hello/);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: "你好" } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const result = await extension.requestTranslation("hello", {
      baseUrl: `http://127.0.0.1:${port}/v1`,
      endpointPath: "/chat/completions",
      model: "test-model",
      apiKey: "test-key",
      targetLanguage: "简体中文",
      timeoutMs: 1000
    });
    assert.equal(result, "你好");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function verifyRequestTimeout() {
  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(
      extension.fetchWithTimeout(`http://127.0.0.1:${server.address().port}`, {}, 10),
      /Request timed out after 10ms/
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

Promise.all([verifyOpenAiCompatibleRequest(), verifyRequestTimeout()]).catch((error) => {
  process.nextTick(() => { throw error; });
});
