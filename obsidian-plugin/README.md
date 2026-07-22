# AI Translate - Obsidian Plugin

AI Translate adds dictionary lookup and selected-text translation to Obsidian. It can use the built-in Youdao mobile services first, then fall back to an OpenAI-compatible API. English dictionary results can optionally be sent to an external vocabulary service.

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

## Use

- Run **AI Translate: Lookup or translate** from the Command Palette to enter text manually.
- Run **AI Translate: Look up selected text**, or select text and use the editor context menu.
- A single English word opens a dictionary result with phonetics, definitions, and available UK/US pronunciation audio.
- Other selected text is translated. Chinese input is translated to English; other languages use the configured target language.

## Settings

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

On Obsidian `1.13.0` and later, all settings are registered with the declarative settings API and are available through Settings search. The vocabulary credential remains a password input in both the modern and legacy settings interfaces.

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
