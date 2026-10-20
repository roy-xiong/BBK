import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// 将当前Android游戏视图交给原生后台计时器。其他平台保持现有生命周期。
class GameBackgroundExecutionService {
  static const _channel = MethodChannel('com.xiongjian.bbkclassics/window');

  /// 先完成WebView创建再绑定，并在loadRequest前安装JS桥，不重启或替换游戏引擎。
  static Future<void> attach(WebViewController controller, String title) async {
    final platform = controller.platform;
    if (kIsWeb ||
        defaultTargetPlatform != TargetPlatform.android ||
        platform is! AndroidWebViewController) {
      return;
    }
    try {
      await _channel.invokeMethod<bool>(
        'attachBackgroundGame',
        <String, Object>{
          'webViewId': platform.webViewIdentifier,
          'title': title,
        },
      );
    } on PlatformException catch (error) {
      debugPrint('GameBackgroundExecution: ${error.code}');
    } on MissingPluginException {
      debugPrint('GameBackgroundExecution: native host unavailable');
    }
  }

  /// 使用原视图ID释放，避免快速切换游戏时旧页面销毁请求关闭新会话。
  static Future<void> detach(WebViewController? controller) async {
    final platform = controller?.platform;
    if (kIsWeb ||
        defaultTargetPlatform != TargetPlatform.android ||
        platform is! AndroidWebViewController) {
      return;
    }
    try {
      await _channel.invokeMethod<void>(
        'detachBackgroundGame',
        <String, Object>{'webViewId': platform.webViewIdentifier},
      );
    } on PlatformException catch (error) {
      debugPrint('GameBackgroundExecution: ${error.code}');
    } on MissingPluginException {
      debugPrint('GameBackgroundExecution: native host unavailable');
    }
  }
}
