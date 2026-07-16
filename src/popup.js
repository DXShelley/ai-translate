const form = document.querySelector("#wordSearchForm");
const input = document.querySelector("#wordSearchInput");
const resultNode = document.querySelector("#wordResult");
const searchButton = form.querySelector("button");
let activeAudio;

document.querySelector("#openOptions").addEventListener("click", () => {
  const browserApi = globalThis.litBrowser;
  if (!browserApi?.runtime?.openOptionsPage) {
    showStatus("当前页面没有扩展运行环境，请从浏览器扩展管理页加载项目。", true);
    return;
  }
  browserApi.runtime.openOptionsPage();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) {
    input.focus();
    return;
  }

  const browserApi = globalThis.litBrowser;
  if (!browserApi?.runtime?.sendMessage) {
    showStatus("当前页面没有扩展运行环境，请从浏览器扩展管理页加载项目。", true);
    return;
  }

  searchButton.disabled = true;
  showStatus("正在查询…");
  try {
    if (containsChinese(query)) {
      // Chinese input is translated through the configured translation route, never the English dictionary route.
      const response = await browserApi.runtime.sendMessage({
        type: "LIT_TRANSLATE",
        payload: { mode: "input", text: query }
      });
      if (!response?.ok) throw new Error(response?.error || "翻译失败");
      renderTranslation(query, response.result?.translation);
    } else if (isEnglishWord(query)) {
      // Keep the English dictionary response intact: it provides IPA and Youdao dictvoice URLs.
      const response = await browserApi.runtime.sendMessage({
        type: "LIT_WORD_INFO",
        payload: { word: query }
      });
      if (!response?.ok) throw new Error(response?.error || "词典信息获取失败");
      const vocabularySettings = await getVocabularySettings();
      renderWordInfo(response.result, query, vocabularySettings);
      if (response.result && isEnglishWord(query) && shouldAutoSaveVocabulary(vocabularySettings)) saveVocabulary(query, response.result, false);
    } else {
      showStatus("仅支持英文单词查询；中文输入会走翻译。", true);
    }
  } catch (error) {
    showStatus(error?.message || "查询失败，请检查模型配置后重试。", true);
  } finally {
    searchButton.disabled = false;
  }
});

function showStatus(message, isError = false) {
  resultNode.hidden = false;
  resultNode.replaceChildren();
  const status = document.createElement("p");
  status.className = `word-status${isError ? " error" : ""}`;
  status.textContent = message;
  resultNode.append(status);
}

