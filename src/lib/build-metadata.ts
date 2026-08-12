const runtimeStartedAt = new Date().toISOString();

export function buildMetadata() {
  const commit = process.env.APP_BUILD_COMMIT ?? "unknown";

  return {
    commit,
    shortCommit: commit === "unknown" ? "unknown" : commit.slice(0, 7),
    branch: process.env.APP_BUILD_BRANCH ?? "unknown",
    builtAt: process.env.APP_BUILD_TIME ?? "unknown",
    runtimeStartedAt,
  };
}

export function publicBuildMetadata() {
  const commit = process.env.APP_BUILD_COMMIT ?? "unknown";

  return {
    shortCommit: commit === "unknown" ? "unknown" : commit.slice(0, 7),
  };
}
