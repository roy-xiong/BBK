import 'game_definition.dart';

/// 悬浮工具栏在当前可拖动区域内的归一化位置。
///
/// 横纵坐标均限制在 0 到 1。持久化比例而不是物理像素，可以在横竖屏切换、系统分辨率
/// 调整以及不同设备尺寸下恢复到相同的相对位置，同时避免旧数据把工具栏放到屏幕外。
class GameToolbarPosition {
  const GameToolbarPosition({required this.xRatio, required this.yRatio});

  factory GameToolbarPosition.fromJson(Object? value) {
    if (value is! Map) return const GameToolbarPosition(xRatio: 0, yRatio: 0);
    final rawX = value['xRatio'];
    final rawY = value['yRatio'];
    final x = rawX is num ? rawX.toDouble() : 0.0;
    final y = rawY is num ? rawY.toDouble() : 0.0;
    return GameToolbarPosition(
      xRatio: x.isFinite ? x.clamp(0.0, 1.0) : 0.0,
      yRatio: y.isFinite ? y.clamp(0.0, 1.0) : 0.0,
    );
  }

  final double xRatio;
  final double yRatio;

  Map<String, double> toJson() => <String, double>{
    'xRatio': xRatio,
    'yRatio': yRatio,
  };
}

/// 应用级不可变设置。
class AppSettings {
  const AppSettings({
    required this.controlsVisible,
    required this.hapticsEnabled,
    required this.sgbyEdition,
    this.fmjHighDefinition = true,
    this.toolbarPositions = const <GameId, GameToolbarPosition>{},
  });

  static const AppSettings defaults = AppSettings(
    controlsVisible: true,
    hapticsEnabled: true,
    sgbyEdition: SgbyEdition.original,
    fmjHighDefinition: true,
  );

  final bool controlsVisible;
  final bool hapticsEnabled;
  final SgbyEdition sgbyEdition;

  /// 伏魔记是否使用三倍边缘感知高清渲染。
  ///
  /// 该设置只影响最终画面，不参与游戏逻辑和存档数据。
  final bool fmjHighDefinition;

  /// 两款游戏各自的悬浮工具栏位置。
  final Map<GameId, GameToolbarPosition> toolbarPositions;

  AppSettings copyWith({
    bool? controlsVisible,
    bool? hapticsEnabled,
    SgbyEdition? sgbyEdition,
    bool? fmjHighDefinition,
    Map<GameId, GameToolbarPosition>? toolbarPositions,
  }) {
    return AppSettings(
      controlsVisible: controlsVisible ?? this.controlsVisible,
      hapticsEnabled: hapticsEnabled ?? this.hapticsEnabled,
      sgbyEdition: sgbyEdition ?? this.sgbyEdition,
      fmjHighDefinition: fmjHighDefinition ?? this.fmjHighDefinition,
      toolbarPositions: toolbarPositions ?? this.toolbarPositions,
    );
  }

  Map<String, Object> toJson() => <String, Object>{
    'version': 3,
    'controlsVisible': controlsVisible,
    'hapticsEnabled': hapticsEnabled,
    'sgbyEdition': sgbyEdition.storageValue,
    'fmjHighDefinition': fmjHighDefinition,
    'toolbarPositions': <String, Object>{
      for (final entry in toolbarPositions.entries)
        entry.key.storageKey: entry.value.toJson(),
    },
  };

  factory AppSettings.fromJson(Map<String, dynamic>? json) {
    if (json == null) return defaults;
    final toolbarPositions = <GameId, GameToolbarPosition>{};
    final rawToolbarPositions = json['toolbarPositions'];
    if (rawToolbarPositions is Map) {
      for (final entry in rawToolbarPositions.entries) {
        final gameId = entry.key is String
            ? GameId.fromStorageKey(entry.key as String)
            : null;
        if (gameId == null || entry.value is! Map) continue;
        toolbarPositions[gameId] = GameToolbarPosition.fromJson(entry.value);
      }
    }
    return AppSettings(
      controlsVisible: json['controlsVisible'] is bool
          ? json['controlsVisible'] as bool
          : defaults.controlsVisible,
      hapticsEnabled: json['hapticsEnabled'] is bool
          ? json['hapticsEnabled'] as bool
          : defaults.hapticsEnabled,
      sgbyEdition: SgbyEdition.fromStorageValue(json['sgbyEdition'] as String?),
      fmjHighDefinition: json['fmjHighDefinition'] is bool
          ? json['fmjHighDefinition'] as bool
          : defaults.fmjHighDefinition,
      toolbarPositions: Map<GameId, GameToolbarPosition>.unmodifiable(
        toolbarPositions,
      ),
    );
  }
}
