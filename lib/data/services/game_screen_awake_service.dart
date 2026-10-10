import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// 游戏窗口的屏幕常亮控制。
///
/// 只请求当前 Android Activity 保持屏幕点亮，不修改系统自动锁屏时间，
/// 不持有 Context，也不创建后台 WakeLock。页面退出和 Activity 暂停会释放常亮。
class GameScreenAwakeService {
  static const MethodChannel _channel = MethodChannel(
    'com.xiongjian.bbkclassics/window',
  );

  /// 在游戏进入、恢复或退出时同步常亮状态。
  ///
  /// 调用按 Dart 主隔离区的提交顺序发送，避免进入和退出的请求并发覆盖。
  /// 平台通道不可用时捕获异常，保持游戏页面的正常生命周期。
  static Future<void> setEnabled(bool enabled) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _channel.invokeMethod<void>('setKeepScreenOn', <String, Object>{
        'enabled': enabled,
      });
    } on PlatformException catch (error) {
      debugPrint('GameScreenAwake: ${error.code}');
    } on MissingPluginException {
      debugPrint('GameScreenAwake: Android window channel unavailable');
    }
  }
}
