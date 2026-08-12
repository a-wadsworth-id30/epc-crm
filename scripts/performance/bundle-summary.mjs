#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const routeStatsPath = join(root, ".next/diagnostics/route-bundle-stats.json");
const chunksDir = join(root, ".next/static/chunks");
const routeLimit = Number.parseInt(process.env.PERF_ROUTE_LIMIT ?? "15", 10);
const chunkLimit = Number.parseInt(process.env.PERF_CHUNK_LIMIT ?? "20", 10);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fileSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function gzipSize(path) {
  try {
    return gzipSync(readFileSync(path)).length;
  } catch {
    return 0;
  }
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return walkFiles(path);
    return [path];
  });
}

if (!existsSync(routeStatsPath)) {
  console.error(
    "Missing .next diagnostics. Run `npm run build` before `npm run perf:bundle`.",
  );
  process.exit(1);
}

const routeStats = readJson(routeStatsPath);
const topRoutes = [...routeStats]
  .sort(
    (first, second) =>
      second.firstLoadUncompressedJsBytes - first.firstLoadUncompressedJsBytes,
  )
  .slice(0, routeLimit);

const chunkRouteCounts = new Map();

for (const route of routeStats) {
  for (const chunkPath of route.firstLoadChunkPaths ?? []) {
    chunkRouteCounts.set(chunkPath, (chunkRouteCounts.get(chunkPath) ?? 0) + 1);
  }
}

const topChunks = walkFiles(chunksDir)
  .filter((path) => /\.(css|js)$/.test(path))
  .map((path) => {
    const relativePath = relative(root, path);
    const routeStatsPath = relativePath.startsWith(".next")
      ? relativePath
      : join(".next", relativePath);

    return {
      gzipBytes: gzipSize(path),
      path: relativePath,
      routeCount: chunkRouteCounts.get(routeStatsPath) ?? 0,
      sizeBytes: fileSize(path),
    };
  })
  .sort((first, second) => second.sizeBytes - first.sizeBytes)
  .slice(0, chunkLimit);

const totalChunkBytes = walkFiles(chunksDir)
  .filter((path) => /\.(css|js)$/.test(path))
  .reduce((total, path) => total + fileSize(path), 0);

console.log("Performance bundle summary");
console.log("==========================");
console.log(`Routes measured: ${routeStats.length}`);
console.log(`Static JS/CSS chunk total: ${formatBytes(totalChunkBytes)}`);
console.log("");
console.log(`Top ${topRoutes.length} routes by first-load uncompressed JS:`);

for (const route of topRoutes) {
  console.log(
    `- ${route.route}: ${formatBytes(route.firstLoadUncompressedJsBytes)} ` +
      `across ${(route.firstLoadChunkPaths ?? []).length} chunks`,
  );
}

console.log("");
console.log(`Top ${topChunks.length} static chunks by raw size:`);

for (const chunk of topChunks) {
  console.log(
    `- ${chunk.path}: ${formatBytes(chunk.sizeBytes)} raw, ` +
      `${formatBytes(chunk.gzipBytes)} gzip, ${chunk.routeCount} routes`,
  );
}
