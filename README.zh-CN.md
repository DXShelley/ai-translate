# AI Translate

AI Translate 是面向浏览器、VS Code 和 Obsidian 的查词与划词翻译工具集。各插件使用符合所在平台习惯的交互方式，并支持可选的外部单词本保存。

[English](README.md) · [文档索引](docs/README.md) · [架构说明](docs/ARCHITECTURE.md) · [GitHub Releases](https://github.com/DXShelley/ai-translate/releases)

## 平台与入口

| 平台 | 主要用途 | 详细文档 |
| --- | --- | --- |
| Chrome | 网页单词、句子和段落划词翻译 | [浏览器扩展指南](docs/BROWSER-EXTENSIONS.md) |
| Edge | 与 Chrome 相同的翻译流程及 Edge 兼容支持 | [浏览器扩展指南](docs/BROWSER-EXTENSIONS.md) |
| Firefox | 基于 Manifest V2 的网页翻译与查词 | [浏览器扩展指南](docs/BROWSER-EXTENSIONS.md) |
| VS Code | 阅读英文 Skill 文档时的悬停词典与翻译 | [VS Code 扩展说明](vscode-extension/README.md) |
| Obsidian | 笔记中的选词查词、翻译和单词本保存 | [Obsidian 插件说明](obsidian-plugin/README.zh-CN.md) |

## 功能概览

- 浏览器中支持单词、句子、段落的划词翻译，以及词典释义、音标和发音。
- VS Code 选词悬停或命令触发查词，优先使用内置有道服务并支持 OpenAI 兼容接口回退。
- Obsidian 支持编辑器选区查词、命令面板输入和社区插件安装。
- 外部单词本默认关闭；启用后可自动或手动保存英文词典查询结果。

## 安装

### 浏览器扩展

1. 从 [GitHub Releases](https://github.com/DXShelley/ai-translate/releases) 下载匹配浏览器的 ZIP。
2. 解压 ZIP，在浏览器扩展管理页启用开发者模式后加载解压目录。
3. 商店可用时，优先从官方商店安装。

完整安装、兼容性和故障排查见 [浏览器扩展指南](docs/BROWSER-EXTENSIONS.md)。

### VS Code

从 Releases 下载 `.vsix` 文件，在扩展视图选择 **Install from VSIX...** 安装。配置与命令说明见 [VS Code 扩展说明](vscode-extension/README.md)。

### Obsidian

社区插件上架后，可在 **Settings > Community plugins** 搜索 **AI Translate** 安装。手动安装时，下载与插件版本同 tag 的 `main.js`、`manifest.json`、`styles.css`，复制到：

```text
<vault>/.obsidian/plugins/ai-translate/
```

Obsidian 的 Release tag 不带 `v` 前缀。详细步骤见 [Obsidian 插件说明](obsidian-plugin/README.zh-CN.md)。

## 配置与隐私

- 内置有道服务可用于词典和翻译；不可用时，各平台可配置 OpenAI 兼容服务。
- 单词本只会在显式启用并配置后发送数据，支持 `POST` / `GET`、Bearer / Basic 认证、自定义请求头和字段模板。
- 请求日志默认关闭；开启后可能保存选中文本或服务响应，请按所配置服务的隐私政策评估风险。

外部单词本协议、代码边界与数据流见 [架构说明](docs/ARCHITECTURE.md)。

## 开发与发布

```sh
npm ci
npm --prefix obsidian-plugin ci
npm --prefix vscode-extension ci
```

- 浏览器构建：`npm run build`
- 全平台发布构建：`npm run release:all -- --tag <version>`

可分发文件统一写入 `dist/<version>/`；浏览器 ZIP、VS Code VSIX、Obsidian 三文件和 Obsidian ZIP 均处于同一版本目录且不进入 Git。所有 GitHub Release tag 使用无 `v` 前缀的精确版本号。各插件使用仓库内已定稿的静态图标文件，浏览器构建不再生成或转换图标。

开发约束见 [开发规范](docs/DEVELOPMENT.md)，发布与商店提交流程见 [文档索引](docs/README.md)。

## 参与和支持

- 通过 [GitHub Issues](https://github.com/DXShelley/ai-translate/issues) 提交可复现问题或功能建议。
- 通过 [GitHub Pages](https://dxshelley.github.io/ai-translate/) 查看项目说明与支持信息。
- 提交代码或文档前，请运行受影响插件的检查并补充聚焦测试。

## 许可证

本项目使用 [LICENSE](LICENSE) 中的许可证。
