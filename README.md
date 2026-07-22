# AI Translate

AI Translate is a multi-platform toolkit for dictionary lookup and selected-text translation. It provides extensions for Chrome, Edge, Firefox, VS Code, and Obsidian, with shared vocabulary request behavior across all supported platforms.

[Simplified Chinese](README.zh-CN.md) | [Obsidian documentation](obsidian-plugin/README.md) | [Obsidian 中文文档](obsidian-plugin/README.zh-CN.md) | [VS Code documentation](vscode-extension/README.md) | [Releases](https://github.com/DXShelley/ai-translate/releases)

## Platform Overview

| Platform | Primary workflow | Package |
| --- | --- | --- |
| Chrome | Translate selected words, sentences, and paragraphs on web pages. | `AI-Translate-chrome.zip` |
| Edge | Uses the Chrome feature set with Edge-compatible packaging and TTS fallback. | `AI-Translate-edge.zip` |
| Firefox | Uses the same translation workflow through a Manifest V2-compatible package. | `AI-Translate-firefox.zip` |
| VS Code | Shows dictionary and translation results while reading English Skill documents. | `ai-translate-hover-<version>.vsix` |
| Obsidian | Looks up English words, translates selected note text, and optionally saves vocabulary. | `main.js`, `manifest.json`, `styles.css` |

All plugins use major version `7`. Obsidian patch versions may advance independently, but every platform must keep the same major version.

## Features

### Browser extensions

- Detect a selected word, sentence, or paragraph and open the matching result view.
- Switch between selection, sentence, and paragraph modes without repeating completed requests.
- Look up English words with phonetics, definitions, examples, synonyms, antonyms, and pronunciation.
- Configure multiple OpenAI-compatible model profiles with priority-based fallback.
- Use automatic Chinese-English direction detection or explicit source and target languages.
- Keep recent results locally and prevent stale requests from replacing the current view.
- Optionally save successful English lookups to an external vocabulary API.

### VS Code extension

- Look up selected English words from hover or command-based workflows.
- Prefer built-in Youdao dictionary and translation services, with an OpenAI-compatible fallback.
- Play available UK and US pronunciation audio inside VS Code.
- Cache translation and dictionary results with bounded retention.
- Save vocabulary automatically or through a command link when manual mode is enabled.

### Obsidian plugin

- Run **AI Translate: Lookup or translate** from the Command Palette.
- Run **AI Translate: Look up selected text** from the editor menu or Command Palette.
- Show phonetics, Chinese and English definitions, and available pronunciation audio for English words.
- Use built-in Youdao mobile services first and an OpenAI-compatible endpoint as fallback.
- Support Obsidian `1.12.7` and later through one settings implementation shared by all supported app versions.
- Send vocabulary requests independently so a vocabulary API failure does not break lookup or translation.

See [AI Translate - Obsidian Plugin](obsidian-plugin/README.md) for the complete Obsidian installation, settings, privacy, and request-template reference.

## Installation

### Browser development packages

1. Download the ZIP for your browser from [GitHub Releases](https://github.com/DXShelley/ai-translate/releases).
2. Extract the ZIP.
3. Open the browser's extension management page.
4. Enable developer mode and load the extracted directory.

Store installation should use the platform listing when one is available. Do not upload an extracted development package to an untrusted service.

### VS Code

1. Download the `.vsix` file from the matching release.
2. Open the Extensions view in VS Code.
3. Select **Install from VSIX...** and choose the downloaded file.

### Obsidian

After Community plugins approval, open **Settings > Community plugins**, search for **AI Translate**, and install it.

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from the release whose tag exactly matches the manifest version. Copy the files to:

```text
<vault>/.obsidian/plugins/ai-translate/
```

Obsidian release tags do not use a `v` prefix. For example, manifest version `7.0.8` must use release tag `7.0.8`, not `v7.0.8`.

## Configuration

### Translation services

Browser and VS Code model profiles support OpenAI-compatible base URLs, endpoint paths, model IDs, authentication, timeouts, priorities, prompts, and optional extra request fields.

The Obsidian plugin uses built-in Youdao services by default. Its fallback translation settings contain an API base URL, endpoint path, model, and target language.

### External vocabulary API

Vocabulary integration is disabled by default. When enabled, successful English word lookups can be saved automatically or manually.

Supported request options include:

- `POST` with a JSON body or `GET` with encoded query parameters.
- Bearer, Basic, or no built-in authentication.
- A masked authentication credential and custom JSON headers.
- Custom request templates using `headword`, US/UK phonetics, and Chinese/English definitions.
- An `Idempotency-Key` for each actual write unless the user supplies one.
- Concurrent request merging for the same normalized word.

The shared protocol implementation is in `shared/vocabulary.js`. Platform-specific code owns only transport, logging, and UI feedback.

## Privacy and Security

- Translation text is sent only to the enabled built-in service or the endpoint configured by the user.
- Vocabulary data is sent only when vocabulary integration is enabled and configured.
- Request logging is disabled by default and may contain selected text or provider responses when enabled.
- Browser request logs redact authentication-related headers before storage.

Review the privacy behavior of every endpoint you configure. Local endpoints remain local only when the configured service itself does not forward requests.

## Development

### Requirements

- Node.js `18.17.0` or later. CI and release workflows currently use Node.js `22`.
- npm with the repository lockfiles.
- Python is not required for browser or Obsidian release builds.

### Install dependencies

```sh
npm ci
npm --prefix obsidian-plugin ci
npm --prefix vscode-extension ci
```

### Run checks

Build all browser packages and run the browser/shared tests:

```sh
npm test
```

Build, type-check, and test the Obsidian plugin:

```sh
npm --prefix obsidian-plugin run check
```

Check and package the VS Code extension:

```sh
npm --prefix vscode-extension run check
npm --prefix vscode-extension run package
```

The browser build writes browser-specific directories under `packages/` and refreshes the three root ZIP files. ZIP creation runs entirely in Node.js and keeps `manifest.json` as the first archive entry.

## Release Process

### Full multi-platform release

A full release requires matching Chrome, Edge, Firefox, and VS Code versions. The Obsidian version must share their major version.

```sh
npm run release:all
```

This command builds Chrome, Edge, Firefox, VS Code, and Obsidian. Browser and VS Code assets are written to `dist/release/all/<version>/`; Obsidian assets are written to `dist/release/obsidian/<obsidian-version>/`.

Use `v<version>` for the browser/VS Code GitHub release. Create a separate `<obsidian-version>` release without `v` for Obsidian.

### Obsidian-only patch release

```sh
npm run release:obsidian
```

The command verifies matching root and Obsidian manifest versions, runs the Obsidian checks, and writes exactly these release assets:

```text
dist/release/obsidian/<version>/main.js
dist/release/obsidian/<version>/manifest.json
dist/release/obsidian/<version>/styles.css
```

Pushing a numeric tag such as `7.0.8` triggers `.github/workflows/release-obsidian.yml`, which checks the plugin, creates artifact attestations, and publishes the GitHub Release.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/` | Shared browser extension source. |
| `packages/` | Generated Chrome, Edge, and Firefox package directories. |
| `shared/` | Cross-platform vocabulary request implementation. |
| `vscode-extension/` | VS Code extension source, tests, and package configuration. |
| `obsidian-plugin/` | Obsidian source, bundle, styles, tests, and dedicated documentation. |
| `scripts/` | Browser and release build scripts. |
| `test/` | Browser and shared regression tests. |
| `website/` | Project website source. |
| `docs/` | Architecture, development, release, and store documentation. |

## Contributing and Support

Before submitting a change, run the checks for every affected platform and include focused regression coverage. Architecture and behavior constraints are documented in [Development Guidelines](docs/DEVELOPMENT.md).

- Report reproducible defects or request features through [GitHub Issues](https://github.com/DXShelley/ai-translate/issues).
- Download signed release assets from [GitHub Releases](https://github.com/DXShelley/ai-translate/releases).
- Review project and support information on [GitHub Pages](https://dxshelley.github.io/ai-translate/).

## License

This project is licensed under the terms in [LICENSE](LICENSE).
