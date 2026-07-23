# Obsidian 发布与审查手册

本文面向 AI Translate 的维护者，记录 Obsidian 插件的发布要求、已遇到的审查问题、对应修复方案，以及每次发布必须执行的验证流程。

## 发布硬性要求

### 版本与 tag

- 根目录 `manifest.json`、`obsidian-plugin/manifest.json`、`obsidian-plugin/package.json` 和 `obsidian-plugin/package-lock.json` 的 Obsidian 插件版本必须一致，并使用 `x.y.z` 格式。
- GitHub Release tag 必须与所有插件版本完全一致，不能带 `v`。例如版本 `7.0.9` 必须使用 tag `7.0.9`，不能使用 `v7.0.9`。
- Chrome、Edge、Firefox、VS Code 和 Obsidian 的版本必须完全一致；只支持完整发布。

### 最低 Obsidian 版本

- `minAppVersion` 是实际支持承诺，不能只修改 manifest 而不验证 API。
- 根目录与 `obsidian-plugin/` 的 `obsidian` 开发依赖及 lockfile 必须精确固定到 `minAppVersion`。
- 当前最低版本为 `1.12.2`。设置页必须只使用 `PluginSettingTab.display()` 这一套字段定义。
- 不同时维护传统设置和 `1.13` 声明式设置。双实现会造成字段、默认值、可见性和敏感输入类型漂移。
- 因此，Obsidian 官方扫描在当前兼容策略下会报告一条已知 Warning：`1.13.0` 及更高版本无法通过 Settings search 搜索插件设置。这不是发布错误，也不能通过保留两套字段或动态隐藏 API 调用来规避。

### manifest

- Obsidian 社区插件扫描器只读取默认分支根目录的 `manifest.json`。该文件必须存在、可读，并与 `obsidian-plugin/manifest.json` 完全一致；主分支同步脚本也必须保留它。
- `id` 只能包含小写字母、数字和连字符。
- `name`、`description` 和 `author` 不能为空。
- `authorUrl` 必须使用 HTTPS。
- `isDesktopOnly` 必须是布尔值。
- `description` 必须以英文标点 `.`, `!` 或 `?` 结尾。官方扫描曾因描述末尾无标点给出 Warning。

### 设置与敏感信息

- Obsidian 翻译回退配置不包含 API Key，也不能向翻译请求恢复基于旧 `apiKey` 字段的 `Authorization` 请求头。
- `apiKey` 只允许出现在旧数据迁移清理逻辑和对应回归测试中。
- 外部单词本只有一个“认证凭据”字段，该字段必须使用 password input。
- JSON 请求模板和自定义请求头必须使用 textarea。
- 启用或关闭外部单词本后，设置页必须刷新并保持字段定义唯一。

### 构建产物

统一 Release 目录必须包含以下三个 Obsidian 安装文件：

```text
main.js
manifest.json
styles.css
```

- `main.js` 必须由当前 `obsidian-plugin/src/main.ts` 构建生成，不能发布过期 bundle。
- Release 中的 `manifest.json` 必须与仓库的 `obsidian-plugin/manifest.json` 一致。
- 完整 Release 同时上传浏览器 ZIP、VSIX、Obsidian 三文件和 Obsidian ZIP；Obsidian 三文件仍不得混入源码、README、source map 或 lockfile。

## 自动预检

发布校验器位于 `scripts/verify-obsidian-release.js`。检查当前元数据：

```sh
npm run verify:obsidian-release
```

同时检查计划发布的 tag：

```sh
npm run verify:obsidian-release -- --tag 7.0.9
```

生成并检查正式资产：

```sh
npm run release:all -- --tag 7.0.9
```

`release:all` 强制要求 `--tag`，会在构建前运行一次预检，并在产物复制完成后再次检查统一发布目录。任何检查失败都会以非零状态退出，不应继续创建 tag。

自动检查覆盖以下内容：

