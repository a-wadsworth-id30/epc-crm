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
const defaultCrmOrigin = ["https://crm", "epc-improvements.co.uk"].join(".");
const windowsCertificateFile =
  process.env.WINDOWS_CERTIFICATE_FILE ||
  process.env.ID30_SOFTPHONE_WINDOWS_CERTIFICATE_FILE;
const windowsCertificatePassword =
  process.env.WINDOWS_CERTIFICATE_PASSWORD ||
  process.env.ID30_SOFTPHONE_WINDOWS_CERTIFICATE_PASSWORD;
const windowsSignWithParams =
  process.env.WINDOWS_SIGN_WITH_PARAMS ||
  process.env.ID30_SOFTPHONE_WINDOWS_SIGN_WITH_PARAMS;
const shouldSignWindows =
  process.platform === "win32" &&
  Boolean(windowsCertificateFile || windowsSignWithParams);

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

function windowsSignConfig() {
  if (!shouldSignWindows) return undefined;

  return {
    ...(windowsCertificateFile
      ? { certificateFile: windowsCertificateFile }
      : {}),
    ...(windowsCertificatePassword
      ? { certificatePassword: windowsCertificatePassword }
      : {}),
    ...(windowsSignWithParams ? { signWithParams: windowsSignWithParams } : {}),
    description: "iD30 Softphone",
    timestampServer:
      process.env.WINDOWS_TIMESTAMP_SERVER ||
      process.env.ID30_SOFTPHONE_WINDOWS_TIMESTAMP_SERVER ||
      "http://timestamp.digicert.com",
    website: defaultCrmOrigin,
  };
}

const windowsSign = windowsSignConfig();

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
      ...(windowsSign
        ? {
            windowsSign,
            ...(windowsCertificateFile
              ? { certificateFile: windowsCertificateFile }
              : {}),
            ...(windowsCertificatePassword
              ? { certificatePassword: windowsCertificatePassword }
              : {}),
            ...(windowsSignWithParams
              ? { signWithParams: windowsSignWithParams }
              : {}),
          }
        : {}),
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
    ...(windowsSign ? { windowsSign } : {}),
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
