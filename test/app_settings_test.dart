import 'package:bbk_classics/domain/models/app_settings.dart';
import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('设置序列化后保持原值', () {
    const source = AppSettings(
      controlsVisible: false,
      hapticsEnabled: true,
      sgbyEdition: SgbyEdition.balanced,
      sgbyWorldActivity: 85,
      fmjHighDefinition: false,
      toolbarPositions: <GameId, GameToolbarPosition>{
        GameId.sgby: GameToolbarPosition(xRatio: 0.75, yRatio: 0.35),
      },
    );
    final restored = AppSettings.fromJson(source.toJson());
    expect(restored.controlsVisible, isFalse);
    expect(restored.hapticsEnabled, isTrue);
    expect(restored.sgbyEdition, SgbyEdition.balanced);
    expect(restored.sgbyWorldActivity, 85);
    expect(restored.fmjHighDefinition, isFalse);
    expect(restored.toolbarPositions[GameId.sgby]?.xRatio, 0.75);
    expect(restored.toolbarPositions[GameId.sgby]?.yRatio, 0.35);
  });

  test('旧设置缺少伏魔记画质字段时默认启用高清模式', () {
    final restored = AppSettings.fromJson(<String, Object>{
      'version': 1,
      'controlsVisible': true,
      'hapticsEnabled': true,
      'sgbyEdition': SgbyEdition.original.storageValue,
    });
    expect(restored.fmjHighDefinition, isTrue);
    expect(restored.sgbyWorldActivity, AppSettings.defaultSgbyWorldActivity);
    expect(restored.toolbarPositions, isEmpty);
  });

  test('世界活跃度会限制到合法范围并拒绝非有限值', () {
    expect(
      AppSettings.fromJson(<String, Object>{
        'sgbyWorldActivity': 180,
      }).sgbyWorldActivity,
      AppSettings.maxSgbyWorldActivity,
    );
    expect(
      AppSettings.fromJson(<String, Object>{
        'sgbyWorldActivity': -10,
      }).sgbyWorldActivity,
      AppSettings.minSgbyWorldActivity,
    );
    expect(
      AppSettings.fromJson(<String, Object>{
        'sgbyWorldActivity': double.nan,
      }).sgbyWorldActivity,
      AppSettings.defaultSgbyWorldActivity,
    );
  });

  test('损坏的悬浮工具栏坐标会被限制在有效范围内', () {
    final restored = AppSettings.fromJson(<String, Object>{
      'toolbarPositions': <String, Object>{
        GameId.fmj.storageKey: <String, Object>{'xRatio': 3.0, 'yRatio': -2.0},
        GameId.sgby.storageKey: <String, Object>{
          'xRatio': 'invalid',
          'yRatio': double.nan,
        },
      },
    });
    expect(restored.toolbarPositions[GameId.fmj]?.xRatio, 1.0);
    expect(restored.toolbarPositions[GameId.fmj]?.yRatio, 0.0);
    expect(restored.toolbarPositions[GameId.sgby]?.xRatio, 0.0);
    expect(restored.toolbarPositions[GameId.sgby]?.yRatio, 0.0);
  });
}
