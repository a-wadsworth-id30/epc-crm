const shouldSignMac =
  process.platform === "darwin" &&
  Boolean(
    process.env.MACOS_CODESIGN_IDENTITY ||
      process.env.ID30_SOFTPHONE_MACOS_SIGN === "true",
  );
const shouldNotarizeMac =
  shouldSignMac &&
  (Boolean(process.env.APPLE_API_KEY_PATH) ||
    Boolean(process.env.APPLE_ID_PASSWORD));
const shouldBuildMacPkg =
  process.platform === "darwin" &&
  process.env.ID30_SOFTPHONE_BUILD_MAC_INSTALLER === "true";

function notarizeConfig() {
  if (!shouldNotarizeMac) return undefined;

  if (process.env.APPLE_API_KEY_PATH) {
    return {
      appleApiKey: process.env.APPLE_API_KEY_PATH,
      appleApiKeyId: process.env.APPLE_API_KEY_ID,
      appleApiIssuer: process.env.APPLE_API_ISSUER,
    };
  }

  return {
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  };
}

const makers = [
  {
    name: "@electron-forge/maker-zip",
    platforms: ["darwin"],
  },
  {
    name: "@electron-forge/maker-squirrel",
    platforms: ["win32"],
    config: {
      name: "id30_softphone",
    },
  },
];

if (shouldBuildMacPkg) {
  makers.push({
    name: "@electron-forge/maker-pkg",
    platforms: ["darwin"],
    config: {
      identity: process.env.MACOS_INSTALLER_IDENTITY,
      name: "iD30-Softphone-macOS",
    },
  });
}

module.exports = {
  packagerConfig: {
    name: "iD30 Softphone",
    executableName: "id30-softphone",
    appBundleId: "com.id30.softphone",
    appCategoryType: "public.app-category.business",
    icon: "./assets/icon",
    asar: true,
    osxSign: shouldSignMac
      ? {
          identity: process.env.MACOS_CODESIGN_IDENTITY,
          hardenedRuntime: true,
          gatekeeperAssess: false,
          entitlements:
            process.env.MACOS_ENTITLEMENTS_PATH ||
            "./build/entitlements.mac.plist",
          entitlementsInherit:
            process.env.MACOS_ENTITLEMENTS_PATH ||
            "./build/entitlements.mac.plist",
        }
      : false,
    osxNotarize: notarizeConfig(),
    extendInfo: {
      CFBundleURLTypes: [
        {
          CFBundleURLName: "iD30 Softphone",
          CFBundleURLSchemes: ["id30-softphone"],
        },
      ],
    },
  },
  makers,
};
