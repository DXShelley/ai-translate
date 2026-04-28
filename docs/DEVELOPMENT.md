# 开发规范

本文档记录 Local Immersive Translator 的开发约定。后续功能调整应优先遵循本文档，避免破坏现有交互、缓存和模型兼容行为。

## 架构边界

### `src/content.js`

负责网页侧能力：

- 监听选区、鼠标、键盘事件
- 解析划词、句子、段落文本
- 管理弹框 UI
- 管理当前弹框 session 缓存
- 管理单词查询内存缓存
- 读写最近 100 条本地历史
- 调用 `litBrowser.runtime.sendMessage` 请求后台
- 使用 `activeTranslationKey` 和 `activeWordKey` 防止旧请求覆盖当前 UI

内容脚本不得直接请求模型接口。

### `src/background.js`

负责扩展后台能力：

- 通过 `litBrowser.storage.sync` 读取模型配置
- 处理右键菜单和快捷键消息
- 调用 OpenAI 兼容接口
- 模型优先级 fallback
- `hy-mt*` 模型兼容提示格式
- 词典 JSON 修复和格式化
- 模型列表获取

模型请求、鉴权、超时、错误归一化必须集中在 background 中处理。

### 浏览器适配

`src/browser-adapter.js` 统一封装扩展 API：

- Chrome / Edge：使用 `chrome.*` callback API，并包装为 Promise。
- Firefox：优先使用 `browser.*` Promise API。
- 其他浏览器：通过 `detectBrowserVendor()` 和 `litBrowser` wrapper 继续扩展。

业务代码不应直接调用 `chrome.*` 或 `browser.*`。

### `src/options.*`

负责配置页：

- 多模型配置
- 当前启用模型
- P1/P2/P3 优先级
- 接口预设
- 模型发现
- 翻译参数
- 前端交互设置

配置页只保存配置，不承担翻译业务逻辑。

### MiniMax 预设

MiniMax 使用 OpenAI 兼容协议：

- Provider：OpenAI Compatible / Custom / OpenAI-format
- Base URL：`https://api.minimaxi.com/v1`
- Endpoint Path：`/chat/completions`
- Auth：Bearer Token
- API Key：Token Plan API Key
- Model ID：`MiniMax-M2.7` 或 `MiniMax-M2.7-highspeed`

### 思考模式

模型配置包含 `thinkingMode`，默认 `false`。后台按已确认的服务商规范下发参数：

- DashScope / SiliconFlow：`enable_thinking: false/true`
- vLLM + Qwen/QwQ：`chat_template_kwargs.enable_thinking: false/true`
- Kimi / GLM：`thinking.type: "disabled" | "enabled"`
- OpenRouter：关闭时 `reasoning.effort: "none"` 且 `reasoning.exclude: true`
- OpenAI / CodePlan 的 `gpt-5*`：`reasoning_effort: "minimal" | "low"`
- DeepSeek：默认 `deepseek-chat` 不开启思考；开启时发送 `thinking.type: "enabled"`

未确认官方禁用参数的服务商不强行添加未知字段，因此后台仍会清理 `<think>...</think>` / `<thinking>...</thinking>` 输出作为兜底。

## 缓存规则

### 请求日志

配置项 `settings.requestLogging` 默认关闭。开启后 background 会把每次大模型 chat 请求写入 `litBrowser.storage.local.requestLogs`，最多保留最近 50 条。

日志包含请求类型、模型配置名称、模型 ID、预设 ID、请求 URL、完整请求 body、HTTP 状态、原始响应文本、解析后的响应对象、成功状态、耗时和错误信息。

日志可能包含用户选中文本、API 返回内容等敏感信息，因此默认关闭。

### 弹框 session 缓存

同一次选区弹框内会创建一个 session：

- `selection`：选中文本
- `sentence`：选区所在句子
- `paragraph`：选区所在段落
- `cache`：当前 session 的请求缓存

缓存 key：

```text
translation:${mode}:${normalizeText(text)}
```

规则：

- 同一个 `mode + text` 只能发送一次请求。
- `mode + text` 归一化后不区分大小写。
- pending 请求返回前，重复切换只展示“翻译中...”。
- 请求返回后，只在当前仍查看同一模式和文本时刷新 UI。
- 快速切换划词、句子或段落时，旧请求返回只更新缓存，不刷新当前 UI。
- 已完成结果直接复用。
- 句子/段落结果只在用户显式请求后进入缓存；划词不会主动升级为句子或段落请求。
- 对照翻译的一一高亮能力暂时隐藏；划词不再依赖父级 alignment 截取复用。
- 不使用全局 busy 阻止划词、句子、段落切换。

