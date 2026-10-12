import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:bbk_classics/ui/features/game/views/game_controls_overlay.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// 从实际绘制矩形内取点点击，验证功能按钮没有被父容器裁掉触摸范围。
void main() {
  testWidgets('三国霸业首行功能按钮顶部、中间和底部均可点击', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final inputs = <GameInput>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PortraitGameControlsPanel(
            isDarkTheme: true,
            hapticsEnabled: false,
            showSgbyUtilityButtons: true,
            onInput: inputs.add,
          ),
        ),
      ),
    );
    for (final entry in <String, GameInput>{
      '将领列表': GameInput.generalRoster,
      '搜索记录': GameInput.searchHistory,
    }.entries) {
      final finder = find
          .ancestor(
            of: find.text(entry.key),
            matching: find.byType(GestureDetector),
          )
          .first;
      expect(finder, findsOneWidget);
      final rectangle = tester.getRect(finder);
      for (final point in <Offset>[
        Offset(rectangle.center.dx, rectangle.top + 2),
        rectangle.center,
        Offset(rectangle.center.dx, rectangle.bottom - 2),
      ]) {
        final before = inputs.length;
        await tester.tapAt(point);
        await tester.pumpAndSettle();
        expect(inputs.length, before + 1, reason: '${entry.key}的绘制范围内必须能够触发点击');
        expect(inputs.last, entry.value);
      }
    }
    expect(tester.takeException(), isNull);
  });
}
