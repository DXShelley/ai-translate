const fs = require("node:fs");
const path = require("node:path");

const SEMVER = /^\d+\.\d+\.\d+$/;
const REQUIRED_ASSETS = ["main.js", "manifest.json", "styles.css"];
const VERSION_FILES = [
  "package.json",
  "browser-extensions/chrome/manifest.json",
  "browser-extensions/edge/manifest.json",
  "browser-extensions/firefox/manifest.json",
  "vscode-extension/package.json",
  "manifest.json",
  "obsidian-plugin/package.json",
  "obsidian-plugin/manifest.json"
];

function readJson(root, relativePath, errors) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`${relativePath} must contain valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function validateRepository({ root = path.resolve(__dirname, ".."), tag, assetsDir } = {}) {
  const errors = [];
  const pluginManifest = readJson(root, "obsidian-plugin/manifest.json", errors);
  const rootManifest = readJson(root, "manifest.json", errors);
  const rootPackage = readJson(root, "package.json", errors);
  const pluginPackage = readJson(root, "obsidian-plugin/package.json", errors);
  const rootLock = readJson(root, "package-lock.json", errors);
  const pluginLock = readJson(root, "obsidian-plugin/package-lock.json", errors);
  const version = pluginManifest.version;
  const minAppVersion = pluginManifest.minAppVersion;

  if (!SEMVER.test(version || "")) errors.push("obsidian-plugin/manifest.json version must use x.y.z.");
  if (!SEMVER.test(minAppVersion || "")) errors.push("obsidian-plugin/manifest.json minAppVersion must use x.y.z.");
  if (pluginPackage.version !== version) errors.push("obsidian-plugin/package.json version must match the Obsidian manifest version.");
  if (pluginLock.version !== version || pluginLock.packages?.[""]?.version !== version) {
    errors.push("obsidian-plugin/package-lock.json package versions must match the Obsidian manifest version.");
  }

  if (!/^[a-z0-9-]+$/.test(pluginManifest.id || "")) errors.push("The Obsidian plugin id must use lowercase letters, numbers, and hyphens only.");
  for (const field of ["name", "description", "author"]) {
    if (typeof pluginManifest[field] !== "string" || !pluginManifest[field].trim()) errors.push(`The Obsidian manifest requires a non-empty ${field}.`);
  }
  if (typeof pluginManifest.authorUrl !== "string" || !/^https:\/\//.test(pluginManifest.authorUrl)) {
    errors.push("The Obsidian manifest authorUrl must be an HTTPS URL.");
  }
  if (typeof pluginManifest.isDesktopOnly !== "boolean") errors.push("The Obsidian manifest isDesktopOnly field must be boolean.");
  if (typeof pluginManifest.description === "string" && !/[.!?]$/.test(pluginManifest.description.trim())) {
    errors.push("The Obsidian plugin description must end with punctuation (., !, or ?).");
  }
  if (JSON.stringify(rootManifest) !== JSON.stringify(pluginManifest)) {
    errors.push("Root manifest.json must match obsidian-plugin/manifest.json for Obsidian Community plugin scanning.");
  }

  if (SEMVER.test(minAppVersion || "")) {
    const dependencyVersions = [
      ["package.json", rootPackage.devDependencies?.obsidian],
      ["obsidian-plugin/package.json", pluginPackage.devDependencies?.obsidian],
      ["package-lock.json root package", rootLock.packages?.[""]?.devDependencies?.obsidian],
      ["package-lock.json installed package", rootLock.packages?.["node_modules/obsidian"]?.version],
      ["obsidian-plugin/package-lock.json root package", pluginLock.packages?.[""]?.devDependencies?.obsidian],
      ["obsidian-plugin/package-lock.json installed package", pluginLock.packages?.["node_modules/obsidian"]?.version]
    ];
    for (const [file, dependencyVersion] of dependencyVersions) {
      if (dependencyVersion !== minAppVersion) errors.push(`${file} must pin Obsidian exactly to minAppVersion ${minAppVersion}.`);
    }
  }

  const pluginVersions = VERSION_FILES.map((file) => [file, readJson(root, file, errors).version]);
  if (SEMVER.test(version || "") && pluginVersions.some(([, itemVersion]) => itemVersion !== version)) {
    errors.push(`All plugin versions must exactly match Obsidian version ${version}.`);
  }

  let source = "";
  try {
    source = fs.readFileSync(path.join(root, "obsidian-plugin/src/main.ts"), "utf8");
  } catch (error) {
    errors.push(`obsidian-plugin/src/main.ts must be readable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const hasLegacySettings = /^\s*display\(\)/m.test(source);
  const hasDeclarativeSettings = /SettingDefinitionItem|getSettingDefinitions|getControlValue|setControlValue|this\.update\(/.test(source);
  if (hasLegacySettings && hasDeclarativeSettings) errors.push("Obsidian settings must not maintain both legacy and declarative field definitions.");
  if (SEMVER.test(minAppVersion || "") && compareVersions(minAppVersion, "1.13.0") < 0) {
    if (!hasLegacySettings) errors.push(`Obsidian ${minAppVersion} compatibility requires PluginSettingTab.display().`);
    if (hasDeclarativeSettings) errors.push(`Obsidian ${minAppVersion} compatibility cannot depend on the 1.13 declarative settings API.`);
  }
  if (/settings\.apiKey|setName\(["']API Key["']|Authorization[^\n]+apiKey/.test(source)) {
    errors.push("The removed fallback translation API Key must not return to Obsidian settings or requests.");
  }

  if (tag !== undefined) {
    if (tag.startsWith("v")) errors.push(`Obsidian release tag ${tag} must not use a v prefix.`);
    if (tag !== version) errors.push(`Obsidian release tag ${tag} must exactly match manifest version ${version}.`);
  }

  if (assetsDir !== undefined) {
    const resolvedAssetsDir = path.resolve(root, assetsDir);
    try {
      fs.accessSync(resolvedAssetsDir);
    } catch (error) {
      errors.push(`Obsidian release assets directory must be readable: ${error instanceof Error ? error.message : String(error)}`);
    }
    const missingAssets = REQUIRED_ASSETS.filter((asset) => !fs.existsSync(path.join(resolvedAssetsDir, asset)));
    if (missingAssets.length) {
      errors.push(`Obsidian release assets are missing: ${missingAssets.join(", ")}.`);
    } else {
      const releaseManifest = readJson(resolvedAssetsDir, "manifest.json", errors);
      if (JSON.stringify(releaseManifest) !== JSON.stringify(pluginManifest)) errors.push("The release manifest must match obsidian-plugin/manifest.json.");
      for (const asset of ["main.js", "styles.css"]) {
        if (fs.statSync(path.join(resolvedAssetsDir, asset)).size === 0) errors.push(`${asset} must not be empty.`);
      }
    }
  }

  return { errors, version, minAppVersion };
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--tag" || argument === "--assets-dir") {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      options[argument === "--tag" ? "tag" : "assetsDir"] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

if (require.main === module) {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const result = validateRepository(options);
  if (result.errors.length) {
    console.error("Obsidian release preflight failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Obsidian release preflight passed: version ${result.version}, minimum app ${result.minAppVersion}.`);
}

module.exports = { REQUIRED_ASSETS, parseArguments, validateRepository };
