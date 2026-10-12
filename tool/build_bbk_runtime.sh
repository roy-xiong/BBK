#!/bin/bash
# 手动构建 Android 原机运行时；Gradle 在用户发起构建时调用，编辑代码不执行此脚本。
set -euo pipefail
task_project_dir="$(cd "$(dirname "$0")/.." && pwd)"
task_output_dir="${1:?需要传入 JNI 输出目录}"
task_ndk_dir="${2:?需要传入 Android NDK 目录}"
task_cargo="${BBK_CARGO:-$HOME/.cargo/bin/cargo}"
if [ ! -x "$task_cargo" ]; then
  task_cargo="$(command -v cargo || true)"
fi
if [ -z "$task_cargo" ] || [ ! -x "$task_cargo" ]; then
  echo 'BBK原机运行时需要 Rust 1.99.0，请先使用 rustup 安装该工具链。' >&2
  exit 1
fi
task_ndk_host=""
for task_candidate in "$task_ndk_dir"/toolchains/llvm/prebuilt/*; do
  if [ -d "$task_candidate/bin" ]; then task_ndk_host="$task_candidate"; break; fi
done
if [ -z "$task_ndk_host" ]; then
  echo '未找到 Android NDK LLVM 工具链，请核对 Gradle 配置的 NDK 目录。' >&2
  exit 1
fi
export CARGO_TARGET_DIR="$task_project_dir/build/bbk-rust-target"
export PATH="$(dirname "$task_cargo"):$PATH"
cd "$task_project_dir/third_party/bbkemu"
while read -r task_abi task_target task_clang; do
  task_linker_variable="CARGO_TARGET_$(echo "$task_target" | tr '[:lower:]-' '[:upper:]_')_LINKER"
  task_flags_variable="CARGO_TARGET_$(echo "$task_target" | tr '[:lower:]-' '[:upper:]_')_RUSTFLAGS"
  export "$task_linker_variable=$task_ndk_host/bin/${task_clang}24-clang"
  # NDK 27 + 16KiB ELF 对齐，兼容采用 16KiB 内存页的 Android 设备。
  export "$task_flags_variable=-C link-arg=-Wl,-z,max-page-size=16384"
  "$task_cargo" build -p bbkemu-android --target "$task_target" --release --locked
  mkdir -p "$task_output_dir/$task_abi"
  cp "$CARGO_TARGET_DIR/$task_target/release/libbbk_runtime.so" "$task_output_dir/$task_abi/libbbk_runtime.so"
done <<'BBK_TARGETS'
arm64-v8a aarch64-linux-android aarch64-linux-android
armeabi-v7a armv7-linux-androideabi armv7a-linux-androideabi
x86_64 x86_64-linux-android x86_64-linux-android
x86 i686-linux-android i686-linux-android
BBK_TARGETS
