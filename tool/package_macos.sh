#!/usr/bin/env bash
# 创建通用macOS测试包，保留沙盒权限并校验ad-hoc签名及磁盘镜像。
set -euo pipefail
package_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$package_root"
package_app="${1:-build/macos/Build/Products/Release/三国霸业.app}"
package_dist="${2:-dist}"
test -d "$package_app"
package_executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$package_app/Contents/Info.plist")"
lipo "$package_app/Contents/MacOS/$package_executable" -verify_arch arm64 x86_64
codesign --force --deep --sign - --entitlements macos/Runner/Release.entitlements "$package_app"
codesign --verify --deep --strict "$package_app"
mkdir -p "$package_dist"
ditto -c -k --sequesterRsrc --keepParent "$package_app" "$package_dist/三国霸业-macOS-universal.zip"
package_staging="$(mktemp -d "${TMPDIR:-/tmp}/sgby-macos-XXXXXX")"
trap 'rm -rf "$package_staging"' EXIT
ditto "$package_app" "$package_staging/三国霸业.app"
ln -s /Applications "$package_staging/Applications"
hdiutil create -volname 三国霸业 -srcfolder "$package_staging" -ov -format UDZO "$package_dist/三国霸业-macOS-universal.dmg"
hdiutil verify "$package_dist/三国霸业-macOS-universal.dmg"
python3 - "$package_dist" <<'PY'
from pathlib import Path
import hashlib,sys
folder=Path(sys.argv[1]);paths=[folder/'三国霸业-macOS-universal.zip',folder/'三国霸业-macOS-universal.dmg']
(folder/'三国霸业-macOS.sha256').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n'for p in paths))
print('macOS通用ZIP与DMG已生成：'+str(folder))
PY
