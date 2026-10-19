#!/bin/bash
# 从仓库内的固定上游源码还原引擎；本脚本仅解包、应用补丁，不执行编译。
set -euo pipefail
sgby_repository="$(cd "$(dirname "$0")/.." && pwd)"
sgby_directory="${1:-build/sgby-engine}"
sgby_archive="$sgby_repository/third_party/ibaye/upstream-62241e2.tar.gz"
sgby_expected="3779320ae2b45179494be507a1c303c21518e9df7f445aa557e1cf0265566048"
sgby_actual="$(shasum -a 256 "$sgby_archive" | cut -d ' ' -f 1)"
test "$sgby_actual" = "$sgby_expected"
# 目标必须是新目录，避免在已有源码上重复应用补丁或覆盖其他工作。
test ! -e "$sgby_directory"
mkdir -p "$sgby_directory"
tar -xzf "$sgby_archive" -C "$sgby_directory"
patch -s -p1 -d "$sgby_directory" < "$sgby_repository/third_party/ibaye/ai-world-activity.patch"
echo "三国霸业引擎源码已准备：$sgby_directory"