function renderWordInfo(info = {}, fallbackWord, vocabularySettings = {}) {
  resultNode.hidden = false;
  resultNode.replaceChildren();

  const heading = document.createElement("header");
  heading.className = "word-result-heading";
  const word = document.createElement("h2");
  word.textContent = info.word || fallbackWord;
  heading.append(word);
  if (isEnglishWord(fallbackWord) && vocabularySettings.vocabularyEnabled === true && vocabularySettings.vocabularyAutoSave === false) {
    const saveButton = document.createElement("button");
    saveButton.className = "vocabulary-save-button";
    saveButton.type = "button";
    saveButton.textContent = "收藏";
    saveButton.addEventListener("click", () => saveVocabulary(fallbackWord, info, true, saveButton));
    heading.append(saveButton);
  }
  resultNode.append(heading);

  const pronunciations = document.createElement("div");
  pronunciations.className = "pronunciations";
  pronunciations.append(
    createPronunciation("美", info.phoneticUS, "en-US", info.word || fallbackWord, info.speechUrls?.us),
    createPronunciation("英", info.phoneticUK, "en-GB", info.word || fallbackWord, info.speechUrls?.uk)
  );
  resultNode.append(pronunciations);

  const definitions = Array.isArray(info.partsOfSpeech) && info.partsOfSpeech.length
    ? info.partsOfSpeech.map((item) => ({ pos: item?.pos, meaning: item?.meaning }))
    : (info.definitionsZh || []).map((meaning) => ({ meaning }));
  if (!definitions.length) {
    const empty = document.createElement("p");
    empty.className = "word-status error";
    empty.textContent = "未找到可展示的中文释义。";
    resultNode.append(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "definition-list";
  definitions.slice(0, 6).forEach(({ pos, meaning }) => {
    if (!meaning) return;
    const definition = document.createElement("div");
    definition.className = "definition";
    if (pos) {
      const partOfSpeech = document.createElement("b");
      partOfSpeech.textContent = pos;
      definition.append(partOfSpeech);
    }
    definition.append(document.createTextNode(meaning));
    list.append(definition);
  });
  resultNode.append(list);
}

async function getVocabularySettings() {
  try {
    const response = await globalThis.litBrowser.runtime.sendMessage({ type: "LIT_GET_CONFIG" });
    return response?.ok ? response.config?.settings || {} : {};
  } catch { return {}; }
}

function shouldAutoSaveVocabulary(settings) {
  return settings.vocabularyEnabled === true && settings.vocabularyAutoSave !== false;
}

async function saveVocabulary(word, wordInfo, manual, button) {
  if (!isEnglishWord(word)) return;
  if (button) { button.disabled = true; button.textContent = "收藏中"; }
  try {
    const response = await globalThis.litBrowser.runtime.sendMessage({ type: "LIT_SAVE_VOCABULARY", payload: { word, wordInfo } });
    if (!response?.ok) throw new Error(response?.error || "收藏失败");
    if (button) button.textContent = "已收藏";
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = "重试收藏"; }
    if (manual && button) button.title = error?.message || "收藏失败";
    console.warn("单词本收藏失败，不影响查词:", error);
  }
}

function renderTranslation(source, translation) {
  activeAudio?.pause();
  activeAudio = undefined;
  resultNode.hidden = false;
  resultNode.replaceChildren();

  const sourceNode = document.createElement("p");
  sourceNode.className = "translation-source";
  sourceNode.textContent = source;
  const translationNode = document.createElement("p");
  translationNode.className = "translation-result";
  translationNode.textContent = String(translation || "").trim() || "未返回译文。";
  resultNode.append(sourceNode, translationNode);
}

function containsChinese(text) {
  return /[\u3400-\u9fff]/.test(String(text || ""));
}

function isEnglishWord(text) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(String(text || "").trim());
}

function createPronunciation(label, phonetic, lang, word, audioUrl) {
  const item = document.createElement("div");
  item.className = "pronunciation";

  const labelNode = document.createElement("span");
  labelNode.className = "pronunciation-label";
  labelNode.textContent = `${label}音`;
  const phoneticNode = document.createElement("span");
  phoneticNode.className = "phonetic";
  phoneticNode.textContent = phonetic || "暂无音标";
  const button = document.createElement("button");
  button.className = "pronunciation-button";
  button.type = "button";
  button.title = `播放${label}音`;
  button.setAttribute("aria-label", `播放${word}的${label}音`);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4.5 4.2a4 4 0 0 1 0 5.6m2.6-8.2a7.5 7.5 0 0 1 0 11.2"/></svg>';
  button.addEventListener("click", () => playPronunciation({ word, lang, audioUrl, button }));

  item.append(labelNode, phoneticNode, button);
  return item;
}

async function playPronunciation({ word, lang, audioUrl, button }) {
  if (!word) return;
  button.disabled = true;
  try {
    if (audioUrl) {
      try {
        const response = await globalThis.litBrowser.runtime.sendMessage({
          type: "LIT_FETCH_SPEECH_AUDIO",
          payload: { url: audioUrl }
        });
        if (response?.ok && response.dataUrl) {
          activeAudio?.pause();
          activeAudio = new Audio(response.dataUrl);
          await activeAudio.play();
          return;
        }
      } catch (error) {
        console.warn("词典音频播放失败，回退到浏览器发音:", error);
      }
    }
    const response = await globalThis.litBrowser.runtime.sendMessage({
      type: "LIT_SPEAK_TEXT",
      payload: { text: word, lang }
    });
    if (!response?.ok) throw new Error(response?.error || "发音失败");
  } catch (error) {
    showStatus(error?.message || "发音失败，请稍后重试。", true);
  } finally {
    button.disabled = false;
  }
}
