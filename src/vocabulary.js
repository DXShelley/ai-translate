(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AITranslateVocabulary = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  function formatPhonetic(value) {
    const phonetic = String(value || "").trim().replace(/^\/+|\/+$/g, "");
    return phonetic ? `/${phonetic}/` : "";
  }

  function buildPayload(word, info = {}) {
    const definitionZh = (Array.isArray(info.partsOfSpeech)
      ? info.partsOfSpeech.map((item) => [item?.pos, item?.meaning].filter(Boolean).join(" "))
      : []).filter(Boolean).join("；") || (Array.isArray(info.definitionsZh) ? info.definitionsZh : []).filter(Boolean).join("；");
    const definitionEn = (Array.isArray(info.definitionsEn) ? info.definitionsEn : []).filter(Boolean).join("; ");
    const payload = {
      headword: word,
      phoneticUs: formatPhonetic(info.phoneticUS),
      phoneticUk: formatPhonetic(info.phoneticUK),
      definitionZh,
      definitionEn,
    };
    return {
      ...payload,
      word: payload.headword,
      definition: payload.definitionZh,
      phoneticUS: payload.phoneticUs,
      phoneticUK: payload.phoneticUk,
    };
  }

  function buildRequest(template, variables) {
    let parsed;
    try { parsed = JSON.parse(template); } catch { throw new Error("Vocabulary request template must be a JSON object."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Vocabulary request template must be a JSON object.");
    return replaceVariables(parsed, variables);
  }

  function replaceVariables(value, variables) {
    if (Array.isArray(value)) return value.map((item) => replaceVariables(item, variables)).filter((item) => item !== undefined);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, replaceVariables(item, variables)])
      .filter(([, item]) => item !== undefined));
    if (typeof value !== "string") return value;
    const pureVariable = /^{{\s*(headword|phoneticUs|phoneticUk|definitionZh|definitionEn|word|definition|phoneticUS|phoneticUK)\s*}}$/.exec(value);
    if (pureVariable && !variables[pureVariable[1]]) return undefined;
    return value.replace(/{{\s*(headword|phoneticUs|phoneticUk|definitionZh|definitionEn|word|definition|phoneticUS|phoneticUK)\s*}}/g, (_, key) => variables[key] || "");
  }

  function parseHeaders(value) {
    let headers;
    try { headers = JSON.parse(value || "{}"); } catch { throw new Error("Vocabulary custom headers must be a JSON object."); }
    if (!headers || typeof headers !== "object" || Array.isArray(headers)) throw new Error("Vocabulary custom headers must be a JSON object.");
    return Object.fromEntries(Object.entries(headers).map(([key, item]) => [String(key), String(item)]));
  }

  function applyAuth(headers, authType, credential, encodeBase64) {
    const value = String(credential || "").trim();
    if (!value || authType === "none") return;
    headers.Authorization = authType === "basic" ? `Basic ${encodeBase64(value)}` : `Bearer ${value}`;
  }

  function hasHeader(headers, name) {
    return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
  }

  function addIdempotencyKey(headers, randomUUID) {
    if (!hasHeader(headers, "idempotency-key")) headers["Idempotency-Key"] = `ai-translate-${randomUUID()}`;
    return headers;
  }

  function toQueryEntries(payload) {
    return Object.entries(payload).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]);
  }

  function createSaveCoordinator() {
    const pending = new Map();
    return {
      run(key, save) {
        const normalizedKey = String(key).trim().toLowerCase();
        const current = pending.get(normalizedKey);
        if (current) return current;
        const request = Promise.resolve().then(save);
        pending.set(normalizedKey, request);
        return request.finally(() => {
          if (pending.get(normalizedKey) === request) pending.delete(normalizedKey);
        });
      },
    };
  }

  return { addIdempotencyKey, applyAuth, buildPayload, buildRequest, createSaveCoordinator, formatPhonetic, hasHeader, parseHeaders, toQueryEntries };
});
