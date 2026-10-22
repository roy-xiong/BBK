# 三国霸业 Flutter

独立的纯 Dart / Flutter 版本。以当前同级 bbk 仓库的「原版精修 4X」为基准，保留当前规则与增强功能，文字采用 Android 参考手机采集的固定字模。

游戏画面在 240×144 逻辑坐标中绘制为 960×576 帧缓冲，再由 Flutter 按最近邻显示。游戏运行时使用 Dart 资源解析、规则、AI、战斗和存档，原始 LIB 中的脚本不参与执行。Android Kotlin 仅提供手柄输入与屏幕常亮通道。

已接入开场与选局、四时期君主选择、内政/人事/外交/军事、月度 AI 与环境、出征及守城选将、交互战斗、计谋、五种战后结局、继承与游戏胜负、存档和备份恢复，以及自动战斗/自动策略、倍速、查询、地图显示、搜索及作弊增强。53 项对应关系在 `tool/baseline/feature_matrix.json`。

## 代码

- `lib/engine/resources/`：LIB、图片、动画、固定 Android 字库和 GBK。
- `lib/domain/`：世界数据、原版随机源使用、策略和战斗规则、增强规则。
- `lib/engine/core/`：输入、菜单、原版动画时钟和可暂停流程。
- `lib/engine/rendering/`：原始像素绘制与势力/路线/人数显示。
- `lib/data/`：资产解析、平台薄桥、版本化 JSON 存档与备份。
- `lib/ui/`：Flutter 页面、控制按钮、查询与作弊面板、生命周期。
- `test/fixtures/`：由固定版本旧内核独立采集的规则快照与原始 RGBA 参考帧。
- `tool/reference/`：开发阶段的旧内核采集工具，不属于 Flutter 应用资产。

## 验证

2026-10-22：`dart analyze` 无问题；`flutter test --no-pub --reporter expanded` 217 项通过。23 个整帧样本逐像素比较为零差异（闪烁元素对齐完整帧相位，全部像素参与比较）；另有四时期开局、12 个月环境、20 组 AI、30 组命令、36 组普通攻击、32 组计谋、战场初始化/敌方决策、20 组战后结局及 9 组增强规则的旧内核快照对照。

```sh
flutter pub get --offline
dart analyze
flutter test --no-pub
```

可选导出像素测试实际绘制的 PNG：

```sh
SGBY_EXPORT_FRAMES=.dart_tool/validation_frames flutter test --no-pub test/engine/pixel_parity_test.dart test/engine/extended_pixel_parity_test.dart test/engine/battle_pixel_parity_test.dart
```

Android Release 已完成本地构建、签名与资源校验；macOS/iOS 已配置云打包。尚未安装或运行新应用；物理手柄、震动、方向切换、常亮与连续真机游戏未验收。23 个静态场景不代表所有战局及动画时序的穷举一致性。

原生存档独立保存在应用支持目录的 `sgby_native/`，读取四档、手动保存三档；主文件损坏可恢复最近有效备份。旧 H5/C 引擎的二进制存档目前不直接导入。界面不允许在月度结算或战斗中保存半完成的回合。

源版本、资源哈希、字体哈希及验证记录见 `tool/baseline/`。iBaye 来源与 MIT 许可保留在 `licenses/ibaye-MIT.txt`；参考仓库为 https://gitee.com/bgwp/iBaye ，参考提交 `62241e294f3ba3d4589d6e1205e6deb486a6c2d9`，并使用同级 bbk 中的 AI 活跃度补丁。

## 三平台打包

参照 BBK 云构建固定 Flutter 3.44.4、NDK 27.2.12479018 和 Android minSdk 24。
GitHub Actions 入口：`.github/workflows/packages.yml`，可选择全部平台或单个平台。

- Android：Release 通用 APK，当前使用与本机 BBK 相同的测试签名方式。
- macOS：arm64/x86_64 通用应用、ad-hoc签名、ZIP 与 DMG 校验。
- iOS：设备 arm64 Release 未签名 IPA，安装前需要重签名。

`tool/package_android.sh`、`tool/package_macos.sh` 和 `tool/package_ios_unsigned.sh`
负责验证并封装已有构建结果，默认输出到 `dist/`，每种产物附有 SHA-256。
