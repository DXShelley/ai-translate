# AI Translate

一个浏览器扩展原型，用于在网页中进行本地或 OpenAI 兼容模型翻译。扩展重点支持划词、句子、段落三种粒度，并在同一弹框内复用上下文和已返回结果，减少重复请求。

项目包含两类插件：浏览器扩展与 VS Code 扩展。浏览器扩展提供网页划词、句子和段落翻译；VS Code 扩展面向中文用户阅读英文 Skill 文档，提供选词悬停词典和翻译辅助。

`v6.0.2` 发布产物：

- 浏览器：`AI-Translate-chrome.zip`、`AI-Translate-edge.zip`、`AI-Translate-firefox.zip`
- VS Code：[vscode-extension/](vscode-extension/README.md) 构建生成 `dist/ai-translate-hover-6.0.2.vsix`，可通过 `Install from VSIX...` 安装。

VS Code 扩展最低兼容版本为 `1.85.0`，完整兼容性说明见 [`vscode-extension/README.md`](vscode-extension/README.md)。

VS Code 扩展主要面向中文用户阅读英文 Skill 文档的场景，提供选词悬停词典和翻译辅助。

## 功能

- 划词翻译、当前句子翻译、当前段落翻译
- 默认中英双向自动翻译，也可在配置页手动指定原文语言和译文语言
- 选区按粒度自动进入对应页面：单词进入划词，短语/单句进入句子，多句或整段进入段落
- 同一弹框内划词、句子、段落可即时切换
- 同一 `mode + text` 请求只发送一次，后续切换复用缓存或 pending 结果
- 划词、句子、段落缓存和复用不区分大小写
- 快速切换选区或单词时，旧请求返回只进缓存，不覆盖当前展示
- 已有句子/段落结果只做被动复用，不会因为划词自动请求更大粒度
- 弹框工具条支持输入单词查询，自动切到划词页面，并可用左右箭头浏览历史单词
- Ctrl 悬停段落翻译，可在配置页修改触发键
- 输入框连续空格触发翻译，可在配置页关闭或调整空格次数
- 暂时隐藏对照翻译的一一高亮能力，当前只展示原文和译文文本；后续再完善 span alignment
- 英文单词词典信息：音标、美式/英式朗读、释义、例句、同义词、反义词
- 浏览器扩展和 VS Code 插件均支持通用外部单词本适配：查询后自动收藏或手动收藏，支持 GET/POST、请求头、认证和请求模板
- 最近 100 条翻译和单词查询历史保存在扩展本地存储
- 多模型配置、优先级 fallback、模型列表获取
- OpenAI 兼容 `/v1/chat/completions` 接口
- `hy-mt*` 翻译模型兼容提示格式
- 使用 `jsonrepair` 修复模型返回的非标准 JSON
- 浏览器 API 适配层，当前覆盖 Chrome、Edge、Firefox，并保留其他浏览器扩展入口

## 加载方式

1. 打开 Chrome、Edge 或 Firefox 扩展管理页。
2. 开启开发者模式。
3. 选择“加载已解压的扩展程序”。
4. 选择本项目目录：`E:\sunway\git\temp-translate`。

## 开发期自动刷新

需要先用远程调试端口启动 Chrome：

```powershell
Start-Process chrome.exe -ArgumentList "--remote-debugging-port=9222"
```

之后运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-and-reload.ps1
```

如已知扩展 ID：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-and-reload.ps1 -ExtensionId dgfhgmhacideeomhcboddapiidofbglh
```

脚本会执行：

- `node --check src\background.js`
- `node --check src\content.js`
- `node --check src\options.js`
- `node --check src\popup.js`
- `manifest.json` 解析校验
- 通过 Chrome DevTools Protocol 请求扩展刷新

## 模型配置

默认 OpenAI 兼容接口：

```text
POST http://localhost:1234/v1/chat/completions
```

请求体形态：

```json
{
  "model": "local-model",
  "temperature": 0.2,
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ]
}
```

常见后端：

- LM Studio：`http://localhost:1234/v1`
- Ollama OpenAI 兼容接口：`http://localhost:11434/v1`
- vLLM：`http://localhost:8000/v1`
- llama.cpp server：按启动参数填写
- MiniMax OpenAI 兼容接口：`https://api.minimaxi.com/v1`，接口路径 `/chat/completions`，模型 `MiniMax-M2.7` 或 `MiniMax-M2.7-highspeed`

配置页支持：

- 接口预设
- 接口地址
- 接口路径
- 已部署模型选择
- API Key
- 鉴权方式
- 翻译方向、原文语言、译文语言
- 温度
- 超时毫秒
- 优先级
- 系统提示词

配置名称自动使用模型名称，重复时追加序号，例如 `qwen-plus`、`qwen-plus 2`。

多个模型按以下顺序请求：

