const fs = require("node:fs");
const path = require("node:path");

const SEMVER = /^\d+\.\d+\.\d+$/;

function releaseDirectory(root, version) {
  return path.join(root, "dist", version);
}

function assertReleaseTag(tag, version) {
  if (!tag) throw new Error("Releases require --tag <version>.");
  if (tag.startsWith("v")) throw new Error(`Release tag ${tag} must not use a v prefix.`);
  if (tag !== version) throw new Error(`Release tag ${tag} must exactly match version ${version}.`);
}

async function createZip(outputPath, entries) {
  const { ZipArchive } = await import("archiver");
  const temporaryPath = `${outputPath}.tmp`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(temporaryPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.once("close", resolve);
    output.once("error", reject);
    archive.once("error", reject);
    archive.pipe(output);
    for (const entry of entries) archive.file(entry.source, { name: entry.name });
    void archive.finalize();
  });

  fs.rmSync(outputPath, { force: true });
  fs.renameSync(temporaryPath, outputPath);
}

async function createDirectoryZip(sourceDirectory, outputPath, excludedNames = []) {
  const excluded = new Set(excludedNames);
  const files = fs.readdirSync(sourceDirectory, { recursive: true })
    .filter((file) => typeof file === "string" && !excluded.has(file))
    .filter((file) => fs.statSync(path.join(sourceDirectory, file)).isFile())
    .sort((left, right) => (left === "manifest.json" ? -1 : right === "manifest.json" ? 1 : left.localeCompare(right)))
    .map((file) => ({ source: path.join(sourceDirectory, file), name: file }));
  await createZip(outputPath, files);
}

module.exports = { SEMVER, assertReleaseTag, createDirectoryZip, createZip, releaseDirectory };
