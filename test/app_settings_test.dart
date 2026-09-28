import 'package:bbk_classics/domain/models/app_settings.dart';
import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('设置序列化后保持原值', () {
    const source = AppSettings(
      controlsVisible: false,
      hapticsEnabled: true,
      sgbyEdition: SgbyEdition.balanced,
      fmjHighDefinition: false,
    );
    final restored = AppSettings.fromJson(source.toJson());
    expect(restored.controlsVisible, isFalse);
    expect(restored.hapticsEnabled, isTrue);
    expect(restored.sgbyEdition, SgbyEdition.balanced);
    expect(restored.fmjHighDefinition, isFalse);
  });

  test('旧设置缺少伏魔记画质字段时默认启用高清模式', () {
    final restored = AppSettings.fromJson(<String, Object>{
      'version': 1,
      'controlsVisible': true,
      'hapticsEnabled': true,
      'sgbyEdition': SgbyEdition.original.storageValue,
    });
    expect(restored.fmjHighDefinition, isTrue);
  });
}
