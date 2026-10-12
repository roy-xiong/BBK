import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';

/// 原机模拟器控制通道。只传控制请求，画面由 Android 纹理直接交给 Flutter。
class BbkRuntimeService {
  static const MethodChannel channel = MethodChannel(
    'com.xiongjian.bbkclassics/bbk_runtime',
  );
  static const EventChannel events = EventChannel(
    'com.xiongjian.bbkclassics/bbk_runtime_events',
  );

  int? _session;
  int? textureId;
  Future<void>? _closeFuture;
  bool _closing = false;
  int searchWidth = 2;
  String searchSpace = 'ram';
  Map<String, dynamic>? searchResults;

  int? get sessionId => _session;

  /// 启动后验证平台结果；路由在等待中退出时，立即关闭迟到的原机会话。
  Future<void> start(String id, String model) async {
    if (_session != null || _closing) throw StateError('会话状态不允许启动');
    final result = await channel.invokeMapMethod<String, dynamic>(
      'start',
      <String, Object>{'id': id, 'model': model},
    );
    final session = result?['session'];
    final texture = result?['texture'];
    if (session is! int || texture is! int || session <= 0 || texture < 0) {
      throw StateError('模拟器未返回有效会话');
    }
    _session = session;
    textureId = texture;
    if (_closing) {
      await channel.invokeMethod<void>('close', <String, Object>{
        'session': session,
      });
      _session = null;
      textureId = null;
    }
  }

  Future<void> invoke(
    String method, [
    Map<String, Object?> values = const {},
  ]) async {
    final session = _session;
    if (session == null || _closing) return;
    await channel.invokeMethod<void>(method, <String, Object?>{
      'session': session,
      ...values,
    });
    if (method == 'loadState') searchResults = null;
  }

  Future<Map<String, dynamic>> command(Map<String, Object?> request) async {
    final session = _session;
    if (session == null || _closing) throw StateError('游戏会话已关闭');
    final raw = await channel.invokeMethod<String>('command', <String, Object>{
      'session': session,
      'request': jsonEncode(request),
    });
    final decoded = raw == null ? null : jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) throw StateError('命令结果无效');
    if (decoded['ok'] != true) {
      throw StateError(decoded['message']?.toString() ?? '操作失败');
    }
    final data = decoded['data'];
    return data is Map<String, dynamic> ? data : <String, dynamic>{};
  }

  /// 合并重复关闭请求；native 在回复前已经销毁句柄，下一局不会与旧会话并发。
  Future<void> close() {
    _closing = true;
    return _closeFuture ??= _close();
  }

  Future<void> _close() async {
    final session = _session;
    if (session == null) return;
    try {
      await channel.invokeMethod<void>('close', <String, Object>{
        'session': session,
      });
    } finally {
      _session = null;
      textureId = null;
    }
  }
}
