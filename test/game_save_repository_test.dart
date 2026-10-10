import 'dart:io';

import 'package:bbk_classics/data/repositories/game_save_repository.dart';
import 'package:bbk_classics/data/services/app_file_store.dart';
import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('快速同步三个档位和选关备份时均保留，重新读取后仍按游戏隔离', () async {
    final directory = await Directory.systemTemp.createTemp('bbk-save-test-');
    addTearDown(() => directory.delete(recursive: true));
    final store = AppFileStore(rootDirectory: directory);
    final repository = GameSaveRepository(fileStore: store);
    await repository.snapshot(GameId.jyqxz);

    // 模拟同一 JS 会话快速到达的独立增量；用户存档和选关备份不能互相覆盖。
    await Future.wait<void>(<Future<void>>[
      repository.updateEntries(GameId.jyqxz, <String, String>{
        'sav/fmjsave0': 'jyqxz-slot-0',
      }),
      repository.updateEntries(GameId.jyqxz, <String, String>{
        'sav/fmjsave1': 'jyqxz-slot-1',
      }),
      repository.updateEntries(GameId.jyqxz, <String, String>{
        'sav/jyqxz-stage-backup': 'jyqxz-before-stage',
      }),
      repository.updateEntries(GameId.fmj, <String, String>{
        'sav/fmjsave0': 'fmj-slot-0',
      }),
      repository.updateEntries(GameId.jyqxz, <String, String>{
        'sav/fmjsave2': 'jyqxz-slot-2',
      }),
    ]);

    // 使用新的仓库读取实际文件，验证持久化结果而非仅检查旧对象的缓存。
    final reloaded = GameSaveRepository(
      fileStore: AppFileStore(rootDirectory: directory),
    );
    expect(await reloaded.snapshot(GameId.jyqxz), <String, String>{
      'sav/fmjsave0': 'jyqxz-slot-0',
      'sav/fmjsave1': 'jyqxz-slot-1',
      'sav/fmjsave2': 'jyqxz-slot-2',
      'sav/jyqxz-stage-backup': 'jyqxz-before-stage',
    });
    expect(await reloaded.snapshot(GameId.fmj), <String, String>{
      'sav/fmjsave0': 'fmj-slot-0',
    });
  });
}
