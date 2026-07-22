# AI Translate for Obsidian

AI Translate provides dictionary lookup, selected-text translation, and optional external vocabulary API integration for Obsidian.

在 Obsidian `1.12.4` 及以上版本的编辑器中提供单独查词、选中查词/翻译，以及与主项目一致的外部单词本适配。

## 功能

- 命令面板 `AI Translate: 查词或翻译`：输入英文单词或任意待翻译文本。
- 命令面板 `AI Translate: 查询选中文本`，以及编辑器右键菜单：对选中的英文单词显示词典，对其他文本翻译。
- 英文单词优先使用有道移动词典，展示音标、英美发音、中英文释义；服务不可用时回退到配置的 OpenAI 兼容 API。
- 支持外部单词本 `POST`/`GET`、自定义 JSON 请求头、Bearer/Basic/无认证和请求参数变量。自动收藏不会阻塞查词；关闭自动收藏后，结果窗口显示手动收藏按钮。同一词条尚未完成的保存会合并，实际写入默认附带 `Idempotency-Key`；自定义的同名请求头优先。

## 构建和安装

```bash
cd obsidian-plugin
npm install
npm run build
```

将构建出的 `main.js` 和本目录的 `manifest.json` 复制到 Vault 的 `.obsidian/plugins/ai-translate/`，然后在 Obsidian 的社区插件设置页启用 `AI Translate`。

## 单词本模板

默认 POST 请求参数：

```json
{
  "headword": "{{headword}}",
  "phoneticUs": "{{phoneticUs}}",
  "phoneticUk": "{{phoneticUk}}",
  "definitionZh": "{{definitionZh}}",
  "definitionEn": "{{definitionEn}}"
}
```

可用变量：`{{headword}}`、`{{phoneticUs}}`、`{{phoneticUk}}`、`{{definitionZh}}`、`{{definitionEn}}`。可按目标单词本的字段名改写 JSON；GET 会将一级字段转换为 URL 查询参数。自定义认证和特殊请求头在“自定义请求头（JSON）”中填写。
