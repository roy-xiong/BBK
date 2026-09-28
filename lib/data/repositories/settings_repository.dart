import '../../domain/models/app_settings.dart';
import '../services/app_file_store.dart';

/// 应用设置的唯一持久化入口。
class SettingsRepository {
  SettingsRepository({required AppFileStore fileStore})
    : _fileStore = fileStore;

  static const String _settingsPath = 'settings.json';
  final AppFileStore _fileStore;
  AppSettings? _cachedSettings;

  Future<AppSettings> load() async {
    final cached = _cachedSettings;
    if (cached != null) return cached;
    final settings = AppSettings.fromJson(
      await _fileStore.readJson(_settingsPath),
    );
    _cachedSettings = settings;
    return settings;
  }

  Future<void> save(AppSettings settings) async {
    _cachedSettings = settings;
    await _fileStore.writeJsonAtomically(_settingsPath, settings.toJson());
  }
}
