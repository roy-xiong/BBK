#!/bin/bash
# 封装可拖入 Applications 的 DMG；自用 beta 使用构建时的本地签名，不访问 Apple 账号。
set -euo pipefail
beta_app="build/macos/Build/Products/Release/BBK.app"
beta_staging="$(mktemp -d "${TMPDIR:-/tmp}/bbk-macos-beta-XXXXXX")"
trap 'rm -rf "$beta_staging"' EXIT
mkdir -p build/beta
ditto "$beta_app" "$beta_staging/BBK.app"
ln -s /Applications "$beta_staging/Applications"
hdiutil create -volname 'BBK Beta' -srcfolder "$beta_staging" -ov -format UDZO build/beta/BBK-macos-beta.dmg
