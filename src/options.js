const DEFAULT_PROFILE = {
  id: "default",
  name: "本地模型",
  apiType: "openai-chat",
  baseUrl: "http://localhost:1234/v1",
  endpointPath: "/chat/completions",
  apiKey: "",
  model: "local-model",
  authType: "bearer",
  targetLanguage: "简体中文",
  temperature: 0.2,
  timeoutMs: 45000,
  priority: 1,
  systemPrompt:
    "You are a precise translation engine. Translate faithfully, keep formatting where useful, preserve names, code, URLs, numbers, and technical terms. Return only the translation."
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
    bilingualLayout: "vertical"
  }
};

const PRESETS = [
  {
    id: "lmstudio",
    label: "LM Studio OpenAI Compatible",
    values: {
      name: "LM Studio",
      baseUrl: "http://localhost:1234/v1",
      endpointPath: "/chat/completions",
      authType: "none",
      model: "local-model"
    }
  },
  {
    id: "ollama",
    label: "Ollama OpenAI Compatible",
    values: {
      name: "Ollama",
      baseUrl: "http://localhost:11434/v1",
      endpointPath: "/chat/completions",
      authType: "none",
      model: "qwen2.5:7b"
    }
  },
  {
    id: "vllm",
    label: "vLLM OpenAI Compatible",
    values: {
      name: "vLLM",
      baseUrl: "http://localhost:8000/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "local-model"
    }
  },
  {
    id: "llamacpp",
    label: "llama.cpp server",
    values: {
      name: "llama.cpp",
      baseUrl: "http://localhost:8080/v1",
      endpointPath: "/chat/completions",
      authType: "none",
      model: "local-model"
    }
  },
  {
    id: "openai",
    label: "OpenAI API",
    values: {
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "gpt-4o-mini"
    }
  },
  {
    id: "deepseek",
    label: "DeepSeek 官方 API",
    values: {
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "deepseek-chat"
    }
  },
  {
    id: "dashscope",
    label: "阿里云百炼 DashScope",
    values: {
      name: "阿里云百炼",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "qwen-plus"
    }
  },
  {
    id: "kimi",
    label: "月之暗面 Kimi",
    values: {
      name: "Kimi",
      baseUrl: "https://api.moonshot.ai/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "kimi-k2.6"
    }
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    values: {
      name: "智谱 GLM",
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
      baseUrl: "https://api.minimax.io/v1/text",
      endpointPath: "/chatcompletion_v2",
      authType: "bearer",
      model: "MiniMax-M2.7"
    }
  },
  {
    id: "volcengine",
    label: "火山方舟 Doubao",
    values: {
      name: "火山方舟",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "doubao-seed-1-6-250615"
    }
  },
  {
    id: "baidu",
    label: "百度千帆",
    values: {
      name: "百度千帆",
      baseUrl: "https://qianfan.baidubce.com/v2",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "ernie-4.5-turbo-128k"
    }
  },
  {
    id: "tencent",
    label: "腾讯混元",
    values: {
      name: "腾讯混元",
      baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "hunyuan-turbos-latest"
    }
  },
  {
    id: "openrouter",
    label: "OpenRouter OpenAI Compatible",
    values: {
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "openai/gpt-4o-mini"
    }
  },
  {
    id: "siliconflow",
    label: "SiliconFlow OpenAI Compatible",
    values: {
      name: "SiliconFlow",
      baseUrl: "https://api.siliconflow.cn/v1",
      endpointPath: "/chat/completions",
      authType: "bearer",
      model: "Qwen/Qwen2.5-7B-Instruct"
    }
  }
];

const form = document.querySelector("#settings");
const statusNode = document.querySelector("#status");
const openOptionsButton = document.querySelector("#openOptions");
const profileList = document.querySelector("#profileList");
const presetSelect = document.querySelector("#preset");
const activeProfileSelect = document.querySelector("#activeProfileId");
const availableModelsSelect = document.querySelector("#availableModels");
const extensionApiAvailable = Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.sync);

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
  activeProfileId = selectedProfileId;
  if (await save()) {
    setStatus("配置已保存，当前模型已启用");
  }
});

document.querySelector("#test").addEventListener("click", async () => {
  persistCurrentForm();
  activeProfileId = selectedProfileId;
  await save();
  setStatus("测试中...");

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
    setStatus(`已获取 ${response.result.models.length} 个模型，选择后会自动填入模型名`);
  } catch (error) {
    setStatus(error?.message || String(error), true);
  }
});