### 单词缓存

单词查询有两层缓存：

- `state.wordCache`：当前页面内存缓存
- `litBrowser.storage.local.recentResults`：最近 100 条历史
- `state.activeWordKey`：当前弹框正在展示的单词 key

重复查询同一个单词时，优先顺序：

1. 内存缓存
2. 当前 session 缓存
3. 最近历史
4. 后台模型请求

规则：

- 快速选择不同单词时，旧单词请求返回只写入缓存，不覆盖当前词典区。
- 弹框工具条输入单词回车后，必须切换到 `selection` 页面并触发划词翻译和词典查询。
- 单词历史左右箭头只浏览 `recentResults` 中 `type === "word"` 的记录。

### 最近历史

`litBrowser.storage.local.recentResults` 保留最近 100 条：

- 普通翻译：`mode/source/result`
- 单词查询：完整 `wordInfo` JSON

新增历史时，同一单词或同一 `mode + source` 应覆盖旧记录并移动到最新位置。

## 选区粒度规则

用户选中文本后默认展示页面按以下规则判断：

1. 单个英文单词，或 1-6 个连续中文汉字：进入 `selection` 划词页面。
2. 短语或单句：进入 `sentence` 句子页面。
3. 多句、包含换行或完整段落：进入 `paragraph` 段落页面。

工具条单词输入框查询不走上述自动判断，始终切到 `selection` 页面。
英文词典信息只对英文单词触发；中文词级选区只做划词翻译，不触发英文词典查询。

## 翻译方向

默认模式为 `auto-zh-en`，后台在每次翻译请求中本地判断原文语言，不额外调用模型：

- 中文字符占中文加英文字符总数 30% 及以上时，目标语言为 `English`。
- 否则目标语言为配置项 `targetLanguage`，配置页展示为“译文语言”，默认 `简体中文`。

手动模式为 `manual`：

- `sourceLanguage` 作为原文语言提示传给模型。
- `targetLanguage` 作为译文语言传给模型。

划词、句子、段落和输入框翻译都走同一判断逻辑。content 端翻译缓存 key 必须包含 `translationMode/sourceLanguage/targetLanguage`，避免切换方向后复用旧译文。

## 模型调用规范

### OpenAI Chat 模型

默认使用：

```json
{
  "model": "...",
  "temperature": 0.2,
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ]
}
```

请求头必须包含：

```text
Content-Type: application/json; charset=utf-8
```

### `hy-mt*` 模型

`hy-mt*` 模型使用单条 user message。不要发送 system message，否则部分模型会把 system prompt 当作输出。

判断规则：

```js
/^hy[-_]?mt/i
```

### fallback

调用顺序：

1. 当前启用模型
2. 当前启用模型失败后，其他配置按 `priority` 升序
3. `priority` 相同的其他配置按配置列表顺序

所有模型都失败时，错误信息需要包含每个模型的失败原因。

## 翻译结果规范

普通 OpenAI Chat 模型当前只要求返回纯译文文本，不再要求返回 `alignments`。

对照翻译的一一高亮能力暂时隐藏，后续完善时再恢复 span alignment 的模型提示、解析、渲染和父级结果截取复用逻辑。

## 词典 JSON 规范

后台提示模型返回以下结构：

```json
{
  "word": "string",
  "phoneticUS": "string",
  "phoneticUK": "string",
  "partsOfSpeech": [{ "pos": "string", "meaning": "string" }],
  "inflections": ["string"],
  "definitionsZh": ["string"],
  "definitionsEn": ["string"],
  "webDefinitions": ["string"],
  "synonyms": ["string"],
  "antonyms": ["string"],
  "examples": [
    { "en": "string", "zh": "string" }
  ]
}
```

处理流程：

1. 去除 markdown code fence
2. 使用 `jsonrepair` 修复 JSON
3. `JSON.parse`
4. 格式化为稳定结构
5. 保留完整 `raw`

不要再添加手写 JSON 字段兜底解析器。若模型输出质量不稳定，应优先调整 prompt 或替换通用 JSON 修复库。

## UI 规范

### 翻译弹框

弹框结构：

- 顶部工具条：划词、句子、段落、关闭按钮
- 内容区：原文/译文
- 单词区：音标、释义、示例、同义词、反义词

规则：

