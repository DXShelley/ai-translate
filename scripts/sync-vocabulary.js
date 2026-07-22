const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "shared", "vocabulary.js");
const destination = path.join(__dirname, "..", "vscode-extension", "shared", "vocabulary.js");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