document.querySelector("#addProfile").addEventListener("click", () => {
  persistCurrentForm();
  const profile = {
    ...DEFAULT_PROFILE,
    id: crypto.randomUUID(),
    name: uniqueName("新模型配置")
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
    name: uniqueName(`${current.name} 副本`)
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
  const item = event.target.closest("[data-profile-id]");
  if (!item) return;
  persistCurrentForm();
  selectedProfileId = item.dataset.profileId;
  render();
});

presetSelect.addEventListener("change", () => {
  const preset = PRESETS.find((item) => item.id === presetSelect.value);
  if (!preset) return;

  for (const [key, value] of Object.entries(preset.values)) {
    if (form.elements[key]) form.elements[key].value = value;
  }
  fetchedModels = [];
  resetAvailableModels();
  setStatus("已填充预设参数，请按需调整并保存");
  appendSpeechStatus();
});

availableModelsSelect.addEventListener("change", () => {
  if (!availableModelsSelect.value) return;
  form.elements.model.value = availableModelsSelect.value;
  persistCurrentForm();
  renderProfileList();
  renderActiveProfileSelect();
});

activeProfileSelect.addEventListener("change", () => {
  persistCurrentForm();
  activeProfileId = activeProfileSelect.value;
  selectedProfileId = activeProfileId;
  render();
  setStatus("已切换当前启用模型，保存后生效");
});

openOptionsButton.addEventListener("click", () => {
  if (!extensionApiAvailable) {
    setStatus("请从浏览器扩展管理页加载本项目后再打开配置页", true);
    return;
  }
  chrome.runtime.openOptionsPage();
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

  const saved = await chrome.storage.sync.get(null);
  profiles = normalizeProfiles(saved);
  settings = { ...DEFAULT_CONFIG.settings, ...(saved.settings || {}) };
  activeProfileId = profiles.some((profile) => profile.id === saved.activeProfileId)
    ? saved.activeProfileId
    : profiles[0].id;
  selectedProfileId = activeProfileId;
  render();
}

async function save() {
  settings = readSettingsFromForm();
  if (!extensionApiAvailable) {
    setStatus("当前页面没有扩展权限，无法保存配置。请从插件图标或扩展详情页打开配置。", true);
    return false;
  }

  await chrome.storage.sync.set({
    activeProfileId,
    profiles: profiles.map(normalizeProfile),
    settings
  });
  render();
  return true;
}

function render() {
  renderProfileList();
  renderActiveProfileSelect();
  fillForm(getSelectedProfile());
  fillSettings(settings);
  document.querySelector("#deleteProfile").disabled = profiles.length <= 1;
}

function renderProfileList() {
  profileList.innerHTML = "";

  for (const profile of profiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `profile-item${profile.id === selectedProfileId ? " active" : ""}`;
    button.dataset.profileId = profile.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(profile.id === selectedProfileId));
    button.innerHTML = `
      <span class="profile-name"></span>
      <span class="profile-detail"></span>
    `;
    button.querySelector(".profile-name").textContent = profile.id === activeProfileId
      ? `${profile.name} · 当前`
      : profile.name;
    button.querySelector(".profile-detail").textContent = `P${profile.priority} | ${profile.model} | ${profile.baseUrl}`;
    profileList.appendChild(button);
  }
}

function renderActiveProfileSelect() {
  activeProfileSelect.innerHTML = "";

  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === activeProfileId;
    activeProfileSelect.appendChild(option);
  }
}

function fillForm(profile) {
  presetSelect.value = "";
  resetAvailableModels(profile.model);
  for (const [key, value] of Object.entries(profile)) {
    const field = form.elements[key];
    if (field) field.value = value;
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
  return {
    name: form.elements.name.value.trim() || "未命名配置",
    apiType: "openai-chat",
    baseUrl: form.elements.baseUrl.value.trim() || DEFAULT_PROFILE.baseUrl,
    endpointPath: form.elements.endpointPath.value.trim() || DEFAULT_PROFILE.endpointPath,
    apiKey: form.elements.apiKey.value.trim(),
    model: form.elements.model.value.trim() || DEFAULT_PROFILE.model,
    authType: form.elements.authType.value || DEFAULT_PROFILE.authType,
    targetLanguage: form.elements.targetLanguage.value.trim() || DEFAULT_PROFILE.targetLanguage,
    temperature: Number(form.elements.temperature.value || DEFAULT_PROFILE.temperature),
    timeoutMs: Number(form.elements.timeoutMs.value || DEFAULT_PROFILE.timeoutMs),
    priority: clampNumber(Number(form.elements.priority.value || DEFAULT_PROFILE.priority), 1, 999),
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
  option.value = "";
  option.textContent = currentModel ? `当前：${currentModel}` : "先获取模型列表";
  availableModelsSelect.appendChild(option);
}

function normalizeProfiles(saved) {
  if (Array.isArray(saved.profiles) && saved.profiles.length) {
    return saved.profiles.map(normalizeProfile);
  }

  return [normalizeProfile({ ...DEFAULT_PROFILE, ...saved })];
}

function normalizeProfile(profile) {
  return {
    ...DEFAULT_PROFILE,
    ...profile,
    id: profile?.id || crypto.randomUUID(),
    name: profile?.name || profile?.model || DEFAULT_PROFILE.name,
    endpointPath: profile?.endpointPath || DEFAULT_PROFILE.endpointPath,
    authType: profile?.authType || DEFAULT_PROFILE.authType,
    priority: clampNumber(Number(profile?.priority || DEFAULT_PROFILE.priority), 1, 999)
  };
}

function getSelectedProfile() {
  return profiles.find((profile) => profile.id === selectedProfileId) || profiles[0];
}

function uniqueName(baseName) {
  const used = new Set(profiles.map((profile) => profile.name));
  if (!used.has(baseName)) return baseName;

  let index = 2;
  while (used.has(`${baseName} ${index}`)) index += 1;
  return `${baseName} ${index}`;
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

async function sendRuntimeMessage(message) {
  if (!extensionApiAvailable) {
    throw new Error("当前页面没有扩展运行环境，无法调用后台。请从插件图标打开完整配置页。");
  }
  return chrome.runtime.sendMessage(message);
}
