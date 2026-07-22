const assert = require("node:assert/strict");
const test = require("node:test");
const vocabulary = require("../shared/vocabulary.js");

test("builds a browser vocabulary request with an idempotency key", () => {
  const headers = { "Content-Type": "application/json", ...vocabulary.parseHeaders('{"X-Client":"browser"}') };
  vocabulary.applyAuth(headers, "bearer", "token", (value) => Buffer.from(value).toString("base64"));
  vocabulary.addIdempotencyKey(headers, () => "browser-request");
  assert.equal(headers.Authorization, "Bearer token");
  assert.equal(headers["Idempotency-Key"], "ai-translate-browser-request");
  assert.deepEqual(vocabulary.buildRequest('{"word":"{{word}}","definition":"{{definition}}"}', vocabulary.buildPayload("hello", { definitionsZh: ["你好"] })), { word: "hello", definition: "你好" });
});

test("preserves a caller supplied idempotency key", () => {
  const headers = { "idempotency-key": "caller-key" };
  vocabulary.addIdempotencyKey(headers, () => "generated-key");
  assert.equal(headers["idempotency-key"], "caller-key");
});

test("serializes nested GET template values consistently", () => {
  assert.deepEqual(vocabulary.toQueryEntries({ word: "hello", metadata: { source: "test" } }), [
    ["word", "hello"], ["metadata", '{"source":"test"}'],
  ]);
});

test("merges concurrent saves for the same word", async () => {
  const coordinator = vocabulary.createSaveCoordinator();
  let calls = 0;
  const save = () => coordinator.run("Translation", async () => {
    calls += 1;
    await new Promise((resolve) => setImmediate(resolve));
    return { status: 201 };
  });
  const [first, second] = await Promise.all([save(), save()]);
  assert.deepEqual(first, { status: 201 });
  assert.deepEqual(second, { status: 201 });
  assert.equal(calls, 1);
});
