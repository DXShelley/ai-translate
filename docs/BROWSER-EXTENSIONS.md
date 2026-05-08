# 浏览器扩展安装说明

## 包文件

| 文件 | 浏览器 | 清单版本 |
|------|--------|----------|
| `AI-Translate-chrome.zip` | Chrome | MV3 |
| `AI-Translate-firefox.zip` | Firefox | MV2 |
| `AI-Translate-edge.zip` | Edge | MV3 |

## 安装步骤

### Chrome / Edge

1. 解压 zip 文件到任意目录
2. 打开扩展管理页面
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. 开启右上角「开发者模式」
4. 点击「加载已解压扩展程序」
5. 选择解压后的文件夹

### Firefox

#### 方法一：临时加载（推荐测试用）

1. 解压 zip 文件到任意目录
2. 打开 `about:addons`
3. 点击右上角齿轮图标 → 「安装附加组件...」
4. 选择解压后的文件夹

#### 方法二：固定安装

1. 解压 zip 文件到任意目录
2. 在 `about:config` 中将 `xpinstall.signatures.required` 设为 `false`
3. 将解压后的文件夹拖拽到 `about:addons` 页面

#### 已知问题：签名验证

Firefox 默认要求扩展签名。如果安装时提示「压缩包似乎已损坏」：

1. 检查 zip 文件完整性（重新下载/解压）
2. 确认使用了 Firefox 支持的格式（MV2）
3. 临时加载不需要签名，可尝试方法一

## 常见问题

### Edge: 无法加载图标

**错误**: `Couldn't load icon icons/icon16.png specified in icons`

**原因**: 图标文件名与 manifest.json 配置不一致。文件名必须是 `icon16.png`、`icon48.png`、`icon128.png`。

**解决**: 重命名图标文件或更新 manifest.json 使其一致。

### Firefox: 提示「似乎已损坏」

可能原因：
1. zip 文件传输损坏 → 重新下载/解压
2. 图标文件名不匹配 → manifest 中配置 `icon16.png` 但文件名为 `16.png`
3. Firefox 签名验证 → 使用临时加载模式
4. manifest.json 格式错误 → 检查清单文件语法

**排查步骤**：
1. 用 Windows 资源管理器解压 zip，确认图标文件存在
2. 检查 `icons/` 目录下的文件名为 `icon16.png`、`icon48.png`、`icon128.png`
3. manifest.json 中 icons 配置应与实际文件名一致
4. 验证 zip 文件：`python -c "import zipfile; z=zipfile.ZipFile('AI-Translate-firefox.zip'); print(z.testzip())"`

**创建 zip 的正确方法**（确保兼容性）：
```python
import zipfile, os

# CRITICAL: manifest.json must be first in the ZIP for Firefox
files = []
for root, dirs, filenames in os.walk('packages/firefox'):
    for filename in filenames:
        file_path = os.path.join(root, filename)
        arcname = os.path.relpath(file_path, 'packages/firefox')
        files.append((file_path, arcname))

# Sort with manifest.json FIRST
files.sort(key=lambda x: (0 if x[1] == 'manifest.json' else 1, x[1]))

with zipfile.ZipFile('out.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for file_path, arcname in files:
        zf.write(file_path, arcname)
```

### Firefox: browserApi is undefined

**错误**: `can't access property "raw", browserApi is undefined`

**原因**: `background.js` 在 `browser-adapter.js` 之前执行，或 `runtimeApi` 未就绪

**解决**: 确保 `browser-adapter.js` 正确初始化，并在 `litBrowser` 就绪前使用延迟访问。

### Chrome/Edge: Service Worker 报错

**错误**: `browserApi is undefined`

**解决**: 确保 `browser-adapter.js` 在 `background.js` 之前加载，且 runtime API 可用。

### 所有浏览器: 无法获取模型列表

1. 确认本地模型服务已启动（如 LM Studio）
2. 检查 `http://localhost:1234/v1/models` 是否可访问
3. 确认扩展已获得 `<all_urls>` 主机权限

## 技术备注

### 浏览器兼容性处理

| 浏览器 | API 前缀 | 清单版本 |
|--------|----------|----------|
| Chrome | `chrome.*` | MV3 |
| Edge | `chrome.*` | MV3 |
| Firefox | `browser.*`（兼容 `chrome.*`） | MV2 |

`browser-adapter.js` 自动检测浏览器类型并适配 API 调用。

### 文件结构

```
packages/
├── chrome/
│   ├── manifest.json      (MV3)
│   ├── background.js
│   ├── browser-adapter.js
│   ├── content.js
│   ├── content.css
│   ├── popup.html/js/css
│   ├── options.html/js/css
│   ├── vendor/jsonrepair.min.js
│   └── icons/
├── firefox/               (同结构，MV2)
└── edge/                  (同结构，MV3)
```

### Firefox MV2 特殊说明

- 使用 `browser_action` 而非 `action`
- `background.scripts` 而非 `background.service_worker`
- `persistent: false` 表示事件页面（ephemeral background page）
- MV2 WebExtensions **不需要** `install.rdf`（该文件用于旧式扩展）

### 创建 Firefox MV2 zip 的正确方法

```python
import zipfile, os

files = []
for root, dirs, filenames in os.walk('packages/firefox'):
    for filename in filenames:
        # WebExtensions MV2 不需要 install.rdf
        if filename == 'install.rdf':
            continue
        file_path = os.path.join(root, filename)
        arcname = os.path.relpath(file_path, 'packages/firefox')
        files.append((file_path, arcname))

# manifest.json 必须排在第一位
files.sort(key=lambda x: (0 if x[1] == 'manifest.json' else 1, x[1]))

with zipfile.ZipFile('out.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for file_path, arcname in files:
        zf.write(file_path, arcname)
```