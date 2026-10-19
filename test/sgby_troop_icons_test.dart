import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:bbk_classics/ui/features/game/views/game_controls_overlay.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// 覆盖窄屏及横屏入口，验证显示开关可点击、状态准确且不移动方向键。
void main() {
  for (final size in [
    const Size(320, 600),
    const Size(390, 600),
    const Size(840, 600),
  ]) {
    final portrait = size.width < size.height;
    testWidgets('显示兵种开关 ${size.width}：点击、状态与方向键位置', (tester) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var enabled = false;
      final inputs = <GameInput>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                void onInput(GameInput input) {
                  inputs.add(input);
                  if (input == GameInput.toggleTroopIcons)
                    setState(() => enabled = !enabled);
                }

                return portrait
                    ? PortraitGameControlsPanel(
                        isDarkTheme: true,
                        hapticsEnabled: false,
                        showSgbyUtilityButtons: true,
                        sgbyTroopIconsEnabled: enabled,
                        onInput: onInput,
                      )
                    : GameControlsOverlay(
                        hapticsEnabled: false,
                        showSgbyUtilityButtons: true,
                        sgbyTroopIconsEnabled: enabled,
                        onInput: onInput,
                      );
              },
            ),
          ),
        ),
      );
      Finder button() => find
          .ancestor(
            of: find.text('显示兵种'),
            matching: find.byType(GestureDetector),
          )
          .first;
      final direction = find.byWidgetPredicate(
        (widget) => widget is Semantics && widget.properties.label == '上',
      );
      final directionRect = tester.getRect(direction);
      final buttonRect = tester.getRect(button());
      expect(find.byTooltip('显示兵种：已关闭'), findsOneWidget);
      for (final point in [
        Offset(buttonRect.center.dx, buttonRect.top + 2),
        buttonRect.center,
        Offset(buttonRect.center.dx, buttonRect.bottom - 2),
      ]) {
        final before = inputs.length;
        await tester.tapAt(point);
        await tester.pumpAndSettle();
        expect(inputs.length, before + 1);
        expect(inputs.last, GameInput.toggleTroopIcons);
        expect(
          find.byTooltip(enabled ? '显示兵种：已开启' : '显示兵种：已关闭'),
          findsOneWidget,
        );
        expect(tester.getRect(direction), directionRect);
        expect(tester.getRect(button()), buttonRect);
        expect(tester.takeException(), isNull);
      }
    });
  }
}
