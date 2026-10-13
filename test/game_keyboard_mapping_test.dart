import 'dart:io';

import 'package:bbk_classics/data/repositories/settings_repository.dart';
import 'package:bbk_classics/data/services/app_file_store.dart';
import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:bbk_classics/domain/models/game_keyboard_bindings.dart';
import 'package:bbk_classics/ui/features/game/views/game_keyboard_mapping_sheet.dart';
import 'package:bbk_classics/ui/features/settings/view_models/settings_view_model.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('左右箭头和字母可同时映射同一动作，冲突转移后持久化恢复', () async {
    final directory = await Directory.systemTemp.createTemp(
      'bbk-keyboard-test-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final repository = SettingsRepository(
      fileStore: AppFileStore(rootDirectory: directory),
    );
    final settings = await repository.load();
    final changed = settings.keyboardBindings.bind(GameInput.left, 'KeyZ');
    expect(changed.actionFor('KeyZ'), GameInput.left);
    expect(changed.actionFor('ArrowLeft'), GameInput.left);
    expect(changed.actionFor('KeyA'), GameInput.left);
    expect(changed.bindings[GameInput.confirm], ['Enter']);
    await repository.save(settings.copyWith(keyboardBindings: changed));
    final reloaded = await SettingsRepository(
      fileStore: AppFileStore(rootDirectory: directory),
    ).load();
    expect(reloaded.keyboardBindings.byCode, changed.byCode);
    expect(GameKeyboardBindings.codeFor(PhysicalKeyboardKey.keyZ), 'KeyZ');
    expect(
      reloaded.keyboardBindings
          .remove(GameInput.left, 'ArrowLeft')
          .actionFor('ArrowLeft'),
      isNull,
    );
  });

  testWidgets('游戏映射入口录入实际键盘并确认冲突，不改变其他绑定', (tester) async {
    late Directory directory;
    final settings = (await tester.runAsync(() async {
      directory = await Directory.systemTemp.createTemp('bbk-keyboard-ui-');
      final model = SettingsViewModel(
        repository: SettingsRepository(
          fileStore: AppFileStore(rootDirectory: directory),
        ),
      );
      await model.load();
      return model;
    }))!;
    addTearDown(() => directory.delete(recursive: true));
    await tester.binding.setSurfaceSize(const Size(1000, 850));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () =>
                    showGameKeyboardMappingSheet(context, settings, GameId.fmj),
                child: const Text('键盘映射'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('键盘映射'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('添加按键').at(2));
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(
      LogicalKeyboardKey.keyZ,
      physicalKey: PhysicalKeyboardKey.keyZ,
    );
    await tester.pumpAndSettle();
    expect(find.text('按键已被使用'), findsOneWidget);
    await tester.tap(find.text('修改绑定'));
    await tester.pumpAndSettle();
    expect(
      settings.settings.keyboardBindings.actionFor('KeyZ'),
      GameInput.left,
    );
    expect(
      settings.settings.keyboardBindings.actionFor('ArrowLeft'),
      GameInput.left,
    );
    await tester.tap(find.text('完成'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
