# Architecture

AI Translate is a multi-platform translation and dictionary project. Browser extensions, the VS Code extension, and the Obsidian plugin expose platform-native workflows while sharing product conventions and the vocabulary request contract.

## Components

| Area | Responsibility |
| --- | --- |
| `src/` | Shared browser-extension source for content scripts, background behavior, options, popup UI, and browser adaptation. |
| `browser-extensions/` | Browser-specific manifests, static icons, and generated package work directories for Chrome, Edge, and Firefox. |
| `src/vocabulary.js` | Cross-platform vocabulary request normalization, idempotency, and field mapping. |
| `vscode-extension/` | VS Code hover dictionary and translation extension, icon, and VSIX packaging configuration. |
| `obsidian-plugin/` | Obsidian plugin source, styles, and bilingual user documentation. |
| `website/` | GitHub Pages project site. |
| `scripts/` | Build, release, validation, and branch-sync automation. Static icon assets live with their consuming plugins. |

## Plugin Boundaries

### Browser extensions

The browser extensions use `src/` for shared behavior and keep browser-specific manifest differences and static `16px` / `48px` / `128px` icons in `browser-extensions/chrome/`, `browser-extensions/edge/`, and `browser-extensions/firefox/`. `scripts/build.js` builds browser-specific files into `browser-extensions/` and creates distributable ZIP files under `dist/<version>/`.

### VS Code extension

`vscode-extension/` owns hover and command-based lookup behavior. It prefers built-in Youdao services and falls back to a configured OpenAI-compatible endpoint. Its Marketplace and VSIX icon is `vscode-extension/media/icon.png`. `scripts/vscode-build.js` supplies the cross-platform vocabulary module only while checking or packaging, then removes the temporary copy; VSIX output is written to `dist/<version>/`.

### Obsidian plugin

`obsidian-plugin/` owns its Obsidian commands, settings UI, and source. Its distributable `main.js`, `manifest.json`, `styles.css`, and ZIP are written directly to `dist/<version>/`. Platform regression tests live in `test/obsidian/`; VS Code regression tests live in `test/vscode/`.

## Shared Vocabulary Contract

Vocabulary saving is optional and disabled by default. The shared contract supports JSON `POST` or query-parameter `GET`, Bearer or Basic authentication, custom headers, field templates, idempotency keys, and concurrent-save merging. Platform code may adapt transport and UI feedback, but must not change the shared request semantics without updating `src/vocabulary.js` and focused tests.

## Build And Release Outputs

All distributable artifacts are written below `dist/`:

```text
dist/<version>/
  AI-Translate-chrome.zip
  AI-Translate-edge.zip
  AI-Translate-firefox.zip
  ai-translate-hover-<version>.vsix
  ai-translate-obsidian-<version>.zip
  main.js
  manifest.json
  styles.css
```

`browser-extensions/` is a browser build workspace, not a release download location. `test/` is the single location for all automated tests and compatibility fixtures. The root `dist/` directory is ignored by Git.

## Further Reading

- [Browser extension guide](BROWSER-EXTENSIONS.md)
- [Development guidelines](DEVELOPMENT.md)
- [Obsidian release guide](OBSIDIAN-RELEASE.md)
- [Store submission guide](STORE-SUBMISSION.md)
