const DEFAULT_PROFILE = {
  id: "default",
  name: "本地模型",
  apiType: "openai-chat",
  baseUrl: "http://localhost:1234/v1",
  endpointPath: "/chat/completions",
  apiKey: "",
  model: "local-model",
  presetId: "lmstudio",
  authType: "bearer",
  translationMode: "auto-zh-en",
  sourceLanguage: "自动检测",
  targetLanguage: "简体中文",
  thinkingMode: false,
  temperature: 0.2,
  timeoutMs: 45000,
  priority: 1,
  systemPrompt:
    "You are a precise translation engine. Translate faithfully, keep formatting where useful, preserve names, code, URLs, numbers, and technical terms."
};

const DEFAULT_CONFIG = {
  activeProfileId: DEFAULT_PROFILE.id,
  profiles: [DEFAULT_PROFILE],
  settings: {
    displayMode: "bilingual",
    hoverTranslate: true,
    hoverModifier: "ctrl",
    inputTranslate: true,
    inputTriggerSpaces: 3,
    bilingualLayout: "vertical",
    requestLogging: false
  }
};

const PRESETS = [
  {
    id: "lmstudio",
    label: "LM Studio",
    values: {
      name: "LM Studio",
      presetId: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      endpointPath: "/chat/completions",
      authType: "none",
      model: "local-model"
    }
  },
  {
    id: "ollama",
    label: "Ollama",
    values: {
      name: "Ollama",
      presetId: "ollama",
      baseUrl: "http://localhost:11434/v1",
      endpointPath: "/chat/completions",
      authType: "none",
      model: "qwen2.5:7b"
    }
  },
  {
    id: "vllm",
    label: "vLLM",
    values: {
      name: "vLLM",
      presetId: "vllm",
      baseUrl: "http://localhost:8000/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "local-model"
    }
  },
  {
    id: "llamacpp",
    label: "llama.cpp",
    values: {
      name: "llama.cpp",
      presetId: "llamacpp",
      baseUrl: "http://localhost:8080/v1",
      endpointPath: "/chat/completions",
      authType: "none",
      model: "local-model"
    }
  },
  {
    id: "openai",
    label: "OpenAI",
    values: {
      name: "OpenAI",
      presetId: "openai",
      baseUrl: "https://api.openai.com/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "gpt-4o-mini"
    }
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    values: {
      name: "DeepSeek",
      presetId: "deepseek",
      baseUrl: "https://api.deepseek.com",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "deepseek-chat"
    }
  },
  {
    id: "dashscope",
    label: "DashScope",
    values: {
      name: "阿里云百炼",
      presetId: "dashscope",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "qwen-plus"
    }
  },
  {
    id: "kimi",
    label: "Kimi",
    values: {
      name: "Kimi",
      presetId: "kimi",
      baseUrl: "https://api.moonshot.ai/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "kimi-k2.6"
    }
  },
  {
    id: "zhipu",
    label: "GLM",
    values: {
      name: "智谱 GLM",
      presetId: "zhipu",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "glm-4-flash"
    }
  },
  {
    id: "minimax",
    label: "MiniMax",
    values: {
      name: "MiniMax",
      presetId: "minimax",
      baseUrl: "https://api.minimaxi.com/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "MiniMax-M2.7"
    }
  },
  {
    id: "volcengine",
    label: "Doubao",
    values: {
      name: "火山方舟",
      presetId: "volcengine",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "doubao-seed-1-6-250615"
    }
  },
  {
    id: "baidu",
    label: "千帆",
    values: {
      name: "百度千帆",
      presetId: "baidu",
      baseUrl: "https://qianfan.baidubce.com/v2",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "ernie-4.5-turbo-128k"
    }
  },
  {
    id: "tencent",
    label: "混元",
    values: {
      name: "腾讯混元",
      presetId: "tencent",
      baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "hunyuan-turbos-latest"
    }
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    values: {
      name: "OpenRouter",
      presetId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "openai/gpt-4o-mini"
    }
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    values: {
      name: "SiliconFlow",
      presetId: "siliconflow",
      baseUrl: "https://api.siliconflow.cn/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "Qwen/Qwen2.5-7B-Instruct"
    }
  },
  {
    id: "codeplan",
    label: "CodePlan",
    values: {
      name: "CodePlan",
      presetId: "codeplan",
      baseUrl: "https://api.codingplanx.ai/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "gpt-5-mini"
    }
  }
];

