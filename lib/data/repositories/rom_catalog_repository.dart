import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../../domain/models/emulator_rom.dart';

/// 外置 ROM 游戏库；应用级实例保证冷启动只扫描一次，授权和重扫由用户主动触发。
class RomCatalogRepository extends ChangeNotifier {
  static const MethodChannel _channel = MethodChannel(
    'com.xiongjian.bbkclassics/rom_storage',
  );
  Future<void>? _initialization;
  Future<void>? _scanning;
  bool _disposed = false;
  bool isLoading = false;
  bool authorized = false;
  String? rootPath;
  String? error;
  List<EmulatorRom> games = const [];
  List<String> issues = const [];

  Future<void> initialize() => _initialization ??= refresh();

  /// 并发入口共享扫描 Future，结果一次性交付，不在 Widget build 中启动扫描。
  Future<void> refresh() {
    final active = _scanning;
    if (active != null) return active;
    final operation = _scan();
    _scanning = operation;
    return operation.whenComplete(() => _scanning = null);
  }

  Future<void> _scan() async {
    if (_disposed) return;
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      if (!Platform.isAndroid) throw StateError('模拟器目前仅支持 Android');
      final result = await _channel.invokeMapMethod<String, dynamic>('scan');
      if (_disposed) return;
      if (result == null) throw StateError('存储服务没有返回结果');
      authorized = result['authorized'] == true;
      rootPath = result['root'] as String?;
      final rawGames = result['games'];
      games = List.unmodifiable(
        rawGames is List
            ? rawGames.map(EmulatorRom.fromPlatform).whereType<EmulatorRom>()
            : <EmulatorRom>[],
      );
      final rawIssues = result['issues'];
      issues = List.unmodifiable(
        rawIssues is List
            ? rawIssues.whereType<Map>().map(
                (issue) => '${issue['name']}: ${issue['message']}',
              )
            : <String>[],
      );
    } on Object catch (failure) {
      if (!_disposed) {
        error = failure is PlatformException
            ? failure.message
            : failure.toString();
      }
    } finally {
      if (!_disposed) {
        isLoading = false;
        notifyListeners();
      }
    }
  }

  /// 授权返回后立即扫描；取消不反复跳设置，也不阻断内置游戏。
  Future<void> requestPermission() async {
    if (_disposed || isLoading) return;
    try {
      if (await _channel.invokeMethod<bool>('requestPermission') == true) {
        await refresh();
      }
    } on Object catch (failure) {
      if (_disposed) return;
      error = failure is PlatformException
          ? failure.message
          : failure.toString();
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
