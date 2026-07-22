import esbuild from "esbuild";
import process from "process";

const production = process.argv[2] === "production";

await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: production,
  outfile: "main.js"
}).then((context) => production ? context.rebuild().then(() => context.dispose()) : context.watch());
