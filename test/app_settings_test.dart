import 'package:bbk_classics/domain/models/app_settings.dart';
import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('设置序列化后保持原值', () {
    const source = AppSettings(
      controlsVisible: false,
      hapticsEnabled: true,
      sgbyEdition: SgbyEdition.balanced,
    );
    final restored = AppSettings.fromJson(source.toJson());
    expect(restored.controlsVisible, isFalse);
    expect(restored.hapticsEnabled, isTrue);
    expect(restored.sgbyEdition, SgbyEdition.balanced);
  });
}
