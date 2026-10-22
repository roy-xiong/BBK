#!/usr/bin/env bash
# 参照bbk封装设备Release构建；产物需要由使用者自行重签名后安装。
set -euo pipefail
package_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$package_root"
package_app="${1:-build/ios/iphoneos/Runner.app}"
package_dist="${2:-dist}"
test -f "$package_app/Runner"
test -f "$package_app/Info.plist"
test -d "$package_app/Frameworks/Flutter.framework"
test -d "$package_app/Frameworks/App.framework"
package_executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$package_app/Info.plist")"
lipo "$package_app/$package_executable" -verify_arch arm64
mkdir -p "$package_dist"
package_staging="$(mktemp -d "${TMPDIR:-/tmp}/sgby-ios-unsigned-XXXXXX")"
trap 'rm -rf "$package_staging"' EXIT
mkdir -p "$package_staging/Payload"
ditto "$package_app" "$package_staging/Payload/Runner.app"
ditto -c -k --sequesterRsrc --keepParent "$package_staging/Payload" "$package_dist/三国霸业-iOS-unsigned.ipa"
unzip -tq "$package_dist/三国霸业-iOS-unsigned.ipa"
python3 - "$package_dist" <<'PY'
from pathlib import Path
import hashlib,sys
folder=Path(sys.argv[1]);p=folder/'三国霸业-iOS-unsigned.ipa'
(folder/'三国霸业-iOS-unsigned.ipa.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n')
print('未签名IPA已生成：'+str(p))
PY
