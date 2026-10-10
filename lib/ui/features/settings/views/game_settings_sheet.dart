import 'package:flutter/material.dart';

import '../../../../domain/models/app_settings.dart';
import '../../../../domain/models/game_definition.dart';
import '../view_models/settings_view_model.dart';

/// 展示游戏控制相关设置。
Future<void> showGameSettingsSheet(
  BuildContext context, {
  required SettingsViewModel viewModel,
  required bool showEdition,
  bool showFmjGraphics = false,
  bool showSgbyActivity = false,
}) {
  var draftWorldActivity = viewModel.settings.sgbyWorldActivity.toDouble();
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (context) {
      return SafeArea(
        top: false,
        child: ListenableBuilder(
          listenable: viewModel,
          builder: (context, _) {
            final settings = viewModel.settings;
            return SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SwitchListTile(
                      secondary: const Icon(Icons.sports_esports),
                      title: const Text('屏幕按键'),
                      value: settings.controlsVisible,
                      onChanged: viewModel.setControlsVisible,
                    ),
                    SwitchListTile(
                      secondary: const Icon(Icons.vibration),
                      title: const Text('按键震动'),
                      value: settings.hapticsEnabled,
                      onChanged: viewModel.setHapticsEnabled,
                    ),
                    if (showFmjGraphics)
                      SwitchListTile(
                        secondary: const Icon(Icons.hd),
                        title: const Text('角色扮演游戏高清画质'),
                        value: settings.fmjHighDefinition,
                        onChanged: viewModel.setFmjHighDefinition,
                      ),
                    if (showSgbyActivity)
                      StatefulBuilder(
                        builder: (context, setModalState) {
                          final value = draftWorldActivity.round();
                          return ListTile(
                            leading: const Icon(Icons.public),
                            title: const Text('世界活跃度'),
                            trailing: SizedBox(
                              width: 76,
                              child: Text(
                                '${_worldActivityLabel(value)} $value',
                                textAlign: TextAlign.end,
                              ),
                            ),
                            subtitle: Slider(
                              value: draftWorldActivity,
                              min: AppSettings.minSgbyWorldActivity.toDouble(),
                              max: AppSettings.maxSgbyWorldActivity.toDouble(),
                              divisions: 20,
                              label: '$value',
                              onChanged: (nextValue) {
                                setModalState(
                                  () => draftWorldActivity = nextValue,
                                );
                              },
                              onChangeEnd: (nextValue) {
                                final normalized = nextValue.round();
                                setModalState(
                                  () => draftWorldActivity = normalized
                                      .toDouble(),
                                );
                                viewModel.setSgbyWorldActivity(normalized);
                              },
                            ),
                          );
                        },
                      ),
                    if (showEdition)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                        child: DropdownButtonFormField<SgbyEdition>(
                          initialValue: settings.sgbyEdition,
                          decoration: const InputDecoration(
                            labelText: '三国霸业版本',
                            prefixIcon: Icon(Icons.extension),
                            border: OutlineInputBorder(),
                          ),
                          items: SgbyEdition.values
                              .map(
                                (edition) => DropdownMenuItem<SgbyEdition>(
                                  value: edition,
                                  child: Text(edition.title),
                                ),
                              )
                              .toList(growable: false),
                          onChanged: (edition) {
                            if (edition != null) {
                              viewModel.setSgbyEdition(edition);
                            }
                          },
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      );
    },
  );
}

/// 将连续数值映射成稳定、便于扫读的强度标签。
String _worldActivityLabel(int value) {
  if (value < AppSettings.originalSgbyWorldActivity) return '沉静';
  if (value == AppSettings.originalSgbyWorldActivity) return '原版';
  if (value <= 50) return '活跃';
  if (value <= 75) return '强势';
  return '动荡';
}
