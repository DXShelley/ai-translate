# Firefox 与 Edge 商店提交文案

本文档保存 Firefox Add-ons 和 Microsoft Edge Add-ons 每次提交时需要填写的商店文案。除发行说明和 Firefox 审核备注中的版本信息外，其余内容通常无需修改。

## 发布前替换项

每次提交前，将以下占位符替换为当前发布信息：

| 占位符 | 填写内容 |
| --- | --- |
| `[VERSION]` | 扩展版本号，例如 `6.0.1` |
| `[COMMIT]` | 对应发布提交的完整 Git commit SHA |
| `[CHANGES]` | 本次面向用户的新增、修复或优化，避免填写内部重构细节 |

提交前构建并上传对应商店包：

```sh
npm ci
npm run build
```

- Firefox：`AI-Translate-firefox.zip`
- Edge：`AI-Translate-edge.zip`

## Firefox Add-ons

### 概述

```text
AI Translate：划词即译，读网页不断流。支持单词、句子与段落翻译，兼顾词典查询、发音和多模型配置。
```

### 描述

```text
AI Translate 是一款面向网页阅读场景的翻译与查词扩展。选中单词、句子或段落，即可在当前页面查看翻译结果，无需频繁切换标签页或复制粘贴。

核心功能
• 划词翻译：支持英文单词、句子和段落的快速翻译。
• 词典查询：英文单词可查看音标、释义、例句、同义词与反义词，并支持英式/美式发音。
• 阅读不中断：翻译结果在页面内呈现，帮助你保持阅读上下文与注意力。
• 灵活模型配置：兼容 OpenAI API 格式，可连接本地或自建的兼容服务；支持多个模型配置与优先级 fallback。
• 翻译历史：最近的翻译与查词记录保存在扩展本地存储中，便于回顾。
• 外部单词本：可选连接自有单词本 API，支持查询后自动收藏或手动收藏英文单词。该功能默认关闭。
• 快捷操作：支持右键菜单和 Alt+T 快捷键翻译当前选中文本。

隐私说明
扩展不收集用户数据。翻译、词典或单词本请求仅会发送至用户自行配置或主动使用的服务端点；外部单词本功能默认关闭。
```

### 发行说明

```text
版本 [VERSION]

[CHANGES]
```

当本次发布包含外部单词本功能时，使用以下已验证文案：

```text
新增通用外部单词本适配功能。

- 可在设置中启用或关闭，仅对英文单词生效。
- 支持查词后自动收藏，也支持在查词结果中手动收藏。
- 支持配置外部 API 地址、GET/POST 请求、JSON 请求头、请求参数模板，以及 Bearer/Basic 认证。
- 单词本请求独立执行，外部接口异常不会影响翻译、查词或发音。
- 请求日志新增单词本请求记录，并会对认证信息脱敏显示。
```

### 给审核员的备注

```text
This add-on is built from the public source code:
https://github.com/DXShelley/ai-translate

Build instructions:
1. Install Node.js (tested with a current LTS version) and Python 3.
2. Clone the repository and check out commit [COMMIT].
3. Run: npm ci
4. Run: npm run build
5. Submit the generated AI-Translate-firefox.zip from the repository root.

The build script generates browser-specific packages under packages/ and produces AI-Translate-firefox.zip. The add-on is a Manifest V2 extension. It has no data collection; user-configured translation and optional vocabulary API requests are sent only to endpoints chosen by the user.
```

## Microsoft Edge Add-ons

### 简短说明

```text
划词即译的网页翻译与查词工具，支持单词、句子和段落翻译、词典发音及 OpenAI 兼容模型。
```

### 详细说明

复用 Firefox 的“描述”内容。两家商店的功能、隐私声明和适用场景相同，因此不维护两套容易漂移的长文案。

### 发行说明

```text
版本 [VERSION]

[CHANGES]
```

Edge 发行说明与 Firefox 保持相同；使用 Firefox 的“发行说明”模板或相应功能的已验证文案。

## 提交检查

- 版本号与 `package.json`、`packages/firefox/manifest.json`、`packages/edge/manifest.json` 一致。
- 发行说明只陈述已交付、用户可感知的变化。
- Firefox 审核备注中的 `[COMMIT]` 已替换为本次发布提交的完整 SHA。
- 上传的 zip 为本次 `npm run build` 生成的对应浏览器包。
