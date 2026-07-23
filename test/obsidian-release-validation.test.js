const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { parseArguments, validateRepository } = require("../scripts/verify-obsidian-release.js");

const root = path.resolve(__dirname, "..");
const currentVersion = JSON.parse(fs.readFileSync(path.join(root, "obsidian-plugin", "manifest.json"), "utf8")).version;
const fixtureFiles = [
  "package.json",
  "package-lock.json",
  "browser-extensions/chrome/manifest.json",
  "browser-extensions/edge/manifest.json",
  "browser-extensions/firefox/manifest.json",
  "vscode-extension/package.json",
  "manifest.json",
  "obsidian-plugin/manifest.json",
  "obsidian-plugin/package.json",
  "obsidian-plugin/package-lock.json",
  "obsidian-plugin/src/main.ts"
];

function createFixture(context) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-translate-obsidian-fixture-"));
  context.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  for (const relativePath of fixtureFiles) {
    const destination = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relativePath), destination);
  }
  return fixtureRoot;
}

function createReleaseAssets(context) {
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-translate-obsidian-assets-"));
  context.after(() => fs.rmSync(assetsDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(assetsDir, "main.js"), "module.exports = {};\n", "utf8");
  for (const asset of ["manifest.json", "styles.css"]) {
    fs.copyFileSync(path.join(root, "obsidian-plugin", asset), path.join(assetsDir, asset));
  }
  return assetsDir;
}

test("accepts the current Obsidian release metadata", () => {
  const result = validateRepository({ root, tag: currentVersion });
  assert.deepEqual(result.errors, []);
  assert.equal(result.minAppVersion, "1.12.2");
});

test("rejects a v-prefixed or mismatched Obsidian release tag", () => {
  const result = validateRepository({ root, tag: `v${currentVersion}` });
  assert.ok(result.errors.some((error) => error.includes("must not use a v prefix")));
  assert.ok(result.errors.some((error) => error.includes("must exactly match manifest version")));
});

test("rejects an Obsidian description without punctuation", (context) => {
  const fixtureRoot = createFixture(context);
  const manifestPath = path.join(fixtureRoot, "obsidian-plugin/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.description = "Description without punctuation";
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const result = validateRepository({ root: fixtureRoot });
  assert.ok(result.errors.some((error) => error.includes("description must end with punctuation")));
});

test("rejects a root manifest that differs from the Obsidian plugin manifest", (context) => {
  const fixtureRoot = createFixture(context);
  const manifestPath = path.join(fixtureRoot, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = "7.0.8";
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const result = validateRepository({ root: fixtureRoot });
  assert.ok(result.errors.some((error) => error.includes("Root manifest.json must match")));
});

test("rejects legacy and declarative settings definitions together", (context) => {
  const fixtureRoot = createFixture(context);
  fs.appendFileSync(path.join(fixtureRoot, "obsidian-plugin/src/main.ts"), "\nfunction getSettingDefinitions() {}\n", "utf8");

  const result = validateRepository({ root: fixtureRoot });
  assert.ok(result.errors.some((error) => error.includes("both legacy and declarative")));
});

test("rejects an Obsidian type dependency that differs from minAppVersion", (context) => {
  const fixtureRoot = createFixture(context);
  const packagePath = path.join(fixtureRoot, "obsidian-plugin/package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  packageJson.devDependencies.obsidian = "1.13.1";
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const result = validateRepository({ root: fixtureRoot });
  assert.ok(result.errors.some((error) => error.includes("must pin Obsidian exactly to minAppVersion")));
});

test("rejects a plugin version that differs from the Obsidian version", (context) => {
  const fixtureRoot = createFixture(context);
  const packagePath = path.join(fixtureRoot, "vscode-extension/package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  packageJson.version = "7.0.8";
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const result = validateRepository({ root: fixtureRoot });
  assert.ok(result.errors.some((error) => error.includes("must exactly match Obsidian version")));
});

test("accepts the required Obsidian assets in a unified release directory", (context) => {
  const assetsDir = createReleaseAssets(context);
  fs.writeFileSync(path.join(assetsDir, "AI-Translate-chrome.zip"), "browser archive", "utf8");

  const result = validateRepository({ root, assetsDir });
  assert.deepEqual(result.errors, []);
});

test("rejects missing Obsidian release assets", (context) => {
  const assetsDir = createReleaseAssets(context);
  fs.rmSync(path.join(assetsDir, "styles.css"));

  const result = validateRepository({ root, assetsDir });
  assert.ok(result.errors.some((error) => error.includes("are missing")));
});

test("parses release validation CLI arguments", () => {
  assert.deepEqual(parseArguments(["--tag", "7.0.9", "--assets-dir", "dist/7.0.9"]), {
    tag: "7.0.9",
    assetsDir: "dist/7.0.9"
  });
  assert.throws(() => parseArguments(["--tag"]), /requires a value/);
});

test("requires a tag for the complete release", () => {
  const result = spawnSync(process.execPath, ["scripts/release-all.js"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Releases require --tag <version>/);
});

test("rejects v-prefixed tags and the retired Obsidian-only option", () => {
  for (const args of [["--tag", `v${currentVersion}`], ["--obsidian", "--tag", currentVersion]]) {
    const result = spawnSync(process.execPath, ["scripts/release-all.js", ...args], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
  }
});

test("passes the GitHub tag through the complete release workflow", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/release-all.yml"), "utf8");
  assert.match(workflow, /npm run release:all -- --tag "\$GITHUB_REF_NAME"/);
  assert.doesNotMatch(workflow, /release:obsidian/);
  assert.deepEqual(
    [...workflow.matchAll(/^\s+dist\/\$\{\{ github\.ref_name \}\}\/(main\.js|manifest\.json|styles\.css)$/gm)].map((match) => match[1]).slice(-3),
    ["main.js", "manifest.json", "styles.css"]
  );
});
