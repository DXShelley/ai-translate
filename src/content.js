(() => {
  const ROOT_ID = "lit-translator-root";
  const BLOCK_SELECTOR = "p, li, article, section, blockquote, dd, dt, td, th, div";
  const DEFAULT_SETTINGS = {
    displayMode: "bilingual",
    hoverTranslate: true,
    hoverModifier: "ctrl",
    inputTranslate: true,
    inputTriggerSpaces: 3,
    bilingualLayout: "vertical"
  };
  const state = {
    lastPointer: { x: 0, y: 0 },
    sourceText: "",
    sourceNode: null,
    mode: "selection",
    busy: false,
    settings: { ...DEFAULT_SETTINGS },
    lastHoverText: "",
    inputSpaceCount: 0,
    closeToken: 0,
    pointerInsidePopover: false,
    cache: Object.create(null),
    wordCache: Object.create(null),
    session: null,
    recentResults: [],
    runtimeAvailable: true
  };

  let root;
  let popover;
  let toolbar;
  let panel;
  let dragState = null;

  document.addEventListener("pointerup", handlePointerUp, true);
  document.addEventListener("pointerover", debounce(handlePointerOver, 260), true);
  document.addEventListener("keydown", handleInputKeydown, true);
  document.addEventListener("selectionchange", debounce(handleSelectionChange, 120), true);
  loadSettings();
  loadRecentResults();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "LIT_TRANSLATE_SELECTION") return;
    translateFromMessage(message);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.settings) return;
    state.settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
  });

  function handlePointerUp(event) {
    if (isInsideTranslator(event.target)) return;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    setTimeout(() => showToolbarForSelection(), 30);
  }

  function handleSelectionChange() {
    const selection = window.getSelection();
    if (
      (!selection || selection.isCollapsed || !selection.toString().trim()) &&
      !state.pointerInsidePopover &&
      !dragState
    ) {
      hidePopover();
    }
  }

  function showToolbarForSelection() {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    if (!selectedText || isInsideTranslator(selection.anchorNode)) return;

    state.sourceText = selectedText;
    state.sourceNode = selection.anchorNode;
    if (!state.session || state.session.texts.selection !== normalizeText(selectedText)) {
      state.session = buildTranslationSession(selection.anchorNode, selectedText, "selection");
      state.cache = state.session.cache;
    }
    ensureUi();

    const rect = getSelectionRect(selection);
    placePopoverAroundRect(rect || pointerRect(state.lastPointer.x, state.lastPointer.y));
    popover.hidden = false;
    toolbar.hidden = false;

    requestTranslation("selection", selectedText);
  }

  async function translateFromMessage(message) {
    ensureUi();
    const text = message.text || window.getSelection()?.toString().trim();
    if (!text) {
      showPanel("selection", "", "", "没有选中文本");
      return;
    }

    state.sourceText = text;
    state.mode = message.mode || "selection";
    state.session = buildTranslationSession(window.getSelection()?.anchorNode || state.sourceNode, text, state.mode);
    state.cache = state.session.cache;
    placePanelNearViewportCenter();
    await requestTranslation(state.mode, text);
  }

  function ensureUi() {
    if (root) return;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-lit-root", "true");
    root.innerHTML = `
      <div class="lit-popover" hidden>
        <div class="lit-toolbar">
          <button data-mode="selection" title="翻译选中文字">划词</button>
          <button data-mode="sentence" title="翻译当前句子">句子</button>
          <button data-mode="paragraph" title="翻译当前段落">段落</button>
          <button class="lit-close" title="关闭">×</button>
        </div>
        <section class="lit-panel" hidden>
          <div class="lit-bilingual">
            <div class="lit-source"></div>
            <div class="lit-result"></div>
          </div>
          <div class="lit-word-info" hidden></div>
        </section>
      </div>
    `;
    document.documentElement.appendChild(root);

    popover = root.querySelector(".lit-popover");
    toolbar = popover.querySelector(".lit-toolbar");
    panel = popover.querySelector(".lit-panel");

    popover.addEventListener("pointerenter", () => {
      state.pointerInsidePopover = true;
    });

    popover.addEventListener("pointerleave", () => {
      state.pointerInsidePopover = false;
      if (!dragState) hidePopover();
    });

    toolbar.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-mode]");
      if (!button) return;
      const mode = button.dataset.mode;
      const text = resolveTextForMode(mode);
      if (!text) {
        showPanel(mode, "", "", "没有找到可翻译的文本");
        return;
      }
      requestTranslation(mode, text);
    });

    toolbar.querySelector(".lit-close").addEventListener("click", () => {
      hidePopover();
    });

    root.addEventListener("pointerover", (event) => {
      const token = event.target.closest?.(".lit-token");
      if (!token || !isInsideTranslator(token)) return;
      highlightAlignedToken(token.dataset.alignIndex);
    }, true);

    root.addEventListener("pointerout", (event) => {
      if (event.target.closest?.(".lit-token")) clearAlignedTokenHighlight();
    }, true);

    popover.addEventListener("pointerdown", startPanelDrag);
  }

  async function requestTranslation(mode, text) {
    if (!isRuntimeAvailable()) {
      showPanel(mode, text, "", "扩展已重新加载，请刷新当前网页后再试");
      return;
    }

    const cacheKey = translationCacheKey(mode, text);
    const cached = state.cache[cacheKey];
    if (cached?.status === "done") {
      setActiveMode(mode);
      showPanel(mode, text, cached.result);
      if (mode === "selection" && isSingleWord(text)) requestWordInfo(text);
      return;
    }
    const reusable = findReusableTranslation(mode, text);
    if (reusable) {
      state.cache[cacheKey] = {
        status: "done",
        mode,
        source: text,
        result: reusable.result
      };
      setActiveMode(mode);
      showPanel(mode, text, reusable.result);
      if (mode === "selection" && isSingleWord(text)) requestWordInfo(text);
      return;
    }
    if (cached?.status === "loading") {
      setActiveMode(mode);
      showPanel(mode, text, "翻译中...");
      return;
    }
    const closeToken = state.closeToken;
    state.cache[cacheKey] = { status: "loading", mode, source: text };
    setActiveMode(mode);
    showPanel(mode, text, "翻译中...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "LIT_TRANSLATE",
        payload: {
          mode,
          text,
          context: buildRequestContext(mode, text)
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "翻译失败");
      }

      state.cache[cacheKey] = {
        status: "done",
        mode,
        source: text,
        result: response.result.translation
      };
      if (!popover.hidden && closeToken === state.closeToken && isActiveTranslation(mode, text)) {
        showPanel(mode, text, response.result.translation);
        saveRecentResult(mode, text, response.result.translation);
        if (mode === "selection" && isSingleWord(text)) {
          requestWordInfo(text);
        }
      }
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleRuntimeInvalidated();
        return;
      }
      state.cache[cacheKey] = { status: "error", mode, source: text, error: error?.message || String(error) };
      if (!popover.hidden && closeToken === state.closeToken && isActiveTranslation(mode, text)) {
        showPanel(mode, text, "", error?.message || String(error));
      }
    }
  }

  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "LIT_GET_CONFIG" });
      state.settings = { ...DEFAULT_SETTINGS, ...(response?.config?.settings || {}) };
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleRuntimeInvalidated();
        return;
      }
      state.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async function handlePointerOver(event) {
    if (!state.settings.hoverTranslate || !matchesHoverModifier(event)) return;
    if (isEditable(event.target) || isInsideTranslator(event.target)) return;

    const element = event.target?.closest?.(BLOCK_SELECTOR);
    const text = findParagraphText(element);
    if (!text || text.length < 12 || text === state.lastHoverText) return;

    state.lastHoverText = text;
    state.sourceNode = element;
    state.session = buildTranslationSession(element, "", "paragraph");
    state.cache = state.session.cache;
    ensureUi();
    placePanelNearPointer(event);
    await requestTranslation("paragraph", text);
  }

  async function handleInputKeydown(event) {
    if (!state.settings.inputTranslate || event.key !== " ") {
      if (event.key !== " ") state.inputSpaceCount = 0;
      return;
    }

    const target = event.target;
    if (!isEditable(target)) return;

    state.inputSpaceCount += 1;
    if (state.inputSpaceCount < Number(state.settings.inputTriggerSpaces || 3)) return;
    state.inputSpaceCount = 0;
    event.preventDefault();

    const text = getEditableText(target).trim();
    if (!text) return;

    ensureUi();
    placePanelNearViewportCenter();
    showPanel("input", text, "翻译中...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "LIT_TRANSLATE",
        payload: { mode: "input", text }
      });
      if (!response?.ok) throw new Error(response?.error || "翻译失败");

      setEditableText(target, response.result.translation);
      showPanel("input", text, response.result.translation);
      saveRecentResult("input", text, response.result.translation);
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleRuntimeInvalidated();
        return;
      }
      showPanel("input", text, "", error?.message || String(error));
    }
  }

  function resolveTextForMode(mode) {
    if (state.session?.texts?.[mode]) {
      return state.session.texts[mode];
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    const anchorNode = selection?.anchorNode || state.sourceNode;

    if (mode === "selection") return selectedText || state.sourceText;
    if (mode === "paragraph") return findParagraphText(anchorNode) || selectedText || state.sourceText;
    if (mode === "sentence") {
      const paragraph = findParagraphText(anchorNode) || selectedText || state.sourceText;
      return findSentence(paragraph, selectedText) || selectedText || paragraph;
    }
    return selectedText || state.sourceText;
  }

  function findParagraphText(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const block = element?.closest?.(BLOCK_SELECTOR);
    const text = normalizeText(block?.innerText || block?.textContent || "");
    if (text && text.length <= 5000) return text;
    return "";
  }

  function findSentence(paragraph, selectedText) {
    const clean = normalizeText(paragraph);
    if (!clean) return "";

    const sentences = clean.match(/[^.!?。！？；;]+[.!?。！？；;]?/g) || [clean];
    if (!selectedText) return sentences[0]?.trim() || clean;

    const selected = normalizeText(selectedText);
    return sentences.find((sentence) => sentence.includes(selected))?.trim() || selected;
  }

  function buildTranslationSession(anchorNode, selectedText, triggerMode = "selection") {
    const selectionText = normalizeText(selectedText);
    const paragraph = findParagraphText(anchorNode) || selectionText;
    const sentence = findSentence(paragraph, selectionText) || selectionText || paragraph;

    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      scope: normalizeText(paragraph || sentence || selectionText),
      cache: Object.create(null),
      texts: {
        selection: triggerMode === "paragraph" ? "" : selectionText,
        sentence,
        paragraph
      }
    };
  }

  function buildRequestContext(mode, text) {
    const session = state.session;
    if (!session) return {};

    return {
      scope: session.scope,
      selection: session.texts.selection,
      sentence: session.texts.sentence,
      paragraph: session.texts.paragraph,
      current: { mode, text },
      previousTranslations: Object.entries(session.cache)
        .filter(([, entry]) => entry?.status === "done")
        .map(([key, entry]) => ({
          key,
          mode: entry.mode,
          source: entry.source,
          translation: entry.result
        }))
    };
  }

  function isActiveTranslation(mode, text) {
    const activeMode = toolbar?.querySelector("button.lit-active")?.dataset.mode;
    const activeText = state.session?.texts?.[mode] || resolveTextForMode(mode);
    return activeMode === mode && normalizeText(activeText) === normalizeText(text);
  }

  function findReusableTranslation(mode, text) {
    const normalized = normalizeText(text);
    return Object.values(state.session?.cache || {}).find((entry) =>
      entry?.status === "done" &&
      entry.result &&
      normalizeText(entry.source) === normalized &&
      entry.mode !== mode
    );
  }

  function showPanel(mode, source, result, error) {
    ensureUi();
    popover.hidden = false;
    toolbar.hidden = false;
    panel.hidden = false;
    panel.dataset.displayMode = state.settings.displayMode;
    panel.dataset.layout = state.settings.bilingualLayout || "vertical";
    renderAlignedText(panel.querySelector(".lit-source"), source, "source");
    const resultNode = panel.querySelector(".lit-result");
    renderAlignedText(resultNode, error || result, "result");
    resultNode.classList.toggle("lit-error", Boolean(error));
    const wordInfoNode = panel.querySelector(".lit-word-info");
    wordInfoNode.hidden = true;
    wordInfoNode.textContent = "";
    if (mode === "selection" && isSingleWord(source)) {
      renderWordInfo(source);
    }
    requestAnimationFrame(() => keepPopoverInViewport());
  }

  function placePopover(left, top) {
    const width = Math.min(420, window.innerWidth - 24);
    popover.style.width = `${width}px`;
    popover.style.left = `${clamp(left, 12, Math.max(12, window.innerWidth - width - 12))}px`;
    popover.style.top = `${clamp(top, 12, Math.max(12, window.innerHeight - 120))}px`;
    requestAnimationFrame(() => keepPopoverInViewport());
  }

  function placePopoverAroundRect(anchorRect) {
    const width = Math.min(420, window.innerWidth - 24);
    const estimatedHeight = Math.min(360, window.innerHeight - 24);
    const gap = 8;
    const left = anchorRect.left + anchorRect.width / 2 - width / 2;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    const top = spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove
      ? anchorRect.bottom + gap
      : anchorRect.top - estimatedHeight - gap;

    placePopover(left, top);
  }

  function placePanelNearToolbar() {
    const rect = popover.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24);
    popover.style.width = `${width}px`;
    popover.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.left))}px`;
    popover.style.top = `${Math.max(12, Math.min(window.innerHeight - 180, rect.top))}px`;
  }

  function placePanelNearViewportCenter() {
    const width = Math.min(420, window.innerWidth - 24);
    popover.style.width = `${width}px`;
    popover.style.left = `${Math.max(12, (window.innerWidth - width) / 2)}px`;
    popover.style.top = "72px";
    popover.hidden = false;
    requestAnimationFrame(() => keepPopoverInViewport());
  }

  function placePanelNearPointer(event) {
    placePopoverAroundRect(pointerRect(event.clientX, event.clientY));
    popover.hidden = false;
  }

  function keepPopoverInViewport() {
    if (!popover || popover.hidden) return;
    updatePanelMaxHeight();
    const rect = popover.getBoundingClientRect();
    const left = clamp(rect.left, 12, Math.max(12, window.innerWidth - rect.width - 12));
    const top = clamp(rect.top, 12, Math.max(12, window.innerHeight - Math.min(rect.height, window.innerHeight - 24) - 12));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    updatePanelMaxHeight();
  }

  function updatePanelMaxHeight() {
    if (!popover || !panel) return;
    const popoverRect = popover.getBoundingClientRect();
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarHeight = toolbarRect?.height || 0;
    const available = Math.max(160, window.innerHeight - popoverRect.top - toolbarHeight - 12);
    panel.style.maxHeight = `${available}px`;
  }

  function startPanelDrag(event) {
    if (event.target.closest("button, .lit-source, .lit-result, .lit-word-info")) return;
    event.preventDefault();

    const rect = popover.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    popover.classList.add("lit-dragging");
    popover.setPointerCapture(event.pointerId);
    popover.addEventListener("pointermove", dragPanel);
    popover.addEventListener("pointerup", stopPanelDrag);
    popover.addEventListener("pointercancel", stopPanelDrag);
  }

  function dragPanel(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const rect = popover.getBoundingClientRect();
    const left = clamp(event.clientX - dragState.offsetX, 8, window.innerWidth - rect.width - 8);
    const top = clamp(event.clientY - dragState.offsetY, 8, window.innerHeight - Math.min(rect.height, window.innerHeight - 16) - 8);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function stopPanelDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    popover.classList.remove("lit-dragging");
    popover.releasePointerCapture(event.pointerId);
    popover.removeEventListener("pointermove", dragPanel);
    popover.removeEventListener("pointerup", stopPanelDrag);
    popover.removeEventListener("pointercancel", stopPanelDrag);
    dragState = null;
    state.pointerInsidePopover = isPointInsidePopover(event.clientX, event.clientY);
  }

  function getSelectionRect(selection) {
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0).cloneRange();
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width && rect.height);
    return rects[rects.length - 1] || range.getBoundingClientRect();
  }

  function pointerRect(x, y) {
    return {
      left: x,
      right: x,
      top: y,
      bottom: y,
      width: 0,
      height: 0
    };
  }

  function hideToolbar() {
    if (toolbar) toolbar.hidden = true;
  }

  function hidePopover() {
    if (!popover) return;
    state.closeToken += 1;
    popover.hidden = true;
    if (panel) panel.hidden = true;
    hideToolbar();
  }

  function setActiveMode(mode) {
    toolbar?.querySelectorAll("button[data-mode]").forEach((button) => {
      button.classList.toggle("lit-active", button.dataset.mode === mode);
    });
  }

  function isInsideTranslator(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element?.closest?.(`#${ROOT_ID}`));
  }

  function isPointInsidePopover(x, y) {
    if (!popover || popover.hidden) return false;
    const rect = popover.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  async function requestWordInfo(word) {
    const normalizedWord = normalizeWord(word);
    const cacheKey = `word:${normalizedWord}`;
    const cached = state.wordCache[cacheKey] || state.cache[cacheKey] || findRecentWordInfo(normalizedWord);
    if (cached?.status === "done" || cached?.status === "loading") {
      state.cache[cacheKey] = cached;
      state.wordCache[cacheKey] = cached;
      renderWordInfo(word);
      return;
    }

    state.cache[cacheKey] = { status: "loading" };
    state.wordCache[cacheKey] = state.cache[cacheKey];
    renderWordInfo(word);

    try {
      const response = await chrome.runtime.sendMessage({
      type: "LIT_WORD_INFO",
        payload: { word: normalizedWord }
      });
      if (!response?.ok) throw new Error(response?.error || "词典信息获取失败");

      state.cache[cacheKey] = { status: "done", result: response.result };
      state.wordCache[cacheKey] = state.cache[cacheKey];
      saveRecentWordInfo(normalizedWord, response.result);
      renderWordInfo(word);
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleRuntimeInvalidated();
        return;
      }
      state.cache[cacheKey] = { status: "error", error: error?.message || String(error) };
      state.wordCache[cacheKey] = state.cache[cacheKey];
      renderWordInfo(word);
    }
  }

  function renderWordInfo(word) {
    const node = panel?.querySelector(".lit-word-info");
    if (!node) return;

    const key = `word:${normalizeWord(word)}`;
    const entry = state.cache[key] || state.wordCache[key] || findRecentWordInfo(normalizeWord(word));
    if (!entry) {
      node.hidden = true;
      node.textContent = "";
      return;
    }

    node.hidden = false;
    if (entry.status === "loading") {
      node.textContent = "词典信息加载中...";
      requestAnimationFrame(() => keepPopoverInViewport());
      return;
    }
    if (entry.status === "error") {
      node.textContent = entry.error;
      node.classList.add("lit-error");
      requestAnimationFrame(() => keepPopoverInViewport());
      return;
    }

    node.classList.remove("lit-error");
    node.innerHTML = formatWordInfo(entry.result);
    requestAnimationFrame(() => keepPopoverInViewport());
  }

  function formatWordInfo(info) {
    if (info?.raw && typeof info.raw === "string") return escapeHtml(info.raw);

    const sections = [
      `<div class="lit-phonetics">
        <span>美 ${escapeHtml(info?.phoneticUS || "-")} <button data-speak-word="${escapeHtml(info?.word || "")}" data-lang="en-US" title="美式朗读">美音</button></span>
        <span>英 ${escapeHtml(info?.phoneticUK || "-")} <button data-speak-word="${escapeHtml(info?.word || "")}" data-lang="en-GB" title="英式朗读">英音</button></span>
      </div>`,
      formatDefinitions("中文释义", info?.definitionsZh),
      formatDefinitions("英文释义", info?.definitionsEn),
      formatExamples(info?.examples),
      formatWordList("同义词", info?.synonyms),
      formatWordList("反义词", info?.antonyms)
    ].filter(Boolean);
    return sections.join("");
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-speak-word]");
    if (!button || !isInsideTranslator(button)) return;
    speakWord(button.dataset.speakWord || state.sourceText, button.dataset.lang || "en-US");
  }, true);

  function formatWordList(label, items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return "";
    return `<div class="lit-word-row"><strong>${label}</strong><span>${list.map(escapeHtml).join("、")}</span></div>`;
  }

  function formatDefinitions(label, items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return "";
    return `<div class="lit-word-row"><strong>${label}</strong><ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
  }

  function formatExamples(items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return "";
    return `<div class="lit-word-row lit-examples"><strong>经典示例</strong><ul>${list.map((item) => `<li>${formatExample(item)}</li>`).join("")}</ul></div>`;
  }

  function formatExample(item) {
    if (typeof item === "string") return `<div class="lit-example-en">${escapeHtml(item)}</div>`;
    const en = item?.en || item?.sentence || "";
    const zh = item?.zh || item?.translation || "";
    return [
      en ? `<div class="lit-example-en">${escapeHtml(en)}</div>` : "",
      zh ? `<div class="lit-example-zh">${escapeHtml(zh)}</div>` : ""
    ].join("");
  }

  function speakWord(word, lang) {
    const text = normalizeText(word);
    if (!text || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang === lang) ||
      voices.find((voice) => voice.lang?.toLowerCase().startsWith(lang.toLowerCase().slice(0, 2))) ||
      null;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function loadRecentResults() {
    try {
      const saved = await chrome.storage.local.get("recentResults");
      state.recentResults = Array.isArray(saved.recentResults) ? saved.recentResults : [];
      for (const entry of state.recentResults) {
        if (entry.type === "word" && entry.wordInfo) {
          state.wordCache[`word:${normalizeWord(entry.word || entry.source)}`] = {
            status: "done",
            result: entry.wordInfo
          };
        }
      }
    } catch {
      state.recentResults = [];
    }
  }

  async function saveRecentResult(mode, source, result) {
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      mode,
      source,
      result,
      createdAt: Date.now()
    };
    state.recentResults = [
      item,
      ...state.recentResults.filter((entry) => !(entry.mode === mode && entry.source === source))
    ].slice(0, 100);
    try {
      await chrome.storage.local.set({ recentResults: state.recentResults });
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleRuntimeInvalidated();
      }
      // History is an enhancement; translation should not fail if local storage is unavailable.
    }
  }

  async function saveRecentWordInfo(word, info) {
    const normalizedInfo = formatWordInfoJson(word, info);
    const item = {
      id: `word-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: "word",
      mode: "word",
      source: word,
      result: normalizedInfo,
      word,
      wordInfo: normalizedInfo,
      createdAt: Date.now()
    };
    state.recentResults = [
      item,
      ...state.recentResults.filter((entry) => !(entry.type === "word" && entry.word === word))
    ].slice(0, 100);
    try {
      await chrome.storage.local.set({ recentResults: state.recentResults });
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleRuntimeInvalidated();
      }
    }
  }

  function findRecentWordInfo(word) {
    const entry = state.recentResults.find((item) => item.type === "word" && normalizeWord(item.word || item.source) === word);
    return entry?.wordInfo ? { status: "done", result: entry.wordInfo } : null;
  }

  function formatWordInfoJson(word, info) {
    return {
      word: info?.word || word,
      phoneticUS: info?.phoneticUS || "",
      phoneticUK: info?.phoneticUK || "",
      definitionsZh: Array.isArray(info?.definitionsZh) ? info.definitionsZh : [],
      definitionsEn: Array.isArray(info?.definitionsEn) ? info.definitionsEn : [],
      synonyms: Array.isArray(info?.synonyms) ? info.synonyms : [],
      antonyms: Array.isArray(info?.antonyms) ? info.antonyms : [],
      examples: Array.isArray(info?.examples) ? info.examples : [],
      raw: info?.raw || null
    };
  }

  function isRuntimeAvailable() {
    try {
      return state.runtimeAvailable && Boolean(chrome?.runtime?.id);
    } catch (error) {
      if (isExtensionContextInvalidated(error)) handleRuntimeInvalidated();
      return false;
    }
  }

  function isExtensionContextInvalidated(error) {
    return /Extension context invalidated/i.test(error?.message || String(error || ""));
  }

  function handleRuntimeInvalidated() {
    state.runtimeAvailable = false;
    state.busy = false;
    hidePopover();
  }

  function renderAlignedText(container, text, side) {
    container.innerHTML = "";
    const tokens = tokenizeForAlignment(text);
    if (tokens.length < 2) {
      container.textContent = text;
      return;
    }
    let alignIndex = 0;
    tokens.forEach((token) => {
      const span = document.createElement("span");
      const isToken = Boolean(token.trim());
      span.className = isToken ? "lit-token" : "lit-space";
      if (isToken) {
        span.dataset.alignIndex = String(alignIndex);
        alignIndex += 1;
      }
      span.dataset.alignSide = side;
      span.textContent = token;
      container.appendChild(span);
    });
  }

  function highlightAlignedToken(index) {
    panel?.querySelectorAll(".lit-token").forEach((token) => {
      token.classList.toggle("lit-token-active", token.dataset.alignIndex === index);
    });
  }

  function clearAlignedTokenHighlight() {
    panel?.querySelectorAll(".lit-token-active").forEach((token) => {
      token.classList.remove("lit-token-active");
    });
  }

  function tokenizeForAlignment(text) {
    return String(text || "").match(/[A-Za-z]+(?:'[A-Za-z]+)?|[\u4e00-\u9fff]|[0-9]+|\s+|[^\s]/g) || [];
  }

  function isSingleWord(text) {
    return /^[A-Za-z][A-Za-z'-]*$/.test(normalizeText(text));
  }

  function normalizeWord(word) {
    return normalizeText(word).toLowerCase();
  }

  function translationCacheKey(mode, text) {
    return `translation:${mode}:${normalizeText(text)}`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function matchesHoverModifier(event) {
    const modifier = state.settings.hoverModifier;
    if (modifier === "none") return true;
    if (modifier === "alt") return event.altKey;
    if (modifier === "shift") return event.shiftKey;
    return event.ctrlKey;
  }

  function isEditable(target) {
    const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    if (!element) return false;
    return Boolean(
      element.closest("textarea, input[type='text'], input[type='search'], input:not([type]), [contenteditable='true']")
    );
  }

  function getEditableText(target) {
    const element = target.closest?.("textarea, input, [contenteditable='true']") || target;
    if (element.matches?.("textarea, input")) return element.value || "";
    return element.innerText || element.textContent || "";
  }

  function setEditableText(target, text) {
    const element = target.closest?.("textarea, input, [contenteditable='true']") || target;
    if (element.matches?.("textarea, input")) {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    element.textContent = text;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