const form = document.querySelector("#settings");
const statusNode = document.querySelector("#status");
const openOptionsButton = document.querySelector("#openOptions");
const profileList = document.querySelector("#profileList");
const presetSelect = document.querySelector("#preset");
const availableModelsSelect = document.querySelector("#availableModels");
const importConfigFile = document.querySelector("#importConfigFile");
const requestLogList = document.querySelector("#requestLogList");
const browserApi = globalThis.litBrowser;
const extensionApiAvailable = Boolean(browserApi?.runtime?.id && browserApi?.storage?.sync);

let profiles = [];
let activeProfileId = DEFAULT_PROFILE.id;
let selectedProfileId = DEFAULT_PROFILE.id;
let settings = { ...DEFAULT_CONFIG.settings };
let fetchedModels = [];

initPageMode();
initPresets();
load();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  persistCurrentForm();
  if (await save()) {
    setStatus("配置已保存");
  }
});

document.querySelector("#test").addEventListener("click", async () => {
  persistCurrentForm();
  await save();
  setStatus("正在测试当前启用模型...");

  try {
    const response = await sendRuntimeMessage({
      type: "LIT_TRANSLATE",
      payload: {
        mode: "sentence",
        text: "Immersive translation keeps the original context visible."
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "测试失败");
    }

    setStatus(`测试成功：${response.result.translation}`);
  } catch (error) {
    setStatus(error?.message || String(error), true);
  }
});

document.querySelector("#fetchModels").addEventListener("click", async () => {
  persistCurrentForm();
  setStatus("正在获取模型列表...");

  try {
    const response = await sendRuntimeMessage({
      type: "LIT_LIST_MODELS",
      payload: getProfileFromForm()
    });

    if (!response?.ok) {
      throw new Error(response?.error || "模型列表获取失败");
    }

    fetchedModels = response.result.models;
    renderAvailableModels(fetchedModels);
    setStatus(`已获取 ${response.result.models.length} 个模型，请从已部署模型中选择`);
  } catch (error) {
    setStatus(error?.message || String(error), true);
  }
});

document.querySelector("#refreshLogs").addEventListener("click", () => {
  renderRequestLogs();
});

document.querySelector("#exportLogs").addEventListener("click", async () => {
  await exportRequestLogs();
});

document.querySelector("#clearLogs").addEventListener("click", async () => {
  await clearRequestLogs();
});

document.querySelector("#exportConfig").addEventListener("click", () => {
  persistCurrentForm();
  exportConfig();
});

document.querySelector("#importConfig").addEventListener("click", () => {
  if (!extensionApiAvailable) {
    setStatus("当前页面没有扩展权限，无法导入配置。请从插件图标或扩展详情页打开配置。", true);
    return;
  }
  importConfigFile.value = "";
  importConfigFile.click();
});

importConfigFile.addEventListener("change", async () => {
  const file = importConfigFile.files?.[0];
  if (!file) return;
  await importConfig(file);
});

document.querySelector("#addProfile").addEventListener("click", () => {
  persistCurrentForm();
  const model = DEFAULT_PROFILE.model;
  const profile = {
    ...DEFAULT_PROFILE,
    id: crypto.randomUUID(),
    model,
    name: uniqueProfileName(model)
  };
  profiles.push(profile);
  selectedProfileId = profile.id;
  render();
  setStatus(`已新增配置，保存后生效。${getSpeechCapabilityMessage()}`);
});

document.querySelector("#duplicateProfile").addEventListener("click", () => {
  persistCurrentForm();
  const current = getSelectedProfile();
  const profile = {
    ...current,
    id: crypto.randomUUID(),
    name: uniqueProfileName(current.name)
  };
  profiles.push(profile);
  selectedProfileId = profile.id;
  render();
  setStatus("已复制当前配置，保存后生效");
});

document.querySelector("#deleteProfile").addEventListener("click", () => {
  if (profiles.length <= 1) {
    setStatus("至少保留一个模型配置", true);
    return;
  }

  const index = profiles.findIndex((profile) => profile.id === selectedProfileId);
  profiles = profiles.filter((profile) => profile.id !== selectedProfileId);
  selectedProfileId = profiles[Math.max(0, index - 1)]?.id || profiles[0].id;
  if (activeProfileId && !profiles.some((profile) => profile.id === activeProfileId)) {
    activeProfileId = selectedProfileId;
  }
  render();
  setStatus("已删除配置，保存后生效");
});

profileList.addEventListener("click", (event) => {
  const activate = event.target.closest("[data-activate-profile]");
  if (activate) {
    event.stopPropagation();
    persistCurrentForm();
    activeProfileId = activate.dataset.activateProfile;
    selectedProfileId = activeProfileId;
    render();
    setStatus("已切换当前启用模型，保存后生效");
    return;
  }

  const item = event.target.closest("[data-profile-id]");
  if (!item) return;
  persistCurrentForm();
  selectedProfileId = item.dataset.profileId;
  render();
});

presetSelect.addEventListener("change", () => {
  const preset = PRESETS.find((item) => item.id === presetSelect.value);
  const profile = getSelectedProfile();
  if (!preset) {
    if (profile) profile.presetId = "";
    renderProfileList();
    setStatus("已切换为完全自定义配置，保存后生效");
    return;
  }

  for (const [key, value] of Object.entries(preset.values)) {
    if (key === "model") {
      resetAvailableModels(value);
    } else if (form.elements[key]) {
      form.elements[key].value = value;
    }
  }
  if (profile) {
    profile.presetId = preset.id;
  }
  updateSelectedProfileName(preset.values.model);
  fetchedModels = [];
  setStatus("已填充预设参数，请按需调整并保存");
  appendSpeechStatus();
});

availableModelsSelect.addEventListener("change", () => {
  if (!availableModelsSelect.value) return;
  updateSelectedProfileName(availableModelsSelect.value);
  persistCurrentForm();
  renderProfileList();
});

openOptionsButton.addEventListener("click", () => {
  if (!extensionApiAvailable) {
    setStatus("请从浏览器扩展管理页加载本项目后再打开配置页", true);
    return;
  }
  browserApi.runtime.openOptionsPage();
});

function initPageMode() {
  const params = new URLSearchParams(location.search);
  const isPopup = params.has("popup") || window.innerWidth < 520;

  if (isPopup) {
    document.body.classList.add("popup");
    openOptionsButton.hidden = false;
  }
}

function initPresets() {
  for (const preset of PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    presetSelect.appendChild(option);
  }
}

async function load() {
  if (!extensionApiAvailable) {
    profiles = [normalizeProfile(DEFAULT_PROFILE)];
    settings = { ...DEFAULT_CONFIG.settings };
    activeProfileId = profiles[0].id;
    selectedProfileId = activeProfileId;
    render();
    setStatus("当前是普通网页预览，无法保存或调用扩展后台。请在扩展管理页加载项目后使用。", true);
    return;
  }

  const saved = await browserApi.storage.sync.get(null);
  profiles = normalizeProfiles(saved);
  settings = { ...DEFAULT_CONFIG.settings, ...(saved.settings || {}) };
  activeProfileId = profiles.some((profile) => profile.id === saved.activeProfileId)
    ? saved.activeProfileId
    : profiles[0].id;
  selectedProfileId = activeProfileId;
  render();
  renderRequestLogs();
}

async function save() {
  settings = readSettingsFromForm();
  if (!extensionApiAvailable) {
    setStatus("当前页面没有扩展权限，无法保存配置。请从插件图标或扩展详情页打开配置。", true);
    return false;
  }

  await browserApi.storage.sync.set({
    activeProfileId,
    profiles: profiles.map(normalizeProfile),
    settings
  });
  render();
  return true;
}

function buildExportConfig() {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    activeProfileId,
    profiles: profiles.map(normalizeProfile),
    settings: normalizeSettings(settings)
  };
}

