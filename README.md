# AI Translate

AI Translate is a suite of browser, VS Code, and Obsidian plugins for dictionary lookup and selected-text translation. The Obsidian plugin also supports optional external vocabulary API integration.

一个浏览器扩展原型，用于在网页中进行本地或 OpenAI 兼容模型翻译。扩展重点支持划词、句子、段落三种粒度，并在同一弹框内复用上下文和已返回结果，减少重复请求。

项目包含两类插件：浏览器扩展与 VS Code 扩展。浏览器扩展提供网页划词、句子和段落翻译；VS Code 扩展面向中文用户阅读英文 Skill 文档，提供选词悬停词典和翻译辅助。

`v7.0.1` 发布产物：

- 浏览器：`AI-Translate-chrome.zip`、`AI-Translate-edge.zip`、`AI-Translate-firefox.zip`
- VS Code：[vscode-extension/](vscode-extension/README.md) 构建生成 `dist/ai-translate-hover-7.0.1.vsix`，可通过 `Install from VSIX...` 安装。

VS Code 扩展最低兼容版本为 `1.85.0`，完整兼容性说明见 [`vscode-extension/README.md`](vscode-extension/README.md)。

## 发布构建

所有插件必须保持相同的主版本号。全平台发布构建 Chrome、Edge、Firefox、VS Code 与 Obsidian：

```sh
npm run release:all
```

浏览器和 VS Code 产物写入 `dist/release/all/<version>/`，GitHub Release 使用 `v<version>` 标签；Obsidian 产物同时写入 `dist/release/obsidian/<version>/`，需要创建单独的无 `v` 前缀 Release。

Obsidian 可独立发布：

```sh
npm run release:obsidian
```

产物写入 `dist/release/obsidian/<version>/`。该 GitHub Release 标签必须使用 `<version>`，不能带 `v` 前缀，并且只上传 `main.js`、`manifest.json`、`styles.css`。Obsidian 的补丁版本可独立递增，但主版本号必须与其他插件一致。

VS Code 扩展主要面向中文用户阅读英文 Skill 文档的场景，提供选词悬停词典和翻译辅助。

## 本项目支持

如果本项目对你有帮助，欢迎通过[项目支持页](https://macosx.kooldns.cn/support/ai-translate/)支持后续维护与迭代。

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

浏览器扩展、VS Code 和 Obsidian 插件只负责把查询到的英文单词信息提交给外部应用，不保存或管理单词本数据。该功能默认关闭；启用后，默认会在英文单词查询成功后异步自动收藏。顺序的每次英文单词查询都会提交一次，即使词典信息命中本地缓存；同一词条尚未完成的并发保存会合并为一次，以避免重复写入。中文输入走翻译；其他非英文输入不会请求词典或单词本。

关闭“查询后自动收藏”后，网页弹框、浏览器扩展工具栏和 VS Code 悬停弹框的英文单词查询结果都会显示“收藏”按钮，供用户手动提交；启用自动收藏时不显示该按钮。浏览器端成功后显示“已收藏”，失败后可点击“重试收藏”；VS Code 端通过命令执行并显示结果通知。手动提交始终使用用户的原始英文查询。

单词本配置项如下：

- API 地址：默认 `http://127.0.0.1:3000/api/v1/words`。
- 请求方法：`POST` 或 `GET`。POST 发送 JSON；GET 将同一字段编码为查询参数。
- 认证凭据：可选；认证方式支持 Bearer、Basic 或无认证。自定义认证头在“自定义请求头（JSON）”中填写。
- 请求参数（JSON）：默认使用 `headword`、`phoneticUs`、`phoneticUk`、`definitionZh`、`definitionEn`；可将这五个变量映射到其他单词本应用的字段名。
- 幂等请求：每次实际写入默认添加 `Idempotency-Key`；若自定义请求头已设置同名字段，插件会保留用户提供的值。单词本服务应将唯一或主键约束冲突返回为 `409 Conflict`。

默认 `POST` 请求体：

```json
{
  "headword": "{{headword}}",
  "phoneticUs": "{{phoneticUs}}",
  "phoneticUk": "{{phoneticUk}}",
  "definitionZh": "{{definitionZh}}",
  "definitionEn": "{{definitionEn}}"
}
```

### Edge 配置示例

在 Edge 的 `edge://extensions` 打开 AI Translate 的“扩展选项”，进入“全局设置”中的单词本区域。更新插件后先点击“重新加载”，使配置页与后台脚本使用同一版本。

**Word Book POST**

1. 启用“单词本适配”，请求方法选择 `POST（JSON 请求体）`。
2. API 地址填写 `http://127.0.0.1:3000/api/v1/words`。
3. 请求参数保持默认五字段 JSON。
4. 认证方式选择 `Bearer Token`，认证凭据填写服务的 API Key。
5. 自定义请求头保持 `{}`，保存配置。

插件会发送 `Content-Type: application/json`、`Authorization: Bearer <认证凭据>`，以及上方默认 JSON 请求体。

**其他单词本 GET**

1. 请求方法选择 `GET（查询参数）`，填写目标应用的 `http` 或 `https` API 地址。
2. 在请求参数 JSON 中映射目标字段名，例如：

```json
{
  "word": "{{headword}}",
  "usIpa": "{{phoneticUs}}",
  "ukIpa": "{{phoneticUk}}",
  "translation": "{{definitionZh}}",
  "definition": "{{definitionEn}}"
}
```

3. Bearer 或 Basic 认证时选择对应方式并填写认证凭据；自定义认证头时选择“无认证”，再在“自定义请求头（JSON）”中填写，例如：

```json
{
  "X-API-Key": "your-key"
}
```

GET 会将上述 JSON 的一级字段自动编码为查询参数。

单词本请求在词典结果已展示后独立执行。请求失败不会影响查词、发音或翻译。浏览器端可开启“请求日志”，在配置页日志面板检查 URL、请求头、请求体、响应、HTTP 状态、耗时和错误；无效请求头或 GET 模板也会写入错误日志。`Authorization`、API Key、Token、Secret 等请求头字段在日志中会显示为 `***`。VS Code 端的单词本设置位于独立的 `AI Translate Hover: Vocabulary` 设置组。

## 使用方式

1. 在网页中选中文本。
2. 弹框会按选区粒度自动展示划词、句子或段落页面。
3. 可点击“划词”“句子”或“段落”切换翻译粒度。
4. 同一弹框内切换不会重复发送已有请求。
5. 拖动弹框顶部空白区域可移动弹框。
6. 鼠标移出弹框后自动关闭。
7. 按住 Ctrl 并悬停段落可触发段落翻译。
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
