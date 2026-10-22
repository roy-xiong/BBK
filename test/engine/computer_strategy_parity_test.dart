import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgby_flutter/data/services/game_save_codec.dart';
import 'package:sgby_flutter/domain/use_cases/computer_strategy.dart';
import 'package:sgby_flutter/engine/resources/baye_archive.dart';
import 'package:sgby_flutter/engine/resources/baye_database.dart';
import 'package:sgby_flutter/engine/resources/bitmap_font.dart';
import 'package:sgby_flutter/engine/resources/gbk_codec.dart';

/// 从旧内核ComputerTactic前后采集五档活跃度与四个种子，验证补丁决策及随机调用次序。
void main() {
  late BayeDatabase database;
  late List<dynamic> samples;
  setUpAll(() {
    database = BayeDatabase(
      archive: BayeArchive(
        File('assets/game/SGBY-Reset-4X.lib').readAsBytesSync(),
      ),
      codec: GbkCodec(File('assets/game/gbk_unicode.bin').readAsBytesSync()),
      font: BitmapFont(
        File('assets/game/fallback_font12.bin').readAsBytesSync(),
      ),
      refinedRules:
          jsonDecode(File('assets/game/refined_rules.json').readAsStringSync())
              as Map<String, dynamic>,
    );
    samples =
        jsonDecode(File('test/fixtures/reference_ai.json').readAsStringSync())
            as List;
  });
  for (var index = 0; index < 20; index++) {
    test('旧内核AI决策逐字段对照，样本$index', () {
      final sample = samples[index] as Map;
      final codec = GameSaveCodec();
      final envelope = codec.encode(database.loadPeriod(1, seed: 1));
      final before = Map<String, dynamic>.from(sample['before'] as Map)
        ..remove('orders');
      final saved = Map<String, dynamic>.from(envelope['world']! as Map)
        ..addAll(before);
      final world = codec.decode(<String, dynamic>{
        ...envelope,
        'world': saved,
      });
      ComputerStrategy(database)(world, activity: sample['activity'] as int);
      final actual = world.toJson();
      for (final field in (sample['after'] as Map).keys) {
        if (field == 'orders') continue;
        expect(
          actual[field],
          sample['after'][field],
          reason: '样本$index / $field',
        );
      }
      final expectedOrders = sample['after']['orders'] as List;
      expect(world.orders.length, expectedOrders.length);
      for (var i = 0; i < expectedOrders.length; i++) {
        final expected = expectedOrders[i] as Map;
        final order = world.orders[i].toJson();
        for (final field in expected.keys) {
          // 普通内政的Object在旧版部分分支未初始化，执行阶段也不读取。
          if (field == 'Object' &&
              ![3, 14, 15, 16, 17, 19, 27].contains(order['OrderId'])) {
            continue;
          }
          expect(
            order[field],
            expected[field],
            reason: '样本$index / 订单$i / $field',
          );
        }
      }
    });
  }
}
