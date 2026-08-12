import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { defaultDesktopSoftphoneMacDownloadUrl } from "@/lib/desktop-softphone/downloads";

const script = `#!/bin/bash
set -euo pipefail

APP_NAME="iD30 Softphone.app"
ARCH="$(uname -m)"

if [ "$ARCH" != "arm64" ]; then
  echo "This installer currently supports Apple Silicon Macs only."
  echo "Detected architecture: $ARCH"
  echo "Ask your iD30 admin for the Intel Mac installer."
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Downloading iD30 Softphone..."
curl -fL "${defaultDesktopSoftphoneMacDownloadUrl}" -o "$TMP_DIR/softphone.zip"

echo "Unpacking..."
ditto -x -k "$TMP_DIR/softphone.zip" "$TMP_DIR/unpacked"
APP_SOURCE="$(find "$TMP_DIR/unpacked" -maxdepth 2 -name "$APP_NAME" -type d | head -n 1)"

if [ -z "$APP_SOURCE" ]; then
  echo "Could not find $APP_NAME in the downloaded package."
  exit 1
fi

INSTALL_DIR="/Applications"
if [ ! -w "$INSTALL_DIR" ]; then
  INSTALL_DIR="$HOME/Applications"
  mkdir -p "$INSTALL_DIR"
fi

APP_TARGET="$INSTALL_DIR/$APP_NAME"

echo "Installing to $APP_TARGET..."
rm -rf "$APP_TARGET"
ditto "$APP_SOURCE" "$APP_TARGET"

echo "Preparing app for this Mac..."
xattr -dr com.apple.quarantine "$APP_TARGET" 2>/dev/null || true
xattr -cr "$APP_TARGET" 2>/dev/null || true
codesign --force --deep --sign - "$APP_TARGET" >/dev/null 2>&1 || true

echo "Launching iD30 Softphone..."
open "$APP_TARGET"

echo "Done."
`;

export async function GET() {
  await requireUser();

  return new NextResponse(script, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="install-id30-softphone-macos.sh"',
      "Content-Type": "text/x-shellscript; charset=utf-8",
    },
  });
}
