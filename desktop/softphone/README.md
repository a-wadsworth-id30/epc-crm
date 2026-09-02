# iD30 Softphone Desktop

Small Electron wrapper for the iD30 CRM softphone.

The app loads:

```text
https://crm[.]epc-improvements[.]co[.]uk/softphone-window
```

It keeps the softphone outside the browser so agents can switch tabs without
losing access to the phone UI.

## Development

```bash
cd desktop/softphone
npm install
npm start
```

Use `ID30_SOFTPHONE_URL` to point the wrapper at another CRM environment:

```bash
ID30_SOFTPHONE_URL=http://localhost:3001/softphone-window npm start
```

## Controls

- `Compact` resizes the desktop app and minimises the web softphone.
- `Expand` restores the full desktop softphone window.
- `Pin` toggles always-on-top.
- `CRM` opens the full CRM in the default browser.

The app also adds native menu and tray controls for the same actions.

## Packaging

```bash
npm run make:mac
npm run make:win
```

The current macOS maker creates a ZIP app bundle. The Windows maker creates a
Squirrel installer. On macOS, Windows installer creation requires Wine and Mono,
so the repeatable release path is the GitHub Actions workflow below.

## Release Workflow

Run the `Desktop Softphone Release` GitHub Actions workflow, or push a tag:

```bash
git tag desktop-softphone-v0.1.12
git push origin desktop-softphone-v0.1.12
```

Required GitHub repository variable:

```text
DESKTOP_SOFTPHONE_PUBLIC_BASE_URL=https://<public-download-domain>/desktop-softphone
```

Required GitHub Actions secrets:

```text
DESKTOP_SOFTPHONE_R2_ACCOUNT_ID
DESKTOP_SOFTPHONE_R2_ACCESS_KEY_ID
DESKTOP_SOFTPHONE_R2_SECRET_ACCESS_KEY
DESKTOP_SOFTPHONE_R2_BUCKET
```

Optional Windows signing secrets:

```text
DESKTOP_SOFTPHONE_WINDOWS_CERTIFICATE_BASE64
DESKTOP_SOFTPHONE_WINDOWS_CERTIFICATE_PASSWORD
DESKTOP_SOFTPHONE_WINDOWS_SIGN_WITH_PARAMS
```

Unsigned Windows installers can trigger Chrome/SmartScreen warnings. Add either
a base64-encoded `.pfx` certificate plus password, or SignTool parameters for a
hardware-token/cloud signing provider, before wider Windows rollout.

Optional repository variable:

```text
DESKTOP_SOFTPHONE_R2_PREFIX=desktop-softphone
```

The workflow uploads:

```text
latest/iD30-Softphone-macOS-arm64.zip
latest/iD30-Softphone-Windows-x64.exe
versions/<version>/...
updates/darwin/arm64/...
updates/win32/x64/...
```

The publish step sets `Content-Disposition` metadata on `latest` and `versions`
installer downloads so browsers use stable filenames.
To repair metadata on already-published objects without rebuilding installers,
run the workflow manually with `repair_metadata_only=true`, or push a metadata
repair tag for the current package version:

```bash
git tag desktop-softphone-metadata-v0.1.28
git push origin desktop-softphone-metadata-v0.1.28
```

Set the CRM runtime env var to activate the settings-page download buttons:

```text
ID30_SOFTPHONE_DOWNLOAD_BASE_URL=https://<public-download-domain>/desktop-softphone
```

## Updates

Packaged builds check for updates at startup and then every 15 minutes.

Packaged release builds use the public update URL baked into
`src/release-config.json` by the release workflow:

```text
{DESKTOP_SOFTPHONE_PUBLIC_BASE_URL}/updates
```

Required assets:

- macOS: the `darwin/<arch>` ZIP produced by `npm run make:mac`.
- Windows: the Squirrel `.exe`, `.nupkg` and `RELEASES` files produced by
  `npm run make:win`.

Automatic update install requirements:

- macOS builds must be code-signed before wider rollout.
- GitHub release must not be draft or prerelease.
- The app version in `desktop/softphone/package.json` must be higher than the
  installed app.

Environment overrides:

```bash
ID30_DISABLE_AUTO_UPDATE=1 npm start
ID30_UPDATE_REPO=owner/repo npm start
ID30_UPDATE_BASE_URL=https://updates.example.com/id30-softphone npm start
```

`ID30_UPDATE_BASE_URL` should use the update-electron-app static layout:

```text
{baseUrl}/darwin/arm64/...
{baseUrl}/win32/x64/...
```
