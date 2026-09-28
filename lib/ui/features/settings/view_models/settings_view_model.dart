import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../../data/repositories/settings_repository.dart';
import '../../../../domain/models/app_settings.dart';
import '../../../../domain/models/game_definition.dart';

/// 设置页面和游戏按键层共享的状态持有者。
class SettingsViewModel extends ChangeNotifier {
  SettingsViewModel({required SettingsRepository repository})
    : _repository = repository;

  final SettingsRepository _repository;
  AppSettings _settings = AppSettings.defaults;
  bool _isLoading = true;
  Object? _error;

  AppSettings get settings => _settings;
  bool get isLoading => _isLoading;
  Object? get error => _error;

  Future<void> load() async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      _settings = await _repository.load();
    } on Object catch (error) {
      _error = error;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void setControlsVisible(bool value) {
    _update(_settings.copyWith(controlsVisible: value));
  }

  void setHapticsEnabled(bool value) {
    _update(_settings.copyWith(hapticsEnabled: value));
  }

  void setSgbyEdition(SgbyEdition value) {
    _update(_settings.copyWith(sgbyEdition: value));
  }

  /// 设置伏魔记显示画质并异步持久化。
  ///
  /// 当前值会先同步通知 UI；文件写入失败时仅记录错误，不撤销正在运行的游戏画面。
  void setFmjHighDefinition(bool value) {
    _update(_settings.copyWith(fmjHighDefinition: value));
  }

  void _update(AppSettings value) {
    _settings = value;
    notifyListeners();
    unawaited(_persist(value));
  }

  Future<void> _persist(AppSettings value) async {
    try {
      await _repository.save(value);
    } on Object catch (error) {
      _error = error;
      notifyListeners();
    }
  }
}