- 关闭按钮与模式按钮同行。
- 顶部空白区域可拖拽。
- 点击按钮不得触发拖拽。
- 鼠标移出弹框自动关闭。
- 弹框必须保持在视口内。
- 有滚动条时，滚动区域必须完整可见。
- 不显示“本地翻译”“划词翻译”这类重复提示。

词典展示顺序：

1. 音标
2. 中文释义
3. 英文释义
4. 经典示例
5. 同义词
6. 反义词

### 配置页

配置页应保持工具型 UI：

- 左侧模型列表
- 右侧配置表单
- 分组卡片
- 清晰的保存和测试状态
- 不做营销式落地页

配置规则：

- 配置名称由模型名称自动生成，不允许在右侧表单手动编辑。
- 模型名称重复时追加序号，例如 `qwen-plus 2`。
- 新增、复制、预设切换、已部署模型选择都必须保持名称去重。
- 只有点击左侧“设为当前”才切换当前启用模型；保存和测试不得隐式切换。
- 模型接口字段顺序为：接口地址/接口路径、鉴权方式/API Key、已部署模型/模型发现。
- 优先级仅允许 P1/P2/P3；同优先级 fallback 按左侧列表顺序。

## 代码风格

- 不引入构建系统，除非确有必要。
- vendor 文件放在 `src/vendor/`。
- 第三方库必须同时保留 license 文件。
- 不在 content script 中直接请求模型。
- 不在 options 页面中实现业务请求逻辑。
- 保持 MV3 service worker 兼容。
- 避免全局状态阻塞独立交互。
- DOM 文本写入默认使用 `textContent`；需要 HTML 时必须先转义。

## 验证流程

每次修改后运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-and-reload.ps1 -ExtensionId dgfhgmhacideeomhcboddapiidofbglh
```

通过条件：

```text
Validation passed.
Extension reload requested for ...
```

如果刷新失败且提示找不到扩展目标，先打开配置页唤醒扩展：

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/new?chrome-extension://dgfhgmhacideeomhcboddapiidofbglh/src/options.html" -Method Put
```

然后重新运行验证脚本。

## 手工回归清单

修改前端交互后至少检查：

- 单词选区默认进入划词页面
- 短语或单句选区默认进入句子页面
- 多句或整段选区默认进入段落页面
- 划词、句子、段落可立即切换
- 切换 pending 请求不重复发送
- 请求返回不覆盖当前模式
- 快速切换不同单词时，旧词典请求不覆盖当前单词
- 弹框输入单词回车后切到划词页面
- 单词历史左右箭头可浏览历史查询
- 单词重复查询走缓存
- 弹框可拖动
- 鼠标移出弹框关闭
- 弹框在窗口边缘仍完整可见
- 配置页可保存、测试模型、获取模型列表
- 配置名称随模型名自动更新，重名追加序号
- 保存和测试不会切换当前启用模型

修改模型调用后至少检查：

- LM Studio
- `hy-mt*`
- fallback 优先级
- 模型超时
- 词典 JSON 修复

## Git 分支规范

本项目固定使用两个长期分支：

- `main`：发布分支，只保留 GitHub 项目和扩展运行所需的必要文件。
- `dev`：日常开发分支，所有开发、修复、文档更新都先提交到此分支。

禁止直接在 `main` 上做日常开发提交。若当前不在 `dev`，先执行：

```powershell
git checkout dev
```

### main 必要文件范围

`main` 只同步以下路径：

```text
.gitignore
README.md
manifest.json
docs/
scripts/
src/
```

不得将以下内容提交到 `main`：

```text
.chrome-dev-profile/
/vendor/
node_modules/
dist/
build/
*.log
*.tmp
*.bak
```

其中 `src/vendor/` 是扩展运行依赖目录，属于必要文件，必须保留。

### dev 到 main 的同步流程

每次在 `dev` 完成提交后，使用同步脚本把必要文件同步到 `main`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\sync-dev-to-main.ps1
```

如果远程仓库已配置且 GitHub 认证可用，可同时推送：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\sync-dev-to-main.ps1 -Push
```

脚本行为：

1. 要求当前分支必须是 `dev`。
2. 要求工作区必须干净。
3. 切换到 `main`。
4. 只从 `dev` 同步必要文件范围。
5. 如有变更，自动提交到 `main`。
6. 返回 `dev`。
7. 使用 `-Push` 时推送 `dev` 和 `main`。

后续所有 Git 操作必须遵守：

1. 先在 `dev` 开发和提交。
2. 再同步必要文件到 `main`。
3. 推送时同时推送 `dev` 和 `main`。
4. 发布版本时在 `main` 上打 tag。
