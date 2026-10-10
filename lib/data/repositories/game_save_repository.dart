import '../../domain/models/game_definition.dart';
import '../services/app_file_store.dart';

/// 各游戏存档的 Flutter 侧备份仓库。
///
/// 游戏引擎仍使用原有 localStorage 格式，本仓库保存同一批键值的镜像。页面启动时先
/// 恢复镜像，避免 WebView 数据被清理、端口变化或系统升级后存档不可见。
class GameSaveRepository {
  GameSaveRepository({required AppFileStore fileStore})
    : _fileStore = fileStore;

  static const int _maxEntryLength = 16 * 1024 * 1024;
  final AppFileStore _fileStore;
  final Map<GameId, Map<String, String>> _cache =
      <GameId, Map<String, String>>{};
  final Map<GameId, Future<Map<String, String>>> _snapshotLoads =
      <GameId, Future<Map<String, String>>>{};
  Future<void> _updateTail = Future<void>.value();

  Future<Map<String, String>> snapshot(GameId gameId) async {
    final cached = _cache[gameId];
    if (cached != null) return Map<String, String>.unmodifiable(cached);

    // 同一游戏首次读盘复用同一份结果，避免并发旧读盘覆盖刚写入的按钮状态。
    final inFlight = _snapshotLoads[gameId];
    if (inFlight != null) return inFlight;
    final loading = _loadSnapshot(gameId);
    _snapshotLoads[gameId] = loading;
    try {
      return await loading;
    } finally {
      _snapshotLoads.remove(gameId);
    }
  }

  Future<Map<String, String>> _loadSnapshot(GameId gameId) async {
    final json = await _fileStore.readJson(_pathFor(gameId));
    final rawEntries = json?['entries'];
    final entries = <String, String>{};
    if (rawEntries is Map) {
      for (final entry in rawEntries.entries) {
        if (entry.key is String && entry.value is String) {
          entries[entry.key as String] = entry.value as String;
        }
      }
    }
    _cache[gameId] = entries;
    return Map<String, String>.unmodifiable(entries);
  }

  /// 按提交顺序合并存档和按钮设置，避免快速切换与游戏存档相互覆盖。
  ///
  /// 文件层串行写盘只能保证文件完整，合并也必须在同一条队列内执行。提交时
  /// 复制调用方参数，防止等待期间被外部修改；一次失败不会阻断后续保存。
  /// 串行合并并持久化增量，避免正常档位、选关备份及启动恢复消息互相覆盖。
  ///
  /// 后续保存仍可继续。文件替换由 AppFileStore 的原子写入流程完成。
  Future<void> updateEntries(
    GameId gameId,
    Map<String, String> changedEntries,
  ) {
    if (changedEntries.isEmpty) return Future<void>.value();
    final submitted = Map<String, String>.from(changedEntries);
    final operation = _updateTail.then<void>((_) async {
      final current = Map<String, String>.from(await snapshot(gameId));
      for (final entry in submitted.entries) {
        if (entry.key.isEmpty || entry.key.length > 256) continue;
        if (entry.value.length > _maxEntryLength) {
          throw StateError('存档数据超过单项大小限制: ${entry.key}');
        }
        current[entry.key] = entry.value;
      }
      _cache[gameId] = current;
      await _fileStore.writeJsonAtomically(_pathFor(gameId), <String, Object?>{
        'version': 1,
        'gameId': gameId.storageKey,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
        'entries': current,
      });
    });
    _updateTail = operation.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return operation;
  }

  String _pathFor(GameId gameId) => 'saves/${gameId.storageKey}.json';
}
