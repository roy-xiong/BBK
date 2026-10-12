import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// 游戏窗口的屏幕常亮控制。
///
/// Android使用当前Activity窗口标志，iOS使用前台idleTimer；不修改系统设置。
/// 原生侧按前台状态收敛请求，页面退出或应用进入后台时释放常亮。
class GameScreenAwakeService {
  static const MethodChannel _channel = MethodChannel(
    'com.xiongjian.bbkclassics/window',
  );

  /// 在游戏进入、恢复或退出时同步常亮状态。
  ///
  /// 调用按 Dart 主隔离区的提交顺序发送，避免进入和退出的请求并发覆盖。
  /// 平台通道不可用时捕获异常，保持游戏页面的正常生命周期。
  static Future<void> setEnabled(bool enabled) async {
    if (kIsWeb ||
        (defaultTargetPlatform != TargetPlatform.android &&
            defaultTargetPlatform != TargetPlatform.iOS)) {
      return;
    }
    try {
      await _channel.invokeMethod<void>('setKeepScreenOn', <String, Object>{
        'enabled': enabled,
      });
    } on PlatformException catch (error) {
      debugPrint('GameScreenAwake: ${error.code}');
    } on MissingPluginException {
      debugPrint('GameScreenAwake: window channel unavailable');
    }
  }
}
