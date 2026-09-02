import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  defaultDesktopSoftphoneDownloadBaseUrl,
  desktopSoftphoneDownloadAvailability,
  desktopSoftphoneDownloadFilename,
  desktopSoftphoneDownloadUrl,
} from "../src/lib/desktop-softphone/downloads";

const originalEnv = {
  ID30_SOFTPHONE_DOWNLOAD_BASE_URL:
    process.env.ID30_SOFTPHONE_DOWNLOAD_BASE_URL,
  ID30_SOFTPHONE_MAC_DOWNLOAD_URL: process.env.ID30_SOFTPHONE_MAC_DOWNLOAD_URL,
  ID30_SOFTPHONE_WINDOWS_DOWNLOAD_URL:
    process.env.ID30_SOFTPHONE_WINDOWS_DOWNLOAD_URL,
  ID30_SOFTPHONE_ALLOW_GITHUB_RELEASE_DOWNLOADS:
    process.env.ID30_SOFTPHONE_ALLOW_GITHUB_RELEASE_DOWNLOADS,
};

function resetEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("desktop softphone downloads", () => {
  afterEach(resetEnv);

  it("defaults macOS and Windows downloads to the public R2 bucket", () => {
    delete process.env.ID30_SOFTPHONE_DOWNLOAD_BASE_URL;
    delete process.env.ID30_SOFTPHONE_MAC_DOWNLOAD_URL;
    delete process.env.ID30_SOFTPHONE_WINDOWS_DOWNLOAD_URL;
    delete process.env.ID30_SOFTPHONE_ALLOW_GITHUB_RELEASE_DOWNLOADS;

    assert.equal(
      desktopSoftphoneDownloadUrl("mac"),
      `${defaultDesktopSoftphoneDownloadBaseUrl}/latest/iD30-Softphone-macOS-arm64.zip`,
    );
    assert.equal(
      desktopSoftphoneDownloadUrl("windows"),
      `${defaultDesktopSoftphoneDownloadBaseUrl}/latest/iD30-Softphone-Windows-x64.exe`,
    );
    assert.deepEqual(desktopSoftphoneDownloadAvailability(), {
      mac: true,
      windows: true,
    });
  });

  it("uses stable installer filenames for browser downloads", () => {
    assert.equal(
      desktopSoftphoneDownloadFilename("mac"),
      "iD30-Softphone-macOS-arm64.zip",
    );
    assert.equal(
      desktopSoftphoneDownloadFilename("windows"),
      "iD30-Softphone-Windows-x64.exe",
    );
    assert.equal(desktopSoftphoneDownloadFilename("linux"), null);
  });
});
