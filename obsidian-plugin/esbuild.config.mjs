import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const production = process.argv[2] === "production";
const directory = path.dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")).version;
const outputDirectory = path.join(directory, "..", "dist", version);
fs.mkdirSync(outputDirectory, { recursive: true });

await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: production,
  outfile: path.join(outputDirectory, "main.js")
}).then((context) => production ? context.rebuild().then(() => context.dispose()) : context.watch());