function exportConfig() {
  const config = buildExportConfig();
  const blob = new Blob([`${JSON.stringify(config, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `local-immersive-translator-config-${formatDateForFilename(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`已导出全部 ${config.profiles.length} 个模型配置`);
}

async function importConfig(file) {
  try {
    const imported = normalizeImportedConfig(JSON.parse(await file.text()));
    profiles = imported.profiles;
    settings = imported.settings;
    activeProfileId = imported.activeProfileId;
    selectedProfileId = activeProfileId;
    await browserApi.storage.sync.set({
      activeProfileId,
      profiles: profiles.map(normalizeProfile),
      settings
    });
    fetchedModels = [];
    render();
    setStatus(`已导入 ${profiles.length} 个模型配置，重名配置已自动追加序号`);
  } catch (error) {
    setStatus(`导入失败：${error?.message || String(error)}`, true);
  }
}

function normalizeImportedConfig(value) {
  const source = value?.config && typeof value.config === "object" ? value.config : value;
  const importedProfiles = normalizeProfiles(source || {});
  if (!importedProfiles.length) {
    throw new Error("JSON 中没有可用的模型配置");
  }

  const importedActiveId = importedProfiles.some((profile) => profile.id === source?.activeProfileId)
    ? source.activeProfileId
    : importedProfiles[0].id;

  return {
    activeProfileId: importedActiveId,
    profiles: importedProfiles,
    settings: normalizeSettings(source?.settings)
  };
}

function normalizeSettings(value) {
  const source = value || {};
  return {
    displayMode: ["bilingual", "translationOnly", "sourceCollapsed"].includes(source.displayMode)
      ? source.displayMode
      : DEFAULT_CONFIG.settings.displayMode,
    bilingualLayout: ["vertical", "horizontal"].includes(source.bilingualLayout)
      ? source.bilingualLayout
      : DEFAULT_CONFIG.settings.bilingualLayout,
    hoverTranslate: typeof source.hoverTranslate === "boolean"
      ? source.hoverTranslate
      : DEFAULT_CONFIG.settings.hoverTranslate,
    hoverModifier: ["ctrl", "alt", "shift", "none"].includes(source.hoverModifier)
      ? source.hoverModifier
      : DEFAULT_CONFIG.settings.hoverModifier,
    inputTranslate: typeof source.inputTranslate === "boolean"
      ? source.inputTranslate
      : DEFAULT_CONFIG.settings.inputTranslate,
    requestLogging: typeof source.requestLogging === "boolean"
      ? source.requestLogging
      : DEFAULT_CONFIG.settings.requestLogging,
    inputTriggerSpaces: clampNumber(
      Number(source.inputTriggerSpaces || DEFAULT_CONFIG.settings.inputTriggerSpaces),
      2,
      6
    )
  };
}

function formatDateForFilename(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function render() {
  renderProfileList();
  fillForm(getSelectedProfile());
  fillSettings(settings);
  document.querySelector("#deleteProfile").disabled = profiles.length <= 1;
}

async function getRequestLogs() {
  if (!extensionApiAvailable) return [];
  const saved = await browserApi.storage.local.get("requestLogs");
  return Array.isArray(saved.requestLogs) ? saved.requestLogs : [];
}

async function renderRequestLogs() {
  if (!requestLogList) return;
  if (!extensionApiAvailable) {
    requestLogList.textContent = "当前页面没有扩展权限，无法读取请求日志。";
    return;
  }

  const logs = await getRequestLogs();
  if (!logs.length) {
    requestLogList.innerHTML = `<div class="empty-log">暂无请求日志。开启“请求日志”后，新的大模型请求会显示在这里。</div>`;
    return;
  }

  requestLogList.innerHTML = logs.map((log) => `
    <details class="request-log-item">
      <summary>
        <span class="log-main">
          <span class="log-status ${log.ok ? "ok" : "error"}">${log.ok ? "成功" : "失败"}</span>
          <span>${escapeHtml(log.type || "chat")}</span>
          <span>${escapeHtml(log.model || "-")}</span>
        </span>
        <span class="log-meta">${escapeHtml(formatLogTime(log.createdAt))} · ${Number(log.durationMs || 0)}ms</span>
      </summary>
      <div class="log-detail-grid">
        <label><span>请求 URL</span><pre>${escapeHtml(log.url || "")}</pre></label>
        <label><span>输入</span><pre>${escapeHtml(JSON.stringify(log.requestBody || {}, null, 2))}</pre></label>
        <label><span>输出</span><pre>${escapeHtml(log.responseText || JSON.stringify(log.responseBody || {}, null, 2))}</pre></label>
        ${log.error ? `<label><span>错误</span><pre>${escapeHtml(log.error)}</pre></label>` : ""}
      </div>
    </details>
  `).join("");
}

async function exportRequestLogs() {
  const logs = await getRequestLogs();
  const blob = new Blob([`${JSON.stringify({ exportedAt: new Date().toISOString(), logs }, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `local-immersive-translator-logs-${formatDateForFilename(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`已导出 ${logs.length} 条请求日志`);
}

async function clearRequestLogs() {
  if (!extensionApiAvailable) return;
  await browserApi.storage.local.set({ requestLogs: [] });
  await renderRequestLogs();
  setStatus("请求日志已清空");
}

function formatLogTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function renderProfileList() {
  profileList.innerHTML = "";

  for (const profile of profiles) {
    const item = document.createElement("div");
    item.className = `profile-item${profile.id === selectedProfileId ? " active" : ""}`;
    item.dataset.profileId = profile.id;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(profile.id === selectedProfileId));
    item.innerHTML = `
      <span class="profile-topline">
        <span class="profile-name"></span>
      </span>
      <span class="profile-tags"></span>
      <span class="profile-card-actions">
        <span class="profile-activate" data-activate-profile="${profile.id}"></span>
      </span>
    `;
    const isActive = profile.id === activeProfileId;
    item.querySelector(".profile-name").textContent = profile.name;
    item.querySelector(".profile-tags").innerHTML = [
      isActive ? "当前启用" : "",
      `P${profile.priority}`,
      getProfilePresetLabel(profile)
    ].filter(Boolean).map((label) => `<span>${escapeHtml(label)}</span>`).join("");
    const activate = item.querySelector(".profile-activate");
    if (isActive) {
      activate.hidden = true;
    } else {
      activate.textContent = "设为当前";
    }
    profileList.appendChild(item);
  }
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

function fillForm(profile) {
  presetSelect.value = profile.presetId && PRESETS.some((preset) => preset.id === profile.presetId)
    ? profile.presetId
    : "";
  resetAvailableModels(profile.model);
  for (const [key, value] of Object.entries(profile)) {
    const field = form.elements[key];
    if (!field) continue;
    if (key === "priority") {
      setRadioValue("priority", String(clampPriority(value)));
    } else if (key !== "model") {
      field.value = value;
    }
  }
}

function fillSettings(nextSettings) {
  for (const [key, value] of Object.entries(nextSettings)) {
    const field = form.elements[key];
    if (field) field.value = String(value);
  }
}

function readSettingsFromForm() {
  return {
    displayMode: form.elements.displayMode.value || DEFAULT_CONFIG.settings.displayMode,
    bilingualLayout: form.elements.bilingualLayout.value || DEFAULT_CONFIG.settings.bilingualLayout,
    hoverTranslate: form.elements.hoverTranslate.value === "true",
    hoverModifier: form.elements.hoverModifier.value || DEFAULT_CONFIG.settings.hoverModifier,
    inputTranslate: form.elements.inputTranslate.value === "true",
    requestLogging: form.elements.requestLogging.value === "true",
    inputTriggerSpaces: clampNumber(
      Number(form.elements.inputTriggerSpaces.value || DEFAULT_CONFIG.settings.inputTriggerSpaces),
      2,
      6
    )
  };
}

function persistCurrentForm() {
  const index = profiles.findIndex((profile) => profile.id === selectedProfileId);
  if (index === -1) return;
  settings = readSettingsFromForm();

  profiles[index] = normalizeProfile({
    ...profiles[index],
    ...getProfileFromForm()
  });
}

function getProfileFromForm() {
  const current = getSelectedProfile();
  const model = availableModelsSelect.value || current?.model || DEFAULT_PROFILE.model;
  return {
    name: current?.name || uniqueProfileName(model, current?.id),
    apiType: "openai-chat",
    presetId: current?.presetId || inferPresetIdFromProfile(current) || "",
    baseUrl: form.elements.baseUrl.value.trim() || DEFAULT_PROFILE.baseUrl,
    endpointPath: form.elements.endpointPath.value.trim() || DEFAULT_PROFILE.endpointPath,
    apiKey: form.elements.apiKey.value.trim(),
    model,
    authType: form.elements.authType.value || DEFAULT_PROFILE.authType,
    translationMode: form.elements.translationMode.value || DEFAULT_PROFILE.translationMode,
    sourceLanguage: form.elements.sourceLanguage.value.trim() || DEFAULT_PROFILE.sourceLanguage,
    targetLanguage: form.elements.targetLanguage.value.trim() || DEFAULT_PROFILE.targetLanguage,
    thinkingMode: form.elements.thinkingMode.value === "true",
    temperature: Number(form.elements.temperature.value || DEFAULT_PROFILE.temperature),
    timeoutMs: Number(form.elements.timeoutMs.value || DEFAULT_PROFILE.timeoutMs),
    priority: clampPriority(getRadioValue("priority") || DEFAULT_PROFILE.priority),
    systemPrompt: form.elements.systemPrompt.value.trim() || DEFAULT_PROFILE.systemPrompt
  };
}

function renderAvailableModels(models) {
  availableModelsSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "选择已部署模型";
  availableModelsSelect.appendChild(placeholder);

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    availableModelsSelect.appendChild(option);
  }
}

function resetAvailableModels(currentModel = "") {
  availableModelsSelect.innerHTML = "";
  const option = document.createElement("option");
  option.value = currentModel || "";
  option.textContent = currentModel || "先获取模型列表";
  option.selected = true;
  availableModelsSelect.appendChild(option);
}

function normalizeProfiles(saved) {
  const sourceProfiles = Array.isArray(saved.profiles) && saved.profiles.length
    ? saved.profiles
    : [{ ...DEFAULT_PROFILE, ...saved }];
  const used = new Set();
  return sourceProfiles.map((profile) => {
    const normalized = normalizeProfile(profile);
    normalized.name = uniqueProfileNameFromSet(normalized.name, used);
    used.add(normalized.name);
    return normalized;
  });
}

function uniqueProfileNameFromSet(baseName, used) {
  const normalizedBase = String(baseName || "未命名配置").trim() || "未命名配置";
  if (!used.has(normalizedBase)) return normalizedBase;

  let index = 2;
  while (used.has(`${normalizedBase} ${index}`)) index += 1;
  return `${normalizedBase} ${index}`;
}

function normalizeProfile(profile) {
  const model = profile?.model || DEFAULT_PROFILE.model;
  const presetId = normalizePresetId(profile?.presetId || inferPresetIdFromProfile(profile));
  return {
    ...DEFAULT_PROFILE,
    ...profile,
    presetId,
    id: profile?.id || crypto.randomUUID(),
    name: profile?.name || model,
    endpointPath: profile?.endpointPath || DEFAULT_PROFILE.endpointPath,
    authType: profile?.authType || DEFAULT_PROFILE.authType,
    translationMode: ["auto-zh-en", "manual"].includes(profile?.translationMode)
      ? profile.translationMode
      : DEFAULT_PROFILE.translationMode,
    sourceLanguage: String(profile?.sourceLanguage || DEFAULT_PROFILE.sourceLanguage).trim() || DEFAULT_PROFILE.sourceLanguage,
    targetLanguage: String(profile?.targetLanguage || DEFAULT_PROFILE.targetLanguage).trim() || DEFAULT_PROFILE.targetLanguage,
    thinkingMode: profile?.thinkingMode === true,
    priority: clampPriority(profile?.priority || DEFAULT_PROFILE.priority)
  };
}

function normalizePresetId(value) {
  const id = String(value || "").trim();
  return PRESETS.some((preset) => preset.id === id) ? id : "";
}

function inferPresetIdFromProfile(profile) {
  if (!profile) return "";
  const baseUrl = normalizeUrlForCompare(profile.baseUrl);
  const endpointPath = normalizeEndpointForCompare(profile.endpointPath);
  const authType = String(profile.authType || "");
  const matched = PRESETS.find((preset) => {
    const values = preset.values;
    return normalizeUrlForCompare(values.baseUrl) === baseUrl &&
      normalizeEndpointForCompare(values.endpointPath) === endpointPath &&
      String(values.authType || DEFAULT_PROFILE.authType) === authType;
  });
  return matched?.id || "";
}

function getProfilePresetLabel(profile) {
  const preset = PRESETS.find((item) => item.id === profile.presetId);
  if (!preset) return "自定义";
  return isProfileCustomizedFromPreset(profile, preset) ? `基于 ${preset.label} 自定义` : preset.label;
}

function isProfileCustomizedFromPreset(profile, preset) {
  const values = preset.values;
  return normalizeUrlForCompare(profile.baseUrl) !== normalizeUrlForCompare(values.baseUrl) ||
    normalizeEndpointForCompare(profile.endpointPath) !== normalizeEndpointForCompare(values.endpointPath) ||
    String(profile.authType || "") !== String(values.authType || "") ||
    String(profile.model || "") !== String(values.model || "");
}

function normalizeUrlForCompare(value) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function normalizeEndpointForCompare(value) {
  const endpoint = String(value || "").trim() || DEFAULT_PROFILE.endpointPath;
  return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}

function getSelectedProfile() {
  return profiles.find((profile) => profile.id === selectedProfileId) || profiles[0];
}

function uniqueProfileName(baseName, currentId = "") {
  const normalizedBase = String(baseName || "未命名配置").trim() || "未命名配置";
  const used = new Set(profiles
    .filter((profile) => profile.id !== currentId)
    .map((profile) => profile.name));
  if (!used.has(normalizedBase)) return normalizedBase;

  let index = 2;
  while (used.has(`${normalizedBase} ${index}`)) index += 1;
  return `${normalizedBase} ${index}`;
}

function updateSelectedProfileName(model) {
  const profile = getSelectedProfile();
  if (!profile) return;
  profile.name = uniqueProfileName(model, profile.id);
  renderProfileList();
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", isError);
}

function appendSpeechStatus() {
  const current = statusNode.textContent ? `${statusNode.textContent} ` : "";
  setStatus(`${current}${getSpeechCapabilityMessage()}`, statusNode.classList.contains("error"));
}

function getSpeechCapabilityMessage() {
  if (!("speechSynthesis" in window)) {
    return "发音检测：当前浏览器不支持朗读。";
  }
  const voices = window.speechSynthesis.getVoices();
  const hasUS = voices.some((voice) => voice.lang === "en-US");
  const hasUK = voices.some((voice) => voice.lang === "en-GB");
  if (hasUS && hasUK) return "发音检测：美式、英式朗读可用。";
  if (hasUS || hasUK) return `发音检测：${hasUS ? "美式" : "英式"}朗读可用，另一种会使用英文语音回退。`;
  return "发音检测：未发现美式/英式语音，会使用浏览器默认英文语音回退。";
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    if (!statusNode.textContent) setStatus(getSpeechCapabilityMessage());
  };
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampPriority(value) {
  return clampNumber(Number(value || DEFAULT_PROFILE.priority), 1, 3);
}

function getRadioValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
}

function setRadioValue(name, value) {
  const field = form.querySelector(`input[name="${name}"][value="${value}"]`) ||
    form.querySelector(`input[name="${name}"]`);
  if (field) field.checked = true;
}

async function sendRuntimeMessage(message) {
  if (!extensionApiAvailable) {
    throw new Error("当前页面没有扩展运行环境，无法调用后台。请从插件图标打开完整配置页。");
  }
  return browserApi.runtime.sendMessage(message);
}
