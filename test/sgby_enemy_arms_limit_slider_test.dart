import 'package:bbk_classics/ui/features/game/views/sgby_enemy_arms_limit_slider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final width in [320.0, 560.0]) {
    testWidgets('敌军兵力上限$width：拖动预览、松手提交与800/200000边界', (tester) async {
      await tester.binding.setSurfaceSize(Size(width, 600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final submitted = <int>[];
      var saved = 200000;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => SgbyEnemyArmsLimitSlider(
                value: saved,
                enabled: true,
                busy: false,
                onSubmitted: (value) {
                  submitted.add(value);
                  setState(() => saved = value);
                },
              ),
            ),
          ),
        ),
      );
      expect(find.text('每名敌将上限：20 0000'), findsOneWidget);
      final slider = find.byType(Slider);
      final rectangle = tester.getRect(slider);
      final gesture = await tester.startGesture(
        Offset(rectangle.right - 24, rectangle.center.dy),
      );
      await gesture.moveBy(const Offset(-1000, 0));
      await tester.pump();
      expect(submitted, isEmpty, reason: '拖动不能反复调用引擎');
      expect(find.text('每名敌将上限：800'), findsOneWidget);
      await gesture.up();
      await tester.pumpAndSettle();
      expect(submitted, [800]);
      await tester.drag(slider, const Offset(1000, 0));
      await tester.pumpAndSettle();
      expect(submitted.last, 200000);
      expect(submitted.length, 2);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('关闭或提交期间不可拖动，65536显示完整，缺失数据不构造无效滑块', (tester) async {
    final submitted = <int>[];
    Future<void> show(int? value, bool enabled, bool busy) => tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SgbyEnemyArmsLimitSlider(
            value: value,
            enabled: enabled,
            busy: busy,
            onSubmitted: submitted.add,
          ),
        ),
      ),
    );
    await show(65536, false, false);
    expect(find.text('每名敌将上限：6 5536'), findsOneWidget);
    expect(tester.widget<Slider>(find.byType(Slider)).onChanged, isNull);
    await tester.tap(find.byType(Slider));
    expect(submitted, isEmpty);
    await show(65536, true, true);
    expect(tester.widget<Slider>(find.byType(Slider)).onChanged, isNull);
    await show(null, true, false);
    expect(find.byType(Slider), findsNothing);
    await show(200001, true, false);
    expect(find.byType(Slider), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
