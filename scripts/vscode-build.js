const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const extensionDirectory = path.join(root, "vscode-extension");
const vocabularySource = path.join(root, "src", "vocabulary.js");
const vocabularyDestination = path.join(extensionDirectory, "vocabulary.js");
const node = process.execPath;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function withVocabularyInput(task) {
  fs.copyFileSync(vocabularySource, vocabularyDestination);
  try {
    task();
  } finally {
    fs.rmSync(vocabularyDestination, { force: true });
  }
}

const task = process.argv[2];
if (task === "check") {
  withVocabularyInput(() => {
    execFileSync(node, ["--check", "extension.js"], { cwd: extensionDirectory, stdio: "inherit" });
    const tests = fs.readdirSync(path.join(root, "test", "vscode"))
      .filter((file) => file.endsWith(".test.js"))
      .map((file) => path.join(root, "test", "vscode", file));
    execFileSync(node, ["--test", ...tests], { cwd: extensionDirectory, stdio: "inherit" });
  });
} else if (task === "package") {
  const version = JSON.parse(fs.readFileSync(path.join(extensionDirectory, "package.json"), "utf8")).version;
  const output = path.join(root, "dist", version, `ai-translate-hover-${version}.vsix`);
  withVocabularyInput(() => {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    execFileSync(npx, ["@vscode/vsce", "package", "--out", output], { cwd: extensionDirectory, stdio: "inherit" });
  });
} else {
  throw new Error("Usage: node scripts/vscode-build.js <check|package>");
}
