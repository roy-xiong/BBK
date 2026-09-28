import 'game_definition.dart';

/// 应用级不可变设置。
class AppSettings {
  const AppSettings({
    required this.controlsVisible,
    required this.hapticsEnabled,
    required this.sgbyEdition,
    this.fmjHighDefinition = true,
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

  AppSettings copyWith({
    bool? controlsVisible,
    bool? hapticsEnabled,
    SgbyEdition? sgbyEdition,
    bool? fmjHighDefinition,
  }) {
    return AppSettings(
      controlsVisible: controlsVisible ?? this.controlsVisible,
      hapticsEnabled: hapticsEnabled ?? this.hapticsEnabled,
      sgbyEdition: sgbyEdition ?? this.sgbyEdition,
      fmjHighDefinition: fmjHighDefinition ?? this.fmjHighDefinition,
    );
  }

  Map<String, Object> toJson() => <String, Object>{
    'version': 2,
    'controlsVisible': controlsVisible,
    'hapticsEnabled': hapticsEnabled,
    'sgbyEdition': sgbyEdition.storageValue,
    'fmjHighDefinition': fmjHighDefinition,
  };

  factory AppSettings.fromJson(Map<String, dynamic>? json) {
    if (json == null) return defaults;
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
    );
  }
}
