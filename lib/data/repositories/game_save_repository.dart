import '../../domain/models/game_definition.dart';
import '../services/app_file_store.dart';

/// 两套游戏存档的 Flutter 侧备份仓库。
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

  Future<Map<String, String>> snapshot(GameId gameId) async {
    final cached = _cache[gameId];
    if (cached != null) return Map<String, String>.unmodifiable(cached);

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

  Future<void> updateEntries(
    GameId gameId,
    Map<String, String> changedEntries,
  ) async {
    if (changedEntries.isEmpty) return;
    final current = Map<String, String>.from(await snapshot(gameId));
    for (final entry in changedEntries.entries) {
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
  }

  String _pathFor(GameId gameId) => 'saves/${gameId.storageKey}.json';
}
