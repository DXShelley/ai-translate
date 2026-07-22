# AI Translate

> Look up English words, translate selected text, and optionally save vocabulary without leaving Obsidian.

[简体中文](README.zh-CN.md) · [Features](#features) · [Install](#install) · [Quick start](#quick-start)

![AI Translate showing phonetics, definitions, pronunciation, and vocabulary saving in Obsidian](../ob-translate.png)

AI Translate fits into your Obsidian reading and writing flow. Select text to look it up in place, use built-in Youdao mobile services when available, or configure your own OpenAI-compatible API. English dictionary results can also be sent to an external vocabulary service.

## Features

| When you need to | AI Translate helps you |
| --- | --- |
| Read English material | Look up one English word with phonetics, Chinese and English definitions, and available UK/US audio. |
| Understand selected text | Translate it in place. Chinese input is translated to English; other languages use your selected target language. |
| Search directly | Open a prompt from the Command Palette and enter a word or text. |
| Review vocabulary | Automatically or manually send successful English lookups to a compatible vocabulary API. |

## Requirements

- Obsidian `1.12.4` or newer.
- An OpenAI-compatible endpoint only when the built-in Youdao service is unavailable or disabled.

## Install

### Community plugins

After the plugin is approved in the Obsidian Community directory, open **Settings > Community plugins**, search for **AI Translate**, and install it.

### GitHub release

1. Download `main.js`, `manifest.json`, and `styles.css` from the GitHub release whose tag exactly matches the plugin version. Obsidian releases use tags without a `v` prefix.
2. Create `.obsidian/plugins/ai-translate/` inside your vault.
3. Copy the three files into that folder.
4. Enable **AI Translate** in **Settings > Community plugins**.

## Quick start

1. Select an English word, sentence, or paragraph in a note.
2. Use **AI Translate: Look up selected text** from the editor context menu or Command Palette.
3. A word opens a dictionary result; other text opens a translation result.
4. To enter text manually, run **AI Translate: Lookup or translate** from the Command Palette.

Built-in Youdao services are enabled by default, so no configuration is normally required. Open the settings only when you want to use a specific translation model, the built-in service is unavailable, or you want to connect a vocabulary service.

## Translation settings

| Setting | Description |
| --- | --- |
| Built-in Youdao service | Uses Youdao mobile dictionary and translation services before the configured API. |
| API Base URL | The base URL of an OpenAI-compatible API, for example `http://localhost:1234/v1`. |
| Endpoint Path | Usually `/chat/completions`. |
| Model | The model sent to the fallback API. |
| Target language | Translation target for non-Chinese text. |

When external vocabulary integration is enabled, these additional settings become available:

| Setting | Description |
| --- | --- |
| Automatically save lookups | Saves successful English dictionary lookups without opening the result modal again. |
| Vocabulary API URL | Full URL for the external vocabulary service. |
| Request method | `POST` sends JSON; `GET` sends the top-level template fields as query parameters. |
| Request template | JSON body or query template for the vocabulary request. |
| Authentication | Bearer, Basic, or no authentication. |
| Authentication credential | Credential used by the selected authentication method. |
| Custom headers | Additional request headers as a JSON object. |

On Obsidian `1.13.0` and later, all settings are registered with declarative definitions and are available through Settings search. The vocabulary credential uses a custom password renderer and remains masked in both the modern and legacy settings interfaces.

## Upgrading

The legacy fallback API Key setting has been removed. When the plugin loads, any previously stored `apiKey` value is discarded and is not written back to the vault configuration.

## External vocabulary API

External vocabulary integration is off by default. When enabled, successful English dictionary lookups can be saved automatically or manually. Saving is asynchronous and never blocks lookup or translation.

The default `POST` JSON request body is:

```json
{
  "headword": "{{headword}}",
  "phoneticUs": "{{phoneticUs}}",
  "phoneticUk": "{{phoneticUk}}",
  "definitionZh": "{{definitionZh}}",
  "definitionEn": "{{definitionEn}}"
}
```

Available placeholders are `{{headword}}`, `{{phoneticUs}}`, `{{phoneticUk}}`, `{{definitionZh}}`, and `{{definitionEn}}`. Legacy aliases `{{word}}`, `{{definition}}`, `{{phoneticUS}}`, and `{{phoneticUK}}` are also supported.

The integration supports `POST` and `GET`, custom JSON headers, and Bearer, Basic, or no authentication. Requests include an `Idempotency-Key` unless a custom header already provides one. Concurrent saves for the same word are merged into one request.

## Privacy

AI Translate does not collect or transmit data to an operator-controlled service. Dictionary and translation requests go only to Youdao or to the OpenAI-compatible endpoint configured by the user. External vocabulary requests are sent only when the user enables and configures that integration.

## Build from source

The full repository build also requires Python 3 for browser release archives. The Obsidian-only build below requires Node.js only.

```sh
cd obsidian-plugin
npm ci
npm run check
```

`npm run check` builds `main.js`, runs TypeScript validation, and executes the plugin tests.

For an Obsidian-only release build from the repository root:

```sh
npm run release:obsidian
```

The release assets are written to `dist/release/obsidian/<version>/`.

## Project support

AI Translate is open source. If it improves your note-taking workflow, you can support the project by:

- Starring the [GitHub repository](https://github.com/DXShelley/ai-translate) so more Obsidian users can find it.
- Reporting reproducible bugs, feature requests, or compatibility feedback through [Issues](https://github.com/DXShelley/ai-translate/issues).
- Improving code, documentation, or translations through a Pull Request. Run the relevant checks before submitting.
