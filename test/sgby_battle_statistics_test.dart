import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:bbk_classics/domain/models/sgby_battle_statistics.dart';
import 'package:bbk_classics/ui/features/game/views/game_controls_overlay.dart';
import 'package:bbk_classics/ui/features/game/views/sgby_battle_statistics_text.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('战绩桥拒绝残缺、负数、小数和超出JS精确范围的消息', () {
    final data = <String, Object>{
      'hasFullHistory': true,
      'lostSoldiers': 70,
      'lostGenerals': 1,
      'killedSoldiers': 123456,
      'killedGenerals': 8,
    };
    expect(SgbyBattleStatistics.tryParse(data)?.killedSoldiers, 123456);
    expect(SgbyBattleStatistics.tryParse(null), isNull);
    expect(
      SgbyBattleStatistics.tryParse({...data, 'lostSoldiers': -1}),
      isNull,
    );
    expect(
      SgbyBattleStatistics.tryParse({...data, 'lostSoldiers': 1.5}),
      isNull,
    );
    expect(
      SgbyBattleStatistics.tryParse({...data, 'lostSoldiers': double.nan}),
      isNull,
    );
    expect(
      SgbyBattleStatistics.tryParse({
        ...data,
        'lostSoldiers': 9007199254740992,
      }),
      isNull,
    );
    expect(
      SgbyBattleStatistics.tryParse({...data}..remove('killedGenerals')),
      isNull,
    );
  });

  testWidgets('战斗推送只更新文字，回档和旧档的显示同步切换', (tester) async {
    final source = ValueNotifier<SgbyBattleStatistics?>(null);
    addTearDown(source.dispose);
    var gameSurfaceBuilds = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              Builder(
                builder: (_) {
                  gameSurfaceBuilds++;
                  return const Text('游戏画面');
                },
              ),
              SgbyBattleStatisticsText(isDarkTheme: true, statistics: source),
            ],
          ),
        ),
      ),
    );
    expect(find.text('选择君主后开始统计战绩'), findsOneWidget);
    source.value = const SgbyBattleStatistics(
      lostSoldiers: 70,
      lostGenerals: 1,
      killedSoldiers: 700,
      killedGenerals: 2,
      hasFullHistory: true,
    );
    await tester.pump();
    expect(find.text('士兵 70  ·  将领 1'), findsOneWidget);
    expect(find.text('士兵 700  ·  将领 2'), findsOneWidget);
    source.value = const SgbyBattleStatistics(
      lostSoldiers: 0,
      lostGenerals: 0,
      killedSoldiers: 100,
      killedGenerals: 0,
      hasFullHistory: false,
    );
    await tester.pump();
    expect(find.text('士兵 100  ·  将领 0'), findsOneWidget);
    expect(find.text('旧档战绩仅含启用统计后的记录'), findsOneWidget);
    expect(gameSurfaceBuilds, 1, reason: '实时数字不能触发游戏画面重建');
    expect(tester.takeException(), isNull);
  });

  for (final size in [const Size(390, 400), const Size(320, 320)]) {
    testWidgets('竖屏控制区${size.width}大数值下仍可点击功能按钮', (tester) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final source = ValueNotifier<SgbyBattleStatistics?>(
        const SgbyBattleStatistics(
          lostSoldiers: 123456789,
          lostGenerals: 20,
          killedSoldiers: 987654321,
          killedGenerals: 1234,
          hasFullHistory: false,
        ),
      );
      addTearDown(source.dispose);
      final inputs = <GameInput>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PortraitGameControlsPanel(
              isDarkTheme: true,
              hapticsEnabled: false,
              showSgbyUtilityButtons: true,
              sgbyBattleStatistics: source,
              onInput: inputs.add,
            ),
          ),
        ),
      );
      await tester.tap(find.text('将领列表'));
      await tester.pump();
      expect(inputs, contains(GameInput.generalRoster));
      expect(tester.takeException(), isNull);
    });
  }
}
