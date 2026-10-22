#!/bin/bash
# 仅发布本次流水线的平台安装包，不把WASM、中间文件和Debug验证包混进Release。
set -euo pipefail
case "${BBK_PLATFORM:-all}" in
  all|macos-android|android|macos|windows|ios) ;;
  *) echo 'Unsupported build platform'; exit 1 ;;
esac
bbk_release_tag="${BBK_RELEASE_TAG:-}"
if [ -z "$bbk_release_tag" ]; then
  bbk_release_tag="preview-${BBK_PLATFORM:-all}"
  if [ "${BBK_PLATFORM:-all}" = all ]; then bbk_release_tag=preview; fi
fi
[[ "$bbk_release_tag" =~ ^[a-z0-9-]+$ ]]
mkdir -p dist
for bbk_platform in android macos ios windows; do
  bbk_directory="artifacts/bbk-$bbk_platform"
  if [ -d "$bbk_directory" ]; then cp "$bbk_directory"/* dist/; fi
done
test -n "$(find dist -type f -name '*.sha256' -print -quit)"
(cd dist && sha256sum --check ./*.sha256)

bbk_notes="$RUNNER_TEMP/bbk-release-notes.md"
cp tool/release-notes.md "$bbk_notes"
printf '\n构建编号：%s\n\n源码提交：%s\n\n[查看构建记录](%s/%s/actions/runs/%s)\n' \
  "$BBK_BUILD_NUMBER" "$GITHUB_SHA" "$GITHUB_SERVER_URL" "$GITHUB_REPOSITORY" "$GITHUB_RUN_ID" >> "$bbk_notes"
if ! gh release view "$bbk_release_tag" >/dev/null 2>&1; then
  gh release create "$bbk_release_tag" --prerelease --target "$GITHUB_SHA" \
    --title "BBK ${BBK_PLATFORM:-all} 测试版 · Build $BBK_BUILD_NUMBER" --notes-file "$bbk_notes"
fi
# 已有tag也同步到当前提交，避免Release新包对应的下载源码仍是旧版。
gh api --method PATCH "repos/$GITHUB_REPOSITORY/git/refs/tags/$bbk_release_tag" -f sha="$GITHUB_SHA" -F force=true
gh release edit "$bbk_release_tag" --target "$GITHUB_SHA" \
  --title "BBK ${BBK_PLATFORM:-all} 测试版 · Build $BBK_BUILD_NUMBER" --notes-file "$bbk_notes"
gh release upload "$bbk_release_tag" dist/* --clobber
printf '[下载安装包](%s/%s/releases/tag/%s)\n' "$GITHUB_SERVER_URL" "$GITHUB_REPOSITORY" "$bbk_release_tag" >> "$GITHUB_STEP_SUMMARY"
