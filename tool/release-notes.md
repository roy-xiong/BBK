离线运行《伏魔记》《金庸群侠传》和《三国霸业》的 BBK 测试版。

- Android：下载 `BBK-Android.apk`。未配置仓库正式签名时使用云端专用测试证书，无法直接覆盖其他证书签名的旧版；请保留原签名或在安装前备份存档。缓存被清理后测试证书可能重新生成。
- macOS：下载 `BBK-macOS-universal.dmg` 或 `BBK-macOS-universal.zip`，支持 Intel 和 Apple Silicon；采用 ad-hoc 签名，未做 Apple 公证。
- Windows：下载 `BBK-Windows-x64-portable.zip`，解压整个目录后运行 EXE；保留 `data`、DLL 和 `WebView2` 的相对位置。
- iOS：下载 `BBK-iOS-unsigned.ipa`，用自己的 Apple 证书和描述文件签名后安装。

每个安装包附有 SHA-256 校验文件。单平台或组合构建只包含所选平台；平台编译通过不等于已完成全部设备与游戏流程验证。
