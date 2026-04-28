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
- 调用 `chrome.runtime.sendMessage` 请求后台

内容脚本不得直接请求模型接口。

### `src/background.js`

负责扩展后台能力：

- 读取 `chrome.storage.sync` 模型配置
- 处理右键菜单和快捷键消息
- 调用 OpenAI 兼容接口
- 模型优先级 fallback
- `hy-mt*` 模型兼容提示格式
- 词典 JSON 修复和格式化
- 模型列表获取

模型请求、鉴权、超时、错误归一化必须集中在 background 中处理。

### `src/options.*`

负责配置页：

- 多模型配置
- 当前启用模型
- 优先级
- 接口预设
- 模型发现
- 翻译参数
- 前端交互设置

配置页只保存配置，不承担翻译业务逻辑。

## 缓存规则

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
- pending 请求返回前，重复切换只展示“翻译中...”。
- 请求返回后，只在当前仍查看同一模式和文本时刷新 UI。
- 已完成结果直接复用。
- 不使用全局 busy 阻止划词、句子、段落切换。

### 单词缓存

单词查询有两层缓存：

- `state.wordCache`：当前页面内存缓存
- `chrome.storage.local.recentResults`：最近 100 条历史

重复查询同一个单词时，优先顺序：

1. 内存缓存
2. 当前 session 缓存
3. 最近历史
4. 后台模型请求

### 最近历史

`chrome.storage.local.recentResults` 保留最近 100 条：

- 普通翻译：`mode/source/result`
- 单词查询：完整 `wordInfo` JSON

新增历史时，同一单词或同一 `mode + source` 应覆盖旧记录并移动到最新位置。

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
2. 其他配置按 `priority` 升序

所有模型都失败时，错误信息需要包含每个模型的失败原因。

## 词典 JSON 规范

后台提示模型返回以下结构：

```json
{
  "word": "string",
  "phoneticUS": "string",
  "phoneticUK": "string",
  "definitionsZh": ["string"],
  "definitionsEn": ["string"],
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

- 选中文本后默认划词翻译
- 划词、句子、段落可立即切换
- 切换 pending 请求不重复发送
- 请求返回不覆盖当前模式
- 单词重复查询走缓存
- 弹框可拖动
- 鼠标移出弹框关闭
- 弹框在窗口边缘仍完整可见
- 配置页可保存、测试模型、获取模型列表

修改模型调用后至少检查：

- LM Studio
- `hy-mt*`
- fallback 优先级
- 模型超时
- 词典 JSON 修复
