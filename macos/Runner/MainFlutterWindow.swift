import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    self.contentViewController = flutterViewController
    // 默认采用接近 iPhone 的竖屏内容比例。使用内容尺寸而非含标题栏的 frame，
    // 同时按当前屏幕可用高度收敛，避免较小屏幕上窗口超出可见范围。
    // 最小宽度保留完整工具栏空间，允许玩家自由调整宽高；不锁定窗口纵横比。
    // Flutter 的 LayoutBuilder 继续按真实内容宽高切换竖屏/横屏操作面板。
    self.contentMinSize = NSSize(width: 360, height: 540)
    let visibleHeight = self.screen?.visibleFrame.height
      ?? NSScreen.main?.visibleFrame.height ?? 900
    let contentHeight = min(CGFloat(844), max(CGFloat(540), visibleHeight - 72))
    let contentWidth = max(CGFloat(360), contentHeight * 390 / 844)
    self.setContentSize(NSSize(width: contentWidth, height: contentHeight))
    self.center()
    self.title = "步步高经典游戏"

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()
  }
}
