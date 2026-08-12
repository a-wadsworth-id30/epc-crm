import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const appRoot = path.join(repoRoot, "desktop", "softphone");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(appRoot, "package.json"), "utf8"),
);
const version = packageJson.version;
const publicBaseUrl = (process.env.DESKTOP_SOFTPHONE_PUBLIC_BASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const platform = parseArg("platform");

if (!publicBaseUrl) {
  fail("DESKTOP_SOFTPHONE_PUBLIC_BASE_URL is required.");
}

if (!["mac", "windows"].includes(platform)) {
  fail("Pass --platform=mac or --platform=windows.");
}

const publicRoot = path.join(appRoot, ".release", "public");
const releaseDate = new Date().toISOString();
const manifest = {
  platform,
  version,
  releaseDate,
  files: [],
};

if (platform === "mac") {
  prepareMacAssets();
} else {
  prepareWindowsAssets();
}

writeJson(
  path.join(publicRoot, "versions", version, `manifest-${platform}.json`),
  manifest,
);

function prepareMacAssets() {
  const zip = findRequiredFile(
    path.join(appRoot, "out", "make", "zip", "darwin", "arm64"),
    (name) => name.endsWith(`-${version}.zip`),
    "macOS ZIP",
  );
  const versionedName = `iD30-Softphone-macOS-arm64-${version}.zip`;
  const latestName = "iD30-Softphone-macOS-arm64.zip";
  const updateName = path.basename(zip);
  const updateRelativePath = `updates/darwin/arm64/${updateName}`;

  copyFile(zip, path.join(publicRoot, "versions", version, versionedName));
  copyFile(zip, path.join(publicRoot, "latest", latestName));
  copyFile(zip, path.join(publicRoot, updateRelativePath));
  writeJson(path.join(publicRoot, "updates", "darwin", "arm64", "RELEASES.json"), {
    currentRelease: version,
    releases: [
      {
        version,
        updateTo: {
          version,
          url: publicUrl(updateRelativePath),
          name: `iD30 Softphone ${version}`,
          notes: "",
          pub_date: releaseDate,
        },
      },
    ],
  });

  addManifestFile("download", `versions/${version}/${versionedName}`);
  addManifestFile("download", `latest/${latestName}`);
  addManifestFile("update", updateRelativePath);
  addManifestFile("update", "updates/darwin/arm64/RELEASES.json");
}

function prepareWindowsAssets() {
  const makeDir = path.join(appRoot, "out", "make", "squirrel.windows", "x64");
  const setup = findRequiredFile(
    makeDir,
    (name) => name.endsWith("Setup.exe") && name.includes(version),
    "Windows setup EXE",
  );
  const releases = path.join(makeDir, "RELEASES");
  const nupkg = findRequiredFile(
    makeDir,
    (name) => name.endsWith("-full.nupkg") && name.includes(version),
    "Windows full nupkg",
  );
  const versionedName = `iD30-Softphone-Windows-x64-${version}.exe`;
  const latestName = "iD30-Softphone-Windows-x64.exe";
  const updateDir = path.join(publicRoot, "updates", "win32", "x64");

  assertFile(releases, "Windows RELEASES file");
  copyFile(setup, path.join(publicRoot, "versions", version, versionedName));
  copyFile(setup, path.join(publicRoot, "latest", latestName));
  copyFile(setup, path.join(updateDir, path.basename(setup)));
  copyFile(releases, path.join(updateDir, "RELEASES"));
  copyFile(nupkg, path.join(updateDir, path.basename(nupkg)));

  addManifestFile("download", `versions/${version}/${versionedName}`);
  addManifestFile("download", `latest/${latestName}`);
  addManifestFile("update", `updates/win32/x64/${path.basename(setup)}`);
  addManifestFile("update", "updates/win32/x64/RELEASES");
  addManifestFile("update", `updates/win32/x64/${path.basename(nupkg)}`);
}

function parseArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));

  return arg ? arg.slice(prefix.length) : "";
}

function findRequiredFile(directory, predicate, label) {
  if (!fs.existsSync(directory)) {
    fail(`${label} directory does not exist: ${directory}`);
  }

  const found = fs
    .readdirSync(directory)
    .filter(predicate)
    .sort()
    .at(-1);

  if (!found) {
    fail(`${label} was not found in ${directory}`);
  }

  return path.join(directory, found);
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail(`${label} was not found: ${filePath}`);
  }
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function publicUrl(relativePath) {
  return new URL(relativePath, `${publicBaseUrl}/`).toString();
}

function addManifestFile(type, relativePath) {
  manifest.files.push({
    type,
    path: relativePath,
    url: publicUrl(relativePath),
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
