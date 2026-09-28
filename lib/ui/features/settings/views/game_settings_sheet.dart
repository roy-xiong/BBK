import 'package:flutter/material.dart';

import '../../../../domain/models/game_definition.dart';
import '../view_models/settings_view_model.dart';

/// 展示游戏控制相关设置。
Future<void> showGameSettingsSheet(
  BuildContext context, {
  required SettingsViewModel viewModel,
  required bool showEdition,
}) {
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
            return Padding(
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
            );
          },
        ),
      );
    },
  );
}
