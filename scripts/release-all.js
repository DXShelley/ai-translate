const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { SEMVER, assertReleaseTag, createZip, releaseDirectory } = require("./release-utils");

const root = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function parseArguments(args) {
  const options = { tag: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--tag") {
      const tag = args[index + 1];
      if (!tag) throw new Error("--tag requires a value.");
      options.tag = tag;
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

const { tag: releaseTag } = parseArguments(process.argv.slice(2));
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const allPluginVersionFiles = [
  "package.json",
  "browser-extensions/chrome/manifest.json",
  "browser-extensions/edge/manifest.json",
  "browser-extensions/firefox/manifest.json",
  "vscode-extension/package.json",
  "manifest.json",
  "obsidian-plugin/package.json",
  "obsidian-plugin/manifest.json"
];
const versionFiles = allPluginVersionFiles;
const versions = versionFiles.map((file) => ({ file, version: readJson(file).version }));
const version = versions[0].version;

assertReleaseTag(releaseTag, version);

if (!SEMVER.test(version) || versions.some((item) => item.version !== version)) {
  console.error("All plugin release versions must match and use x.y.z:");
  for (const item of versions) console.error(`- ${item.file}: ${item.version}`);
  process.exit(1);
}

function run(args) {
  execFileSync(npm, args, { cwd: root, stdio: "inherit" });
}

function verifyObsidianRelease(assetsDir) {
  const args = [path.join(root, "scripts", "verify-obsidian-release.js")];
  args.push("--tag", releaseTag);
  if (assetsDir) args.push("--assets-dir", path.relative(root, assetsDir));
  execFileSync(process.execPath, args, { cwd: root, stdio: "inherit" });
}

const releaseDir = releaseDirectory(root, version);
const browserAndVscodeAssets = [
  "AI-Translate-chrome.zip",
  "AI-Translate-edge.zip",
  "AI-Translate-firefox.zip",
  `ai-translate-hover-${version}.vsix`
];
const obsidianAssets = ["main.js", "manifest.json", "styles.css"];

async function createObsidianArchive() {
  const outputPath = path.join(releaseDir, `ai-translate-obsidian-${version}.zip`);
  await createZip(outputPath, obsidianAssets.map((asset) => ({ source: path.join(releaseDir, asset), name: asset })));
}

async function main() {
  verifyObsidianRelease();
  run(["run", "test:browser"]);
  run(["run", "test:vscode"]);
  run(["--prefix", "vscode-extension", "run", "package"]);
  run(["run", "test:obsidian"]);

  fs.mkdirSync(releaseDir, { recursive: true });
  for (const asset of ["manifest.json", "styles.css"]) {
    fs.copyFileSync(path.join(root, "obsidian-plugin", asset), path.join(releaseDir, asset));
  }
  verifyObsidianRelease(releaseDir);
  await createObsidianArchive();

  for (const asset of browserAndVscodeAssets) {
    if (!fs.existsSync(path.join(releaseDir, asset))) throw new Error(`Expected release asset was not produced: ${asset}`);
  }

  console.log(`Release assets written to ${path.relative(root, releaseDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
