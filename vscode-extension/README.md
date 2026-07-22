# AI Translate Hover for VS Code

当前发布版本：`v7.0.1`。本项目同时维护浏览器扩展与 VS Code 扩展；浏览器构建说明见 [`docs/BROWSER-EXTENSIONS.md`](../docs/BROWSER-EXTENSIONS.md)。

选中一个英文单词或连续中文词语，将鼠标停在选区上超过一秒，会显示翻译悬浮框。

## 使用背景

本扩展主要用于在 VS Code 中阅读 Skill 文档。高质量 Skill 往往以英文编写，对中文用户的快速阅读和理解不够友好；因此扩展通过选词悬停提供词典释义、英美发音和翻译辅助，尽量不打断文档阅读流程。

## 安装

在 VS Code Extensions 中搜索 `AI Translate Hover` 并安装。也可从 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=DxShelley.ai-translate-hover) 安装。

离线安装时，在 VS Code 中打开 Extensions，点击右上角 `...`，选择 `Install from VSIX...`，然后选择生成的 `.vsix` 文件。

## 支持

使用问题、功能建议和服务支持请访问 [项目功能说明与支持页](https://dxshelley.github.io/ai-translate/#support)，也可通过 [GitHub Issues](https://github.com/DXShelley/ai-translate/issues/new/choose) 反馈；独立支持服务仅作为备用入口。

## 兼容性

- 最低 VS Code 版本：`1.85.0`
- 支持范围：`>= 1.85.0` 且 `< 2.0.0`
- 扩展依赖 VS Code 内置的现代 Node.js 运行时，用于 `fetch` 和请求超时控制。

## 配置

打开 VS Code Settings，搜索 `AI Translate Hover`。默认优先调用内置有道移动翻译与词典；下列 OpenAI 兼容接口配置仅在内置服务不可用时作为回退：

```json
{
  "aiTranslateHover.baseUrl": "http://localhost:1234/v1",
  "aiTranslateHover.endpointPath": "/chat/completions",
  "aiTranslateHover.model": "local-model",
  "aiTranslateHover.apiKey": ""
}
```

内置有道移动翻译和词典默认启用，无需 API Key；启用时，选中的文本会发送给有道翻译服务以获取翻译结果。英文选词的悬浮框会显示英美音标、英美发音操作和中英文释义。首次点击发音会创建播放器面板；之后该面板会复用并在切换单词时更新到最新音频，不会自动抢占焦点、显示或改变用户设置的面板状态；不会打开外部浏览器或展示音频链接。词典接口不可用时，扩展会将选中文本发送给配置的 OpenAI 兼容 API。中文选词会翻译为 English，其他语言默认翻译为简体中文。

扩展激活时会自动将 `https://dict.youdao.com` 添加到 VS Code 全局 `workbench.trustedDomains`，发音链接不再弹出外部网站确认。该行为默认启用，可通过 `aiTranslateHover.trustPronunciationDomainOnActivate` 关闭。

在 Settings 中搜索 `AI Translate Hover: Trigger Mode`，可选择翻译触发方式：`hover`（默认）、`keyboard` 或 `hoverAndKeyboard`。扩展不预设快捷键；在 VS Code 的 Keyboard Shortcuts 中为 `AI Translate: Translate Selection` 按个人习惯绑定即可。快捷键会打开与鼠标悬停相同的词典弹框。仅在 `keyboard` 或 `hoverAndKeyboard` 模式下，该命令才可由快捷键或命令面板触发。

在 `keyboard` 或 `hoverAndKeyboard` 模式下，也可通过 Command Palette 运行 `AI Translate: Translate Selection` 打开当前选词的词典弹框。
运行 `AI Translate: Open Settings` 可直接打开扩展配置。

`aiTranslateHover.hoverDelayMs` 最小值为 1000；VS Code 自身的 Hover 延迟会叠加在此前。

## 外部单词本

设置 `aiTranslateHover.vocabularyEnabled` 为 `true` 并填写 `aiTranslateHover.vocabularyUrl` 后，英文词典查询会提交给外部单词本 API。`vocabularyAutoSave` 默认开启：顺序的每次查询成功都会异步收藏一次，即使词典结果来自本地缓存；同一词条尚未完成的保存会合并。请求失败不会影响弹框显示。关闭自动收藏后，英文词典弹框会显示“收藏”按钮。

默认配置与最新单词本接口一致：`POST http://127.0.0.1:3000/api/v1/words`，使用 Bearer Token 和 JSON 请求体。填写 `aiTranslateHover.vocabularyAuthCredential` 后，请求等价于：

```json
{
  "headword": "retain",
  "phoneticUs": "/rɪˈteɪn/",
  "phoneticUk": "/rɪˈteɪn/",
  "definitionZh": "保留；保持",
  "definitionEn": "to keep something"
}
```

支持 `http` / `https` 端点与 `POST` / `GET`。POST 使用 JSON 请求体；GET 自动将请求参数 JSON 的一级字段转为查询参数。默认变量为 `{{headword}}`、`{{phoneticUs}}`、`{{phoneticUk}}`、`{{definitionZh}}`、`{{definitionEn}}`，可映射到其他单词本的字段名。认证支持 Bearer、Basic 或无认证；自定义认证和特殊请求头通过 `aiTranslateHover.vocabularyCustomHeaders` 的 JSON 对象配置。每次实际写入会自动添加 `Idempotency-Key`；如自定义头中已有同名字段，扩展不会覆盖它。
