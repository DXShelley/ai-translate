# 项目重要内容记录

## 2026-05-11 会话重要记录

### 发布与版本

- 当前发布版本为 `v3.0.0`。
- 发布包：
  - `AI-Translate-chrome.zip`
  - `AI-Translate-edge.zip`
  - `AI-Translate-firefox.zip`
- 构建入口：`npm run build`，实际执行 `scripts/build.js`。
- 构建脚本会生成 `packages/chrome`、`packages/edge`、`packages/firefox`，并刷新对应 zip。
- Firefox MV2 zip 必须保证 `manifest.json` 在 zip 内排第一；`install.rdf` 不进入 zip。

### 已解决的关键问题

1. Firefox 后台脚本 `importScripts is not defined`
   - 原因：Firefox MV2 background page 使用普通脚本环境，打包后的 `background.js` 不能保留 `importScripts(...)`。
   - 处理：`scripts/build.js` 打包 background 时通过 `stripBackgroundLoaders()` 去掉源文件开头的 loader。
   - 结果：三个发布包内 `background.js` 均不包含 `importScripts`。

2. Edge 发音不可用
   - Edge/Chrome manifest 增加 `tts` 权限。
   - `src/background.js` 新增 `LIT_SPEAK_TEXT` 消息，后台通过 `chrome.tts.speak()` 作为后备朗读路径。
   - `src/content.js` 优先在内容脚本中同步调用 `speechSynthesis.speak()`，以保留用户点击激活；若 1.2 秒内没有 `onstart`，再 fallback 到后台 TTS。
   - 注意：Edge 扩展更新后必须重新加载扩展，否则仍会运行旧 content script。

3. 弹框语言过滤
   - 新增设置项：`settings.popupLanguage`，默认 `all`。
   - 配置页“前端交互”新增“弹框语言”：全部语言、English、中文、日本語、한국어。
   - 设置为 `en` 后，只有主语言识别为英文的选区/段落会弹框；其他语言不弹。
   - 作用范围：划词、悬停段落、右键/快捷键消息触发。

4. 构建静态文件同步
   - `scripts/build.js` 现在会从 `src/` 同步共享的 `options.html`、`options.css`、`popup.*`、`content.css` 到各浏览器包。
   - `manifest.json` 仍保留各浏览器包自己的版本，避免覆盖 Chrome/Edge/Firefox 差异。

### Edge 商店发布素材

- Edge 插件创建/发布入口：
  - `https://partner.microsoft.com/dashboard/microsoftedge/public/login`
  - 备用入口：`https://developer.microsoft.com/microsoft-edge/extensions`
- 官方发布说明：
  - `https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension`
- Edge 上传包：`AI-Translate-edge.zip`
- Edge 商店图片资源目录：`assets/edge-store/`
  - `edge-logo-300.png`：300 x 300，扩展徽标
  - `screenshot-translation-1280x800.png`：1280 x 800
  - `screenshot-settings-1280x800.png`：1280 x 800
  - `screenshot-packages-1280x800.png`：1280 x 800
- 生成脚本：`python scripts/generate-edge-store-assets.py`

### 验证命令

```powershell
npm run build
node --check src\background.js
node --check src\content.js
node --check src\options.js
node --check scripts\build.js
python -c "import zipfile,json; files=['AI-Translate-chrome.zip','AI-Translate-edge.zip','AI-Translate-firefox.zip']; [print(f, json.loads(zipfile.ZipFile(f).read('manifest.json'))['version'], 'importScripts' in zipfile.ZipFile(f).read('background.js').decode('utf-8')) for f in files]"
python -c "from PIL import Image; from pathlib import Path; [print(p, Image.open(p).size) for p in Path('assets/edge-store').glob('*.png')]"
```

### 会话与日志清理说明

- 项目内没有发现持久化的“会话”数据文件。
- 扩展运行时的请求日志保存在浏览器扩展本地存储 `requestLogs`，可在配置页“请求日志”面板点击“清空”。
- 当前聊天平台的历史会话不在项目文件系统内，无法由仓库脚本直接删除。
- 2026-05-11 已清空本机 Codex 会话目录与索引：
  - `C:\Users\25433\.codex\sessions`
  - `C:\Users\25433\.codex\archived_sessions`
  - `C:\Users\25433\.codex\history.jsonl`
  - `C:\Users\25433\.codex\session_index.jsonl`

## 2026-05-12 会话重要记录

### 触发与弹框语言

- 划词弹框触发条件改为“选中文本 + Ctrl”，两者缺一不可。
- 支持先选中文本、再按 Ctrl 触发弹框。
- 单独选中文本不会弹框；单独按 Ctrl 不会弹框。
- 修复 `settings.popupLanguage` 刷新后不生效的问题：
  - `src/content.js` 必须先初始化 `browserApi`，再执行 `loadSettings()`。
  - 否则刷新页面时读取配置失败，会回退默认 `popupLanguage: all`。