| 检查项 | 失败时阻止发布 |
| --- | --- |
| Obsidian 版本为严格 `x.y.z` | 是 |
| manifest、package 和 lockfile 版本一致 | 是 |
| manifest 必填字段与 description 标点 | 是 |
| `minAppVersion` 与两级 Obsidian 类型依赖、lockfile 一致 | 是 |
| 所有插件版本完全一致 | 是 |
| 低于 `1.13.0` 时只使用传统设置实现 | 是 |
| 已删除的翻译 API Key 未恢复到 UI 或请求 | 是 |
| tag 无 `v` 且与 manifest 版本一致 | 提供 `--tag` 时是 |
| 统一 Release 目录包含 Obsidian 三文件 | 构建后是 |
| Release manifest 与插件 manifest 一致 | 构建后是 |

回归测试位于 `test/obsidian-release-validation.test.js` 和 `test/obsidian/settings.test.js`。后者实际模拟 `1.12` 设置 API，检查设置页刷新、唯一认证凭据、password input 和 textarea。

## 官方 Obsidian 扫描

自动预检不能替代 Obsidian Community 的服务端扫描，因为官方扫描需要维护者登录态。发布前执行：

1. 将待发布提交推送到 `dev`。
2. 打开 [AI Translate plugin dashboard](https://community.obsidian.md/account/plugins/ai-translate)。
3. 使用 **Preview a branch scan** 对 `dev` 或具体 commit SHA 发起扫描。
4. 等待状态变为 `Completed`。
5. 按 commit SHA 核对结果。页面会保留历史扫描，不能只读取最上方以外的旧版本结果。
6. `Error` 必须为 0。所有 Warning 和 Recommendation 都必须逐项确认根因。

常见状态：

| 状态或响应 | 含义与处理 |
| --- | --- |
| `Pending` | 检查仍在运行，不能据此发布。 |
| `409 A scan is already in progress` | 同一个插件已有扫描任务，等待现有任务结束，不要重复提交。 |
| `Completed` | 扫描结束，仍需检查 Error、Warning、Recommendation 和 Dependencies。 |
| 历史结果与当前 SHA 不同 | 结果无效，必须定位当前待发布 commit 对应的记录。 |

当前兼容 `1.12.2` 的预期结果允许一条关于缺少 `getSettingDefinitions()` 的 Warning。其他新增 Warning 必须先分析和修复，不能因为已有一条预期 Warning 而整体忽略 Warning 列表。

## 已遇问题与修复方案

| 问题 | 根因 | 修复与防回归措施 |
| --- | --- | --- |
| `No release matches your manifest version` | manifest 版本没有同名 GitHub Release，或错误使用了 `v7.x.x` tag。 | 完整发布使用无 `v` tag；预检器用 `--tag` 检查精确匹配；workflow 传入真实 `GITHUB_REF_NAME`。 |
| Plugin description should end with punctuation | manifest description 末尾没有标点。 | description 以英文标点结束；预检器自动阻止无标点发布。 |
| 声明式设置与旧版回退设置同时存在 | 为兼容旧版保留 `display()`，又为 1.13 增加 `getSettingDefinitions()`，形成两套字段。 | 支持 `1.12.2` 时只保留 `display()`；源码预检和设置测试禁止双实现。 |
| 官方提示设置无法在 1.13 Settings search 中搜索 | 为支持 `1.12.2`，不能依赖 1.13 声明式设置 API。 | 接受并记录这一条兼容性 Warning；不要通过动态属性、字符串拼接或两套设置绕过扫描。 |
| 旧翻译 API Key 被重新加入设置或请求 | 将外部单词本认证凭据误认为翻译服务 API Key，或从旧配置回归。 | 翻译回退不再提供 API Key；迁移时删除旧 `apiKey`；请求测试断言不发送 Authorization；预检扫描明显 UI/请求回归。 |
| 认证凭据显示为普通文本 | 声明式与传统设置渲染器不一致，或 helper 默认使用 text input。 | 只保留一套设置实现；行为测试断言唯一“认证凭据”的 `inputEl.type` 为 `password`。 |
| JSON 设置变成单行输入 | 传统回退 helper 只给 input 添加 CSS class，没有创建 textarea。 | 使用 `Setting.addTextArea()`；行为测试断言存在两个 textarea。 |
| `Unsafe call of an error or any typed value` | catch 值或动态返回值以 `any` 直接调用。 | catch 参数保持 `unknown`，通过类型守卫或 `toErrorMessage()` 处理；TypeScript 检查必须通过。 |
| 事件处理器返回音频 Promise | `click` 回调直接返回 `Audio.play().catch(...)`，不符合事件回调预期并触发扫描。 | 使用代码块和 `void new Audio(...).play().catch(...)`；回归测试检查该写法。 |
| manifest 宣称旧版本兼容，但源码使用新 API | 只降低 `minAppVersion`，未降低类型依赖编译。 | `obsidian` 类型依赖精确等于 `minAppVersion`，执行 `npm ci` 和 `tsc --noEmit`；预检核对两级 package 与 lockfile。 |
| Obsidian 发布资产缺失 | 完整发布未完成，或手工处理统一目录时遗漏文件。 | 构建后预检要求统一目录包含三个 Obsidian 资产；workflow 明确列出三个上传路径与 ZIP。 |
| 扫描结果看似通过但对应旧 commit | dashboard 同时展示历史 release 与 preview 结果。 | 每次以完整或短 SHA 匹配当前记录，再读取状态和问题计数。 |

## 标准发布流程

以下示例以 `7.0.9` 为待发布版本：

1. 在 `dev` 更新版本、manifest、package、lockfile、源码、bundle、测试和文档。
2. 安装依赖并执行完整检查：

   ```sh
   npm ci
   npm --prefix obsidian-plugin ci
   npm --prefix vscode-extension ci
   npm test
   npm --prefix obsidian-plugin run check
   npm --prefix vscode-extension run check
   npm --prefix vscode-extension run package
   ```

3. 生成完整发布资产并执行带 tag 的预检：

   ```sh
   npm run release:all -- --tag 7.0.9
   ```

4. 确认 `dist/7.0.9/` 同时包含浏览器 ZIP、VSIX、`main.js`、`manifest.json`、`styles.css` 和 `ai-translate-obsidian-7.0.9.zip`。
5. 提交并推送 `dev`，在 Obsidian dashboard 对该 commit 执行 preview scan。
6. 官方扫描完成且无 Error 后，按 `docs/DEVELOPMENT.md` 的白名单流程同步到 `main`。
7. 在 `main` 再执行一次第 3 步，确认工作区不会因构建产生未提交差异。
8. 创建并推送无 `v` tag：

   ```sh
   git tag -a 7.0.9 -m "AI Translate 7.0.9"
   git push origin main
   git push origin 7.0.9
   ```

9. 等待 `.github/workflows/release-all.yml` 完成。workflow 会再次用真实 tag 运行完整构建和预检，之后才创建 GitHub Release。
10. 发布完成后切回 `dev`。

## 发布后验证

- GitHub Actions 的 `Release AI Translate` workflow 状态为 success。
- GitHub Release 不是 draft 或 prerelease。
- Release tag 与 manifest 版本相同且不带 `v`。
- Release 同时包含浏览器 ZIP、VSIX、`main.js`、`manifest.json`、`styles.css` 和 Obsidian ZIP。
- 下载 Release 中的 manifest，确认 `id`、`version` 和 `minAppVersion`。
- Obsidian Community dashboard 能匹配到正确版本和 commit。
- 本地最终分支为 `dev`，工作区干净。

GitHub Actions 偶尔会报告 action 所用 Node.js runtime 即将弃用的 annotation。若 workflow 仍为 success，这不代表插件审查失败；仍应在后续维护中升级相应 action 版本。
