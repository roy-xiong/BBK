# 第三方代码与资源

本项目内置以下上游项目的代码与运行资源：

- EmulatorJS 4.2.3：https://github.com/EmulatorJS/EmulatorJS
  - npm：`@emulatorjs/emulatorjs@4.2.3`，GPL-3.0，原始文件见 `third_party/emulatorjs/LICENSE`。
  - 前端包 SHA-256：`8033a18a3398cae5efd7a4c12a633b10672435977290959633d671365b589639`。
  - 固定版本适配层：`assets/games/emulator/emulator-host.js`。禁用远程更新/浏览器 ROM 缓存，存档写入 BBK。
- EmulatorJS FCEUmm 4.2.3：https://github.com/EmulatorJS/libretro-fceumm
  - npm：`@emulatorjs/core-fceumm@4.2.3`，包 SHA-256：`72d7ec8a1cace14448b9f2e177e64a37120543e117d274072b02b67576d54025`。
  - GPL-2.0，内核包自带许可证原文见 `third_party/emulatorjs/FCEUMM-LICENSE`。
- EmulatorJS FBNeo 4.2.3：https://github.com/EmulatorJS/FBNeo
  - npm：`@emulatorjs/core-fbneo@4.2.3`，包 SHA-256：`1b7a35a2123d66f30b58650b6de4fff5e115673aab3eabe23a207aa7c547da32`。
  - 仅内置单线程 WebGL 1/2 运行包；内核包自带完整许可（含非商业限制）见 `third_party/emulatorjs/FBNEO-LICENSE`。
  - ROM/BIOS 由用户放入共享存储 BBK，仓库与 APK 不包含任何 NES/街机 ROM 或 BIOS。
  - `fbneo-romsets.json`：官方 FBNeo Arcade DAT 的名称/父档与随包 WASM 字符串交集，不包含 ROM 数据，也不作为 CRC 兼容性承诺。生成器见 `tool/generate_fbneo_catalog.mjs`。

- iBaye: https://gitee.com/bgwp/iBaye
  - 固定基线：`62241e294f3ba3d4589d6e1205e6deb486a6c2d9`
  - 本地世界活跃度补丁：`third_party/ibaye/ai-world-activity.patch`
  - 许可证：MIT，全文见 `third_party/ibaye/LICENSE`
- baye-alpha: https://gitee.com/bgwp/baye-alpha
  - 固定基线：`5d19e8fd5828547cfd6dc310e3c6d27429d37de9`
  - 许可证：GPL-2.0，全文见 `third_party/baye_alpha/LICENSE`
- fmj.kt: https://gitee.com/bgwp/fmj.kt
  - 固定基线：`3d5f6a40ad2e58ae9ebedf5d6a239f2d263e8a05`
  - 许可证：GPL-2.0，全文见 `third_party/fmj/LICENSE`
- 伏魔记 Web 编译产物：https://gitee.com/bgwp/fm
  - 固定基线：`3bdf4200885923659c82c5d5a8bcc811e0699c87`
  - 引擎对应源码和 GPL-2.0 许可证见上面的 `fmj.kt` 条目。
- 步步高《金庸群侠传》原版数据：https://github.com/wengxianxun/bbk.emu
  - 固定基线：`09391d87fb07184c16d8df23f81822daa7aa241f`
  - 路径：`www/金庸群侠传/js/rom.js`
  - 文件 SHA-256：`93b960c0ea2d154942357ed2b79b6ee69213da7f93a3691364607d00ee49af16`
  - 解码 DAT.LIB：638,976 字节，SHA-256：`25d5535d4302b73adda5f2f01614c99fe07bb225c1c0e891bdab3a1795a6c867`
  - 数据与 `zzxzzk115/BBKGames_GameShell` 基线 `f6720edcf9568b574a122b40f6e8af290501df09` 中的副本一致。
  - 本次按个人自用接入；数据仓库没有独立再发行许可证声明。
  - 运行时、字库和基础 UI 复用现有 `fmj.kt` 产物，不引入候选仓库的安装脚本、图标或平台包装。
  - 本地新增地图生成器、剧情/门派任务、独立存档桥、选关和全灭自动攻击兼容层。

原游戏美术、文字、字体和数据文件可能具有独立版权。公开发行或商业使用前，需要由
发行方自行确认相关资源授权。本文件不构成法律意见。
