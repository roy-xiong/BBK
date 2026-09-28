import 'dart:async';

import 'package:flutter/services.dart';

import '../../domain/models/game_definition.dart';

/// Android 原生手柄事件接收器。
///
/// EventChannel 没有可用实现时静默降级，屏幕按键仍可正常操作游戏。
class GameControllerService {
  static const EventChannel _eventChannel = EventChannel(
    'com.xiongjian.bbkclassics/gamepad_events',
  );
  StreamSubscription<dynamic>? _subscription;

  void start(void Function(GameInput input) onInput) {
    unawaited(_subscription?.cancel());
    _subscription = _eventChannel.receiveBroadcastStream().listen(
      (event) {
        final input = GameInput.fromWireValue(event as String?);
        if (input != null) onInput(input);
      },
      onError: (_) {
        // 手柄属于增强能力，通道不可用时不影响游戏本身运行。
      },
    );
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }
}
