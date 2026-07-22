const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("browser release archives are built without Python", () => {
  const buildScript = fs.readFileSync(path.join(root, "scripts", "build.js"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  assert.match(buildScript, /ZipArchive/);
  assert.doesNotMatch(buildScript, /child_process|python3?|process\.env\.PYTHON/i);
  assert.equal(packageJson.engines.node, ">=18.17.0");
});

test("browser build emits valid ZIP signatures", () => {
  for (const browser of ["chrome", "edge", "firefox"]) {
    const archive = fs.readFileSync(path.join(root, `AI-Translate-${browser}.zip`));
    assert.equal(archive.subarray(0, 2).toString("ascii"), "PK", `${browser} archive must be a ZIP file`);
  }
});

test("root README is an English project entry point", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const latinLetters = (readme.match(/[A-Za-z]/g) || []).length;
  const cjkCharacters = (readme.match(/[\u3400-\u9fff]/g) || []).length;

  assert.match(readme, /^# AI Translate$/m);
  for (const heading of ["Platform Overview", "Installation", "Configuration", "Development", "Release Process"]) {
    assert.match(readme, new RegExp(`^## ${heading}$`, "m"));
  }
  assert.ok(latinLetters > cjkCharacters * 10, "README should be predominantly English");
});
