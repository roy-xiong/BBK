#!/usr/bin/env bash
# 校验Flutter Release APK并复制到独立交付目录，不读取或上传发布签名材料。
set -euo pipefail
package_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$package_root"
package_apk="${1:-build/app/outputs/flutter-apk/app-release.apk}"
package_dist="${2:-dist}"
test -f "$package_apk"
unzip -tq "$package_apk"
package_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$package_sdk" && -f android/local.properties ]]; then
  package_sdk="$(sed -n 's/^sdk.dir=//p' android/local.properties)"
fi
package_signer="${package_sdk}/build-tools/36.0.0/apksigner"
test -x "$package_signer"
"$package_signer" verify "$package_apk"
mkdir -p "$package_dist"
cp "$package_apk" "$package_dist/三国霸业-Android.apk"
python3 - "$package_dist" <<'PY'
from pathlib import Path
import hashlib,sys
folder=Path(sys.argv[1]);p=folder/'三国霸业-Android.apk'
(folder/'三国霸业-Android.apk.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n')
print('Android包已校验：'+str(p))
PY