1. 当前启用模型
2. 当前启用模型请求失败后，其他模型按优先级升序 fallback
3. 优先级相同的模型按配置列表从上到下 fallback

所有模型失败时，错误会汇总返回。

## 外部单词本适配

浏览器扩展和 VS Code 插件只负责把查询到的英文单词信息提交给外部应用，不保存或管理单词本数据。该功能默认关闭；启用后，默认会在英文单词查询成功后异步自动收藏。每次用户查询英文单词都会发送一次收藏请求，即使词典信息命中本地缓存，以支持外部单词本统计重复查询的薄弱单词。中文输入走翻译；其他非英文输入不会请求词典或单词本。

关闭“查询后自动收藏”后，网页弹框、浏览器扩展工具栏和 VS Code 悬停弹框的英文单词查询结果都会显示“收藏”按钮，供用户手动提交；启用自动收藏时不显示该按钮。浏览器端成功后显示“已收藏”，失败后可点击“重试收藏”；VS Code 端通过命令执行并显示结果通知。手动提交始终使用用户的原始英文查询。

单词本配置项如下：

- API 地址：默认 `http://127.0.0.1:3000/api/v1/words`。
- 请求方法：`POST` 或 `GET`。
- 请求头：JSON 对象，可放置任意服务所需的自定义头。
- 认证方式：无认证、Bearer Token，或 Basic（认证凭据填写 `用户名:密码`）。也可直接在请求头中配置其他认证机制。
- 请求体 / GET 参数模板：默认支持 `{{headword}}`、`{{phoneticUs}}`、`{{phoneticUk}}`、`{{definitionZh}}`、`{{definitionEn}}`；仍兼容 `{{word}}`、`{{definition}}`、`{{phoneticUS}}`、`{{phoneticUK}}` 以及后续的通用旧变量。`GET` 模板必须是 JSON 对象，并会转换为 URL 查询参数；`POST` 模板按原文本作为请求体发送。

默认 `POST` 模板：

```json
{
  "headword": "{{headword}}",
  "phoneticUs": "{{phoneticUs}}",
  "phoneticUk": "{{phoneticUk}}",
  "definitionZh": "{{definitionZh}}",
  "definitionEn": "{{definitionEn}}"
}
```

单词本请求在词典结果已展示后独立执行。请求失败不会影响查词、发音或翻译。浏览器端可开启“请求日志”，在配置页日志面板检查 URL、请求头、请求体、响应、HTTP 状态、耗时和错误；无效请求头或 GET 模板也会写入错误日志。`Authorization`、API Key、Token、Secret 等请求头字段在日志中会显示为 `***`。VS Code 端的单词本设置位于独立的 `AI Translate Hover: Vocabulary` 设置组。

## 使用方式

1. 在网页中选中文本。
2. 弹框会按选区粒度自动展示划词、句子或段落页面。
3. 可点击“划词”“句子”或“段落”切换翻译粒度。
4. 同一弹框内切换不会重复发送已有请求。
5. 拖动弹框顶部空白区域可移动弹框。
6. 鼠标移出弹框后自动关闭。
7. 按住 Ctrl 并悬停段落可触发段落翻译。
8. 输入框连续空格可翻译并替换输入内容。
9. 右键选中文本可使用“翻译选中文本”。
10. 在弹框顶部输入英文单词并回车，可查询单词翻译和词典信息。
11. 单词输入框右侧左右箭头可浏览历史单词查询。
12. 快捷键默认 `Alt+T`。

## 文件结构

```text
manifest.json
README.md
docs/
  DEVELOPMENT.md
scripts/
  verify-and-reload.ps1
  reload-extension.ps1
src/
  background.js
  content.js
  content.css
  options.html
  options.js
  options.css
  popup.html
  popup.js
  popup.css
  vendor/
    jsonrepair.min.js
    jsonrepair-LICENSE.md
```

## 设计说明

内容脚本负责网页内选区识别、弹框展示、缓存和交互；模型请求统一由 background service worker 处理。这样可以集中管理模型配置、鉴权、fallback、超时和错误信息。

单词词典信息依赖模型返回 JSON。为降低 LLM 输出非标准 JSON 的影响，项目内置 `jsonrepair` 浏览器构建，用于修复常见 JSON 格式问题，再统一格式化为稳定字段结构。

开发规范见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 项目支持

- 项目功能说明与支持：[GitHub Pages](https://dxshelley.github.io/ai-translate/#support)
- 问题反馈：[GitHub Issues](https://github.com/DXShelley/ai-translate/issues/new/choose)
- 发布下载：[GitHub Releases](https://github.com/DXShelley/ai-translate/releases)
- 备用支持入口：[项目支持服务](https://macosx.kooldns.cn/support/ai-translate/)
- 页面会在 `main` 分支的 `website/` 或 Pages 工作流变更后自动部署。
