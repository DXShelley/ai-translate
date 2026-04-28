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
    translationCacheSalt: "",
    lastHoverText: "",
    inputSpaceCount: 0,
    closeToken: 0,
    pointerInsidePopover: false,
    suppressPopoverAutoCloseUntil: 0,
    cache: Object.create(null),
    wordCache: Object.create(null),
    pendingTranslations: Object.create(null),
    session: null,
    activeTranslationKey: "",
    activeWordKey: "",
    wordHistoryIndex: -1,
    recentResults: [],
    runtimeAvailable: true
  };

  let root;
  let popover;
  let toolbar;
  let panel;
  let dragState = null;
  let suppressNextPopoverClick = false;

  document.addEventListener("pointerup", handlePointerUp, true);
  document.addEventListener("pointerover", debounce(handlePointerOver, 260), true);
  document.addEventListener("keydown", handleInputKeydown, true);
  document.addEventListener("selectionchange", debounce(handleSelectionChange, 120), true);
  loadSettings();
  loadRecentResults();

  const browserApi = globalThis.litBrowser;

  browserApi.runtime.onMessage.addListener((message) => {
    if (message?.type !== "LIT_TRANSLATE_SELECTION") return;
    translateFromMessage(message);
  });

  browserApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    if (changes.settings || changes.profiles || changes.activeProfileId) {
      loadSettings();
    }
  });

  function handlePointerUp(event) {
    if (isInsideTranslator(event.target)) return;
    state.lastPointer = { x: event.clientX, y: event.clientY };
    setTimeout(() => showToolbarForSelection(), 30);
  }

  function handleSelectionChange() {
    const selection = window.getSelection();
    if (isSelectionInsidePopover(selection)) return;
    if (isPopoverAutoCloseSuppressed()) return;
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
    const initialMode = detectSelectionMode(selection, selectedText);
    if (!state.session || state.session.texts.selection !== normalizeText(selectedText)) {
      state.session = buildTranslationSession(selection.anchorNode, selectedText, initialMode);
      state.cache = state.session.cache;
    }
    ensureUi();

    const rect = getSelectionRect(selection);
    placePopoverAroundRect(rect || pointerRect(state.lastPointer.x, state.lastPointer.y));
    popover.hidden = false;
    toolbar.hidden = false;

    requestTranslation(initialMode, resolveTextForMode(initialMode));
  }

  async function translateFromMessage(message) {
    ensureUi();
    const selection = window.getSelection();
    const text = message.text || window.getSelection()?.toString().trim();
    if (!text) {
      showPanel("selection", "", "", "没有选中文本");
      return;
    }

    state.sourceText = text;
    state.sourceNode = selection?.anchorNode || state.sourceNode;
    state.mode = resolveRequestedMode(message.mode, selection, text);
    state.session = buildTranslationSession(state.sourceNode, text, state.mode);
    state.cache = state.session.cache;
    placePanelNearViewportCenter();
    await requestTranslation(state.mode, resolveTextForMode(state.mode));
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
          <div class="lit-word-search" role="search">
            <input class="lit-word-search-input" type="search" placeholder="查单词" autocomplete="off" spellcheck="false">
            <button class="lit-word-history" data-word-history="prev" type="button" title="上一个单词">‹</button>
            <button class="lit-word-history" data-word-history="next" type="button" title="下一个单词">›</button>
          </div>
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
      if (!dragState && !isPopoverAutoCloseSuppressed()) hidePopover();
    });

    toolbar.addEventListener("click", (event) => {
      const historyButton = event.target.closest("button[data-word-history]");
      if (historyButton) {
        showWordHistory(historyButton.dataset.wordHistory);
        return;
      }

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

    toolbar.querySelector(".lit-word-search-input").addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      queryWordFromToolbar(event.target.value);
    });

    popover.addEventListener("pointerdown", startPanelDrag);
    popover.addEventListener("pointerup", handlePopoverWordLookup);
    popover.addEventListener("copy", handlePopoverWordCopy, true);
    popover.addEventListener("click", suppressPanelClickAfterDrag, true);
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
      state.activeTranslationKey = cacheKey;
      showPanel(mode, text, cached.result);
      if (mode === "selection" && isEnglishWord(text)) requestWordInfo(text);
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
      state.activeTranslationKey = cacheKey;
      showPanel(mode, text, reusable.result);
      if (mode === "selection" && isEnglishWord(text)) requestWordInfo(text);
      return;
    }
    if (cached?.status === "loading") {
      setActiveMode(mode);
      state.activeTranslationKey = cacheKey;
      showPanel(mode, text, "翻译中...");
      await waitForPendingTranslation(cacheKey, mode, text);
      return;
    }
    const closeToken = state.closeToken;
    state.cache[cacheKey] = { status: "loading", mode, source: text };
    setActiveMode(mode);
    state.activeTranslationKey = cacheKey;
    showPanel(mode, text, "翻译中...");

    try {
      const response = await fetchTranslation(cacheKey, mode, text);
      const result = normalizeTranslationResult(response.result, text);

      state.cache[cacheKey] = {
        status: "done",
        mode,
        source: text,
        result
      };
      if (!popover.hidden && closeToken === state.closeToken && isActiveTranslation(cacheKey)) {
        showPanel(mode, text, result);
        saveRecentResult(mode, text, result);
        if (mode === "selection" && isEnglishWord(text)) {
          requestWordInfo(text);
        }
      }
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleRuntimeInvalidated();
        return;
      }
      state.cache[cacheKey] = { status: "error", mode, source: text, error: error?.message || String(error) };
      if (!popover.hidden && closeToken === state.closeToken && isActiveTranslation(cacheKey)) {
        showPanel(mode, text, "", error?.message || String(error));
      }
    }
  }

  async function fetchTranslation(cacheKey, mode, text) {
    if (!state.pendingTranslations[cacheKey]) {
      state.pendingTranslations[cacheKey] = browserApi.runtime.sendMessage({
        type: "LIT_TRANSLATE",
        payload: {
          mode,
          text,
          context: buildRequestContext(mode, text)
        }
      }).finally(() => {
        delete state.pendingTranslations[cacheKey];
      });
    }

    const response = await state.pendingTranslations[cacheKey];
    if (!response?.ok) {
      throw new Error(response?.error || "翻译失败");
    }
    return response;
  }

  async function waitForPendingTranslation(cacheKey, mode, text) {
    try {
      const response = await fetchTranslation(cacheKey, mode, text);
      const result = normalizeTranslationResult(response.result, text);
      state.cache[cacheKey] = { status: "done", mode, source: text, result };
      if (!popover.hidden && isActiveTranslation(cacheKey)) {
        showPanel(mode, text, result);
        saveRecentResult(mode, text, result);
      }
    } catch (error) {
      state.cache[cacheKey] = { status: "error", mode, source: text, error: error?.message || String(error) };
      if (!popover.hidden && isActiveTranslation(cacheKey)) {
        showPanel(mode, text, "", error?.message || String(error));
      }
    }
  }

  async function loadSettings() {
    try {
      const response = await browserApi.runtime.sendMessage({ type: "LIT_GET_CONFIG" });
      state.settings = { ...DEFAULT_SETTINGS, ...(response?.config?.settings || {}) };
      const nextSalt = buildTranslationCacheSalt(response?.config?.activeProfile);
      if (state.translationCacheSalt && state.translationCacheSalt !== nextSalt && state.session) {
        state.session.cache = Object.create(null);
        state.cache = state.session.cache;
      }
      state.translationCacheSalt = nextSalt;
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleRuntimeInvalidated();
        return;
      }
      state.settings = { ...DEFAULT_SETTINGS };
      state.translationCacheSalt = "";
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
      const response = await browserApi.runtime.sendMessage({
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
    const selectedFolded = foldText(selected);
    return sentences.find((sentence) => foldText(sentence).includes(selectedFolded))?.trim() || selected;
  }

  function detectSelectionMode(selection, selectedText) {
    const text = normalizeText(selectedText);
    if (isWordSelection(text)) return "selection";
    if (isParagraphSelection(selection, text)) return "paragraph";
    return "sentence";
  }

  function resolveRequestedMode(mode, selection, selectedText) {
    if (mode === "selection" || mode === "sentence" || mode === "paragraph") return mode;
    return detectSelectionMode(selection, selectedText);
  }

  function isParagraphSelection(selection, selectedText) {
    if (!selectedText) return false;
    if (/[\r\n]/.test(selection?.toString?.() || "")) return true;
    const sentenceCount = (selectedText.match(/[.!?。！？；;]/g) || []).length;
    if (sentenceCount >= 2) return true;
    const paragraph = findParagraphText(selection?.anchorNode || state.sourceNode);
    return paragraph && normalizeCacheText(paragraph) === normalizeCacheText(selectedText);
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
          translation: getTranslationText(entry.result)
        }))
    };
  }

  function isActiveTranslation(cacheKey) {
    return state.activeTranslationKey === cacheKey;
  }

  function findReusableTranslation(mode, text) {
    const normalized = normalizeCacheText(text);
    for (const entry of Object.values(state.session?.cache || {})) {
      if (entry?.status !== "done" || !entry.result || entry.mode === mode) continue;
      if (normalizeCacheText(entry.source) === normalized) return entry;
      const extracted = extractReusableTranslation(entry, text);
      if (extracted) {
        return {
          status: "done",
          mode,
          source: text,
          result: extracted
        };
      }
    }
    return null;
  }

  function showPanel(mode, source, result, error) {
    ensureUi();
    popover.hidden = false;
    toolbar.hidden = false;
    panel.hidden = false;
    panel.dataset.displayMode = state.settings.displayMode;
    panel.dataset.layout = state.settings.bilingualLayout || "vertical";
    const normalizedResult = error ? { translation: error, alignments: [] } : normalizeTranslationResult(result, source);
    renderPlainText(panel.querySelector(".lit-source"), source);
    const resultNode = panel.querySelector(".lit-result");
    renderPlainText(resultNode, normalizedResult.translation);
    resultNode.classList.toggle("lit-error", Boolean(error));
    const wordInfoNode = panel.querySelector(".lit-word-info");
    wordInfoNode.hidden = true;
    wordInfoNode.textContent = "";
    if (mode === "selection" && isEnglishWord(source)) {
      state.activeWordKey = `word:${normalizeWord(source)}`;
      const searchInput = toolbar?.querySelector(".lit-word-search-input");
      if (searchInput) searchInput.value = normalizeWordQuery(source);
      renderWordInfo(source);
    } else {
      state.activeWordKey = "";
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
    if (event.button !== 0) return;
    if (!event.target.closest?.(".lit-source, .lit-result")) return;
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
    suppressNextPopoverClick = true;

    const rect = popover.getBoundingClientRect();
    const left = clamp(event.clientX - dragState.offsetX, 8, window.innerWidth - rect.width - 8);
    const top = clamp(event.clientY - dragState.offsetY, 8, window.innerHeight - Math.min(rect.height, window.innerHeight - 16) - 8);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function stopPanelDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    popover.classList.remove("lit-dragging");
    if (popover.hasPointerCapture(event.pointerId)) {
      popover.releasePointerCapture(event.pointerId);
    }
    popover.removeEventListener("pointermove", dragPanel);
    popover.removeEventListener("pointerup", stopPanelDrag);
    popover.removeEventListener("pointercancel", stopPanelDrag);
    dragState = null;
    state.pointerInsidePopover = isPointInsidePopover(event.clientX, event.clientY);
  }

  function suppressPanelClickAfterDrag(event) {
    if (!suppressNextPopoverClick) return;
    suppressNextPopoverClick = false;
    event.preventDefault();
    event.stopPropagation();
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
    state.activeTranslationKey = "";
    state.activeWordKey = "";
    popover.hidden = true;
    if (panel) panel.hidden = true;
    hideToolbar();
  }

  function suppressPopoverAutoClose(duration = 600) {
    state.suppressPopoverAutoCloseUntil = Math.max(
      state.suppressPopoverAutoCloseUntil,
      Date.now() + duration
    );
  }

  function isPopoverAutoCloseSuppressed() {
    return Date.now() < state.suppressPopoverAutoCloseUntil;
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

  function isSelectionInsidePopover(selection) {
    return Boolean(
      selection &&
      !selection.isCollapsed &&
      isInsideTranslator(selection.anchorNode) &&
      isInsideTranslator(selection.focusNode)
    );
  }

  function isPointInsidePopover(x, y) {
    if (!popover || popover.hidden) return false;
    const rect = popover.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function normalizeCacheText(text) {
    return foldText(normalizeText(text));
  }

  function foldText(text) {
    return String(text || "").toLocaleLowerCase();
  }

  async function requestWordInfo(word) {
    const normalizedWord = normalizeWord(word);
    const cacheKey = `word:${normalizedWord}`;
    state.activeWordKey = cacheKey;
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
      const response = await browserApi.runtime.sendMessage({
      type: "LIT_WORD_INFO",
        payload: { word: normalizedWord }
      });
      if (!response?.ok) throw new Error(response?.error || "词典信息获取失败");

      state.cache[cacheKey] = { status: "done", result: response.result };
      state.wordCache[cacheKey] = state.cache[cacheKey];
      saveRecentWordInfo(normalizedWord, response.result);
      if (state.activeWordKey === cacheKey) renderWordInfo(word);
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        handleRuntimeInvalidated();
        return;
      }
      state.cache[cacheKey] = { status: "error", error: error?.message || String(error) };
      state.wordCache[cacheKey] = state.cache[cacheKey];
      if (state.activeWordKey === cacheKey) renderWordInfo(word);
    }
  }

  function queryWordFromToolbar(word) {
    const text = normalizeWordQuery(word);
    if (!text) return;
    suppressPopoverAutoClose();
    const input = toolbar?.querySelector(".lit-word-search-input");
    if (input) input.value = text;
    state.sourceText = text;
    state.mode = "selection";
    if (!state.session) {
      state.session = buildTranslationSession(state.sourceNode, text, "selection");
      state.cache = state.session.cache;
    }
    state.session.texts.selection = text;
    requestTranslation("selection", text);
  }

  function handlePopoverWordLookup(event) {
    if (dragState || event.target.closest?.("button, input, select, textarea, .lit-source, .lit-result")) return;
    const word = getSelectedLookupWord();
    if (!word) return;
    queryWordFromToolbar(word);
  }

  function handlePopoverWordCopy(event) {
    if (event.target.closest?.("button, input, select, textarea, .lit-source, .lit-result")) return;
    const word = getSelectedLookupWord();
    if (!word) return;
    queryWordFromToolbar(word);
  }

  function getSelectedLookupWord() {
    const selection = window.getSelection();
    if (!isLookupSelection(selection)) return "";
    const word = normalizeWordQuery(selection.toString());
    return isEnglishWord(word) ? word : "";
  }

  function isLookupSelection(selection) {
    return Boolean(selection && !selection.isCollapsed && isSelectionInsideLookupArea(selection));
  }

  function isSelectionInsideLookupArea(selection) {
    return isNodeInsideLookupArea(selection.anchorNode) && isNodeInsideLookupArea(selection.focusNode);
  }

  function isNodeInsideLookupArea(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element?.closest?.(".lit-source, .lit-result, .lit-word-info"));
  }

  function showWordHistory(direction) {
    const words = getWordHistory();
    if (!words.length) return;
    const currentValue = normalizeWordQuery(toolbar?.querySelector(".lit-word-search-input")?.value || "");
    let index = words.findIndex((word) => normalizeWord(word) === normalizeWord(currentValue));
    if (index < 0) index = state.wordHistoryIndex >= 0 ? state.wordHistoryIndex : 0;
    index += direction === "prev" ? 1 : -1;
    if (index < 0) index = words.length - 1;
    if (index >= words.length) index = 0;
    state.wordHistoryIndex = index;
    queryWordFromToolbar(words[index]);
  }

  function getWordHistory() {
    const seen = new Set();
    return state.recentResults
      .filter((entry) => entry.type === "word" && (entry.word || entry.source))
      .map((entry) => normalizeWordQuery(entry.word || entry.source))
      .filter((word) => {
        const key = normalizeWord(word);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function renderWordInfo(word) {
    const node = panel?.querySelector(".lit-word-info");
    if (!node) return;

    const key = `word:${normalizeWord(word)}`;
    if (state.activeWordKey && state.activeWordKey !== key) return;
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
      formatPartsOfSpeech(info?.partsOfSpeech),
      formatInflections(info?.inflections),
      formatChineseDefinitions(info?.definitionsZh, info?.webDefinitions),
      formatDefinitions("英文释义", info?.definitionsEn),
      formatExamples(info?.examples),
      formatWordList("同义词", info?.synonyms),
      formatWordList("反义词", info?.antonyms)
    ].filter(Boolean);
    return sections.join("");
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-speak-text], [data-speak-word]");
    if (!button || !isInsideTranslator(button)) return;
    speakWord(button.dataset.speakText || button.dataset.speakWord || state.sourceText, button.dataset.lang || "en-US");
  }, true);

  function formatWordList(label, items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return "";
    return `<div class="lit-word-row"><strong>${label}</strong><span>${list.map(escapeHtml).join("、")}</span></div>`;
  }

  function formatPartsOfSpeech(items) {
    const list = Array.isArray(items) ? items.filter((item) => item?.pos || item?.meaning) : [];
    if (!list.length) return "";
    return `<div class="lit-word-row lit-pos-list">${list.map((item) => `
      <div class="lit-pos-item">
        <span class="lit-pos-tag">${escapeHtml(item.pos || "-")}</span>
        <span class="lit-pos-meaning">${escapeHtml(item.meaning || "")}</span>
      </div>
    `).join("")}</div>`;
  }

  function formatInflections(items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return "";
    return `<div class="lit-inflections">[ ${list.map(escapeHtml).join(" ")} ]</div>`;
  }

  function formatDefinitions(label, items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return "";
    return `<div class="lit-word-row"><strong>${label}</strong><ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
  }

  function formatChineseDefinitions(definitions, webDefinitions) {
    const normalList = Array.isArray(definitions) ? definitions.filter(Boolean) : [];
    const webList = Array.isArray(webDefinitions) ? webDefinitions.filter(Boolean) : [];
    if (!normalList.length && !webList.length) return "";
    return `<div class="lit-word-row lit-zh-definitions">
      <strong>中文释义</strong>
      ${normalList.length ? `<ul>${normalList.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${webList.length ? `<div class="lit-web-definitions"><span>网络</span>${webList.map(escapeHtml).join("；")}</div>` : ""}
    </div>`;
  }

  function formatExamples(items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return "";
    return `<div class="lit-word-row lit-examples"><strong>经典示例</strong><ul>${list.map((item) => `<li>${formatExample(item)}</li>`).join("")}</ul></div>`;
  }

  function formatExample(item) {
    if (typeof item === "string") return formatExampleText(item);
    const en = item?.en || item?.sentence || "";
    const zh = item?.zh || item?.translation || "";
    return [
      en ? formatExampleText(en) : "",
      zh ? `<div class="lit-example-zh">${escapeHtml(zh)}</div>` : ""
    ].join("");
  }

  function formatExampleText(text) {
    return `<div class="lit-example-en">
      <span>${escapeHtml(text)}</span>
      <button data-speak-text="${escapeHtml(text)}" data-lang="en-US" title="朗读示例">朗读</button>
    </div>`;
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
      const saved = await browserApi.storage.local.get("recentResults");
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
    const normalizedResult = normalizeTranslationResult(result, source);
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      mode,
      source,
      result: normalizedResult,
      createdAt: Date.now()
    };
    state.recentResults = [
      item,
      ...state.recentResults.filter((entry) => !(entry.mode === mode && entry.source === source))
    ].slice(0, 100);
    try {
      await browserApi.storage.local.set({ recentResults: state.recentResults });
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
      await browserApi.storage.local.set({ recentResults: state.recentResults });
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
      partsOfSpeech: Array.isArray(info?.partsOfSpeech) ? info.partsOfSpeech : [],
      inflections: Array.isArray(info?.inflections) ? info.inflections : [],
      definitionsZh: Array.isArray(info?.definitionsZh) ? info.definitionsZh : [],
      definitionsEn: Array.isArray(info?.definitionsEn) ? info.definitionsEn : [],
      webDefinitions: Array.isArray(info?.webDefinitions) ? info.webDefinitions : [],
      synonyms: Array.isArray(info?.synonyms) ? info.synonyms : [],
      antonyms: Array.isArray(info?.antonyms) ? info.antonyms : [],
      examples: Array.isArray(info?.examples) ? info.examples : [],
      raw: info?.raw || null
    };
  }

  function isRuntimeAvailable() {
    try {
      return state.runtimeAvailable && Boolean(browserApi?.runtime?.id);
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

  function renderPlainText(container, text) {
    container.textContent = text;
  }

  function normalizeTranslationResult(result, source) {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const translation = String(result.translation || result.result || result.text || "").trim();
      return {
        translation,
        alignments: normalizeAlignmentItems(result.alignments, source, translation)
      };
    }
    return {
      translation: String(result || "").trim(),
      alignments: []
    };
  }

  function getTranslationText(result) {
    return normalizeTranslationResult(result, "").translation;
  }

  function normalizeAlignmentItems(items, source, translation) {
    if (!Array.isArray(items)) return [];
    const sourceText = String(source || "");
    const targetText = String(translation || "");
    return items.map((item) => {
      const sourceStart = clamp(Math.floor(Number(item?.sourceStart)), 0, sourceText.length);
      const sourceEnd = clamp(Math.floor(Number(item?.sourceEnd)), sourceStart, sourceText.length);
      const targetStart = clamp(Math.floor(Number(item?.targetStart)), 0, targetText.length);
      const targetEnd = clamp(Math.floor(Number(item?.targetEnd)), targetStart, targetText.length);
      if (sourceEnd <= sourceStart || targetEnd <= targetStart) return null;
      return {
        sourceStart,
        sourceEnd,
        targetStart,
        targetEnd,
        sourceText: String(item?.sourceText || sourceText.slice(sourceStart, sourceEnd)),
        targetText: String(item?.targetText || targetText.slice(targetStart, targetEnd)),
        confidence: Number(item?.confidence || 0)
      };
    }).filter(Boolean);
  }

  function normalizeAlignmentsForRender(alignments, side, text) {
    const value = String(text || "");
    return alignments
      .map((item, index) => {
        const start = side === "source" ? item.sourceStart : item.targetStart;
        const end = side === "source" ? item.sourceEnd : item.targetEnd;
        return {
          index: `a-${index}`,
          start: clamp(Math.floor(Number(start)), 0, value.length),
          end: clamp(Math.floor(Number(end)), 0, value.length)
        };
      })
      .filter((item) => item.end > item.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function renderAlignmentSpans(container, text, side, alignments) {
    const value = String(text || "");
    let cursor = 0;
    for (const item of alignments) {
      if (item.start < cursor) continue;
      if (item.start > cursor) {
        container.appendChild(document.createTextNode(value.slice(cursor, item.start)));
      }
      const span = document.createElement("span");
      span.className = "lit-token";
      span.dataset.alignIndex = item.index;
      span.dataset.alignSide = side;
      span.textContent = value.slice(item.start, item.end);
      container.appendChild(span);
      cursor = item.end;
    }
    if (cursor < value.length) {
      container.appendChild(document.createTextNode(value.slice(cursor)));
    }
  }

  function extractReusableTranslation(entry, text) {
    const parentResult = normalizeTranslationResult(entry.result, entry.source);
    if (!parentResult.alignments.length) return null;
    const range = findTextRange(entry.source, text);
    if (!range) return null;
    const related = parentResult.alignments.filter((item) =>
      item.sourceStart >= range.start && item.sourceEnd <= range.end
    );
    if (!related.length) return null;

    const targetStart = Math.min(...related.map((item) => item.targetStart));
    const targetEnd = Math.max(...related.map((item) => item.targetEnd));
    if (targetEnd <= targetStart) return null;
    const translation = parentResult.translation.slice(targetStart, targetEnd).trim();
    if (!translation) return null;

    return {
      translation,
      alignments: related.map((item) => ({
        sourceStart: Math.max(0, item.sourceStart - range.start),
        sourceEnd: Math.min(String(text || "").length, item.sourceEnd - range.start),
        targetStart: Math.max(0, item.targetStart - targetStart),
        targetEnd: Math.min(translation.length, item.targetEnd - targetStart),
        sourceText: item.sourceText,
        targetText: item.targetText,
        confidence: item.confidence
      })).filter((item) => item.sourceEnd > item.sourceStart && item.targetEnd > item.targetStart)
    };
  }

  function findTextRange(source, text) {
    const sourceText = String(source || "");
    const needle = String(text || "");
    if (!sourceText || !needle) return null;
    let start = sourceText.indexOf(needle);
    if (start < 0) {
      start = foldText(sourceText).indexOf(foldText(needle));
    }
    if (start < 0) return null;
    return { start, end: start + needle.length };
  }

  function isWordSelection(text) {
    return isEnglishWord(text) || isChineseWordSelection(text);
  }

  function isEnglishWord(text) {
    return /^[A-Za-z][A-Za-z'-]*$/.test(normalizeText(text));
  }

  function isChineseWordSelection(text) {
    const value = normalizeText(text);
    return /^[\u3400-\u9fff]{1,6}$/.test(value);
  }

  function normalizeWord(word) {
    return normalizeText(word).toLowerCase();
  }

  function normalizeWordQuery(word) {
    return normalizeText(word).replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g, "");
  }

  function translationCacheKey(mode, text) {
    return `translation:${state.translationCacheSalt}:${mode}:${normalizeCacheText(text)}`;
  }

  function buildTranslationCacheSalt(profile) {
    if (!profile) return "";
    return [
      profile.translationMode || "auto-zh-en",
      profile.sourceLanguage || "",
      profile.targetLanguage || ""
    ].map(normalizeCacheText).join(":");
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