- `popupLanguage = en` 时，中文、中文夹英文、日文和韩文内容均不触发弹框。
- 语言不匹配时必须调用 `hidePopover()`，并清空查词输入框、原文、译文、词典区域和错误状态，避免旧弹框内容残留。

### 配置页信息架构

- 配置页采用左侧菜单、右侧详情布局。
- 左侧上部为“大模型配置”列表，可新增、复制、删除、导入和导出多个模型配置。
- 左侧下部为“全局设置”菜单项。
- 右侧根据当前选择显示模型详情或全局设置详情。
- 大模型配置只放模型相关内容：
  - 接口预设
  - 接口地址
  - 接口路径
  - 鉴权方式
  - API Key
  - 模型 ID
  - 温度
  - 超时
  - 优先级
  - 提示词
  - 模型配置 JSON
- 全局设置放所有模型共享内容：
  - 翻译方向
  - 原文语言
  - 译文语言
  - 弹框语言
  - 悬停翻译
  - 悬停触发键
  - 输入框翻译
  - 请求日志
  - 触发空格次数

### 翻译参数全局化

- `translationMode`、`sourceLanguage`、`targetLanguage` 已迁移到 `settings`。
- 后台翻译必须从 `config.settings` 读取翻译方向和语言，不再从单个模型 profile 读取。
- 为兼容旧配置，读取配置时会从第一个旧 profile 合并这些字段到全局 `settings`。
- `profileTextSnapshot()` 不应把全局字段写入模型 JSON。
- `fillForm()`、`applyProfileTextToForm()` 和 `getProfileFromForm()` 应忽略模型 JSON 中的全局字段。

### 日志策略

- 请求日志最多保留最近 20 条。
- 新日志写入方式为 `[item, ...logs].slice(0, 20)`。
- 配置页前台只展示最新 10 条日志。
- 超出 20 条的旧日志自动按先进先出策略删除。

### UI 优化

- 配置页视觉层级优化：
  - 更轻的页面背景
  - 更清晰的左侧菜单和模型卡片选中态
  - 统一蓝色焦点态
  - 优化日志列表卡片状态
- 网页弹框视觉优化：
  - 工具栏深色层明确
  - 内容区保持白底
  - 原文、译文、词典区域层级更清晰
  - 查词输入框聚焦态更明确

### 验证命令

```powershell
node --check src\background.js
node --check src\content.js
node --check src\options.js
npm run build
```

## 项目概述
这是一个 Chrome 扩展程序，用于提供 AI 翻译功能。它支持多种翻译引擎，并具有灵活的配置选项。

## 主要功能
- 选中文本翻译
- 单词查询
- 模型列表管理
- 配置导入导出
- 请求日志记录
- 多种翻译引擎支持
- Edge/Chrome 单词和例句朗读
- 弹框语言过滤
- 多浏览器独立打包发布

## 核心配置选项
### 模型配置
- 支持多种预设翻译引擎（OpenAI、LM Studio、Ollama、DeepSeek、百度、腾讯等）
- 自定义 API 端点配置
- 翻译模式：自动中英互译或手动指定
- 温度、超时等参数配置
- 优先级设置
- 启用/停用状态

### 翻译配置
- 显示模式：双语对照、仅显示译文、原文折叠
- 双语布局：上下对照、左右对照
- 悬停翻译：Ctrl/Alt/Shift 键触发
- 输入翻译：按空格键触发
- 弹框语言：全部、English、中文、日本語、한국어

## 代码结构
- `src/background.js`：后台服务工作者
- `src/options.js`：选项页面逻辑
- `src/options.html`：选项页面 UI
- `src/options.css`：选项页面样式
- `src/content.js`：内容脚本
- `src/popup.html`：弹出页面
- `src/popup.js`：弹出页面逻辑

## 使用方法
1. 在 Chrome 扩展商店安装或加载开发版
2. 打开选项页面配置翻译引擎
3. 在网页上选中要翻译的文本
4. 使用快捷键 Alt+T 或右键菜单翻译

## 开发指南
1. 克隆仓库
2. 安装依赖（如果有）
3. 在 Chrome 中加载扩展程序
4. 修改代码并测试

## 常见问题
- 无法连接到翻译引擎：检查网络连接和 API 配置
- 翻译失败：检查配置参数和翻译引擎状态
- 页面无法翻译：检查扩展权限和内容脚本是否加载

## 更新日志
- 添加了 Jinja 模板模式配置
- 实现了启用/停用状态管理
- 优化了配置编辑体验
- 修复了数据一致性问题
