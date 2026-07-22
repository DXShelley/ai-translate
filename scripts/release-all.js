const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const obsidianOnly = process.argv.includes("--obsidian");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const allPluginVersionFiles = [
  "package.json",
  "packages/chrome/manifest.json",
  "packages/edge/manifest.json",
  "packages/firefox/manifest.json",
  "vscode-extension/package.json",
  "manifest.json",
  "obsidian-plugin/package.json",
  "obsidian-plugin/manifest.json"
];
const versionFiles = obsidianOnly
  ? ["manifest.json", "obsidian-plugin/package.json", "obsidian-plugin/manifest.json"]
  : ["package.json", "packages/chrome/manifest.json", "packages/edge/manifest.json", "packages/firefox/manifest.json", "vscode-extension/package.json"];
const versions = versionFiles.map((file) => ({ file, version: readJson(file).version }));
const version = versions[0].version;
const allPluginVersions = allPluginVersionFiles.map((file) => ({ file, version: readJson(file).version }));
const majorVersion = (value) => String(value).split(".")[0];

if (!/^\d+\.\d+\.\d+$/.test(version) || versions.some((item) => item.version !== version)) {
  console.error("Release versions must match and use x.y.z:");
  for (const item of versions) console.error(`- ${item.file}: ${item.version}`);
  process.exit(1);
}

if (allPluginVersions.some((item) => majorVersion(item.version) !== majorVersion(version))) {
  console.error("All plugin major versions must match:");
  for (const item of allPluginVersions) console.error(`- ${item.file}: ${item.version}`);
  process.exit(1);
}

function run(args) {
  execFileSync(npm, args, { cwd: root, stdio: "inherit" });
}

const releaseDir = path.join(root, "dist", "release", obsidianOnly ? "obsidian" : "all", version);
const obsidianVersion = readJson("obsidian-plugin/manifest.json").version;
const obsidianReleaseDir = path.join(root, "dist", "release", "obsidian", obsidianVersion);
const assets = obsidianOnly
  ? ["obsidian-plugin/main.js", "obsidian-plugin/manifest.json", "obsidian-plugin/styles.css"]
  : [
      "AI-Translate-chrome.zip",
      "AI-Translate-edge.zip",
      "AI-Translate-firefox.zip",
      `dist/ai-translate-hover-${version}.vsix`
    ];
const obsidianAssets = ["obsidian-plugin/main.js", "obsidian-plugin/manifest.json", "obsidian-plugin/styles.css"];

if (obsidianOnly) {
  run(["--prefix", "obsidian-plugin", "run", "check"]);
} else {
  run(["run", "build"]);
  run(["--prefix", "vscode-extension", "run", "check"]);
  run(["--prefix", "vscode-extension", "run", "package"]);
  run(["--prefix", "obsidian-plugin", "run", "check"]);
}

fs.mkdirSync(releaseDir, { recursive: true });
for (const relativePath of assets) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) throw new Error(`Expected release asset was not produced: ${relativePath}`);
  fs.copyFileSync(source, path.join(releaseDir, path.basename(relativePath)));
}

if (!obsidianOnly) {
  fs.mkdirSync(obsidianReleaseDir, { recursive: true });
  for (const relativePath of obsidianAssets) {
    const source = path.join(root, relativePath);
    if (!fs.existsSync(source)) throw new Error(`Expected Obsidian release asset was not produced: ${relativePath}`);
    fs.copyFileSync(source, path.join(obsidianReleaseDir, path.basename(relativePath)));
  }
  console.log(`Obsidian release assets written to ${path.relative(root, obsidianReleaseDir)}`);
}

console.log(`Release assets written to ${path.relative(root, releaseDir)}`);
