# 旧内核参考采集

这些脚本只在开发电脑上运行，用当前同级 `bbk` 的旧内核生成独立对照数据。它们不属于 `assets/`，不被 Flutter 应用导入，也不随游戏运行。

除手机字模采集外，脚本启动本机 Chrome，在临时本地 HTTP 服务中运行旧仓库已有的 WASM，不构建新应用。采集前会校验 `tool/baseline/source_manifest.json` 中的源文件哈希；版本变化时停止覆盖参考数据。

需要可用的 Node、Playwright 和 Chrome。可以指定已有 Playwright 模块、参考仓库与 Chrome 路径：

```sh
export SGBY_PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright
export SGBY_REFERENCE_REPO=/absolute/path/to/bbk
export SGBY_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node tool/reference/capture_pixels_battle.cjs
```

各脚本的输出均位于 `test/fixtures/`。它们会覆盖对应金图或元数据，更新基线后应检查源版本、差异和新采样内容，不能用 Dart 渲染结果反向生成旧内核金图。

| 脚本 | 对照对象 |
|---|---|
| `capture_oracle.cjs` | 四时期开局、精修配置和人物资源 |
| `capture_calendar.cjs` | 12个月环境变化 |
| `capture_ai.cjs` | 5档世界活跃度、4种随机种子 |
| `capture_orders.cjs` | 10类命令、3种随机种子 |
| `capture_cheats.cjs` | 9组增强操作 |
| `capture_battle.cjs` | 战场初始化 |
| `capture_battle_enemy.cjs` | 敌军选择、移动与寻路 |
| `capture_attack.cjs` | 6×6兵种普通攻击 |
| `capture_skills.cjs` | 30种有效计谋和两个失败分支 |
| `capture_battle_resolution.cjs` | 五类结局、胜败与逃生路线 |
| `capture_pixels.cjs` | 主菜单、时期、君主、战略和城市界面 |
| `capture_pixels_extended.cjs` | 精修帮助、人物报告、选择表和存档页 |
| `capture_pixels_battle.cjs` | 战场、详情、形势图与菜单 |

像素参考保留原始 `.rgba.gz`。PNG 通过 `reference_support.cjs` 从同一份 RGBA 生成，避免调用浏览器截图时动画已推进，导致截图与比较数据不是同一帧。旧页面可因缺少 favicon 返回404；该资源不参与游戏渲染。

`capture_android_font.cjs` 仅连接 `127.0.0.1:50716` 的 CDP，筛选 `/sgby/` 页面并调用当前 `fontImageForChar` Hook，采集原应用 4X 字形。使用前需要把实际游戏进程的 WebView 调试 socket 转发到该端口；脚本不会启动应用、点击界面、修改存档或改变字体设置。扩展内码 A2FD/A2FE 也会采集。
