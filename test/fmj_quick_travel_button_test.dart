import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:bbk_classics/ui/features/game/views/game_controls_overlay.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('伏魔记竖屏控制区直接发送前往动作', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final inputs = <GameInput>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PortraitGameControlsPanel(
            isDarkTheme: true,
            hapticsEnabled: false,
            showFmjUtilityButtons: true,
            onInput: inputs.add,
          ),
        ),
      ),
    );
    expect(find.text('一键前往当前目标'), findsOneWidget);
    await tester.tap(find.text('一键前往当前目标'));
    await tester.pumpAndSettle();
    expect(inputs, <GameInput>[GameInput.quickTravel]);
    await tester.tap(find.text('远视野 2×'));
    await tester.pumpAndSettle();
    expect(inputs.last, GameInput.toggleWideView);
    expect(find.text('迷宫出口'), findsNothing);
    await tester.tap(find.text('选择关卡'));
    await tester.pumpAndSettle();
    expect(inputs.last, GameInput.selectFmjStage);
    await tester.tap(find.text('奔跑 1×'));
    await tester.pumpAndSettle();
    expect(inputs.last, GameInput.cycleFmjRunSpeed);
    expect(tester.takeException(), isNull);
  });

  testWidgets('伏魔记横屏悬浮区保留同一动作', (tester) async {
    await tester.binding.setSurfaceSize(const Size(844, 390));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final inputs = <GameInput>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GameControlsOverlay(
            hapticsEnabled: false,
            showFmjUtilityButtons: true,
            onInput: inputs.add,
          ),
        ),
      ),
    );
    await tester.tap(find.text('一键前往当前目标'));
    await tester.pumpAndSettle();
    expect(inputs, <GameInput>[GameInput.quickTravel]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('另一款游戏不显示伏魔记前往入口', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GameControlsOverlay(hapticsEnabled: false, onInput: (_) {}),
        ),
      ),
    );
    expect(find.text('一键前往当前目标'), findsNothing);
  });
}
