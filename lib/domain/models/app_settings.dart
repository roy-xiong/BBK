import 'game_definition.dart';

/// 应用级不可变设置。
class AppSettings {
  const AppSettings({
    required this.controlsVisible,
    required this.hapticsEnabled,
    required this.sgbyEdition,
  });

  static const AppSettings defaults = AppSettings(
    controlsVisible: true,
    hapticsEnabled: true,
    sgbyEdition: SgbyEdition.original,
  );

  final bool controlsVisible;
  final bool hapticsEnabled;
  final SgbyEdition sgbyEdition;

  AppSettings copyWith({
    bool? controlsVisible,
    bool? hapticsEnabled,
    SgbyEdition? sgbyEdition,
  }) {
    return AppSettings(
      controlsVisible: controlsVisible ?? this.controlsVisible,
      hapticsEnabled: hapticsEnabled ?? this.hapticsEnabled,
      sgbyEdition: sgbyEdition ?? this.sgbyEdition,
    );
  }

  Map<String, Object> toJson() => <String, Object>{
    'version': 1,
    'controlsVisible': controlsVisible,
    'hapticsEnabled': hapticsEnabled,
    'sgbyEdition': sgbyEdition.storageValue,
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
    );
  }
}
