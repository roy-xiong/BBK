import 'dart:convert';
import 'dart:io';

/// 应用 JSON 文件存储。
///
/// 所有写入在同一条 Future 链上串行执行，并使用临时文件和备份文件替换目标文件，
/// 避免多次快速存档相互覆盖，也尽量降低进程中断产生半文件的风险。
class AppFileStore {
  AppFileStore({required this.rootDirectory});

  final Directory rootDirectory;
  Future<void> _writeTail = Future<void>.value();

  Future<Map<String, dynamic>?> readJson(String relativePath) async {
    final file = _resolve(relativePath);
    final backup = File('${file.path}.bak');
    if (!await file.exists() && await backup.exists()) {
      await backup.copy(file.path);
    }
    if (!await file.exists()) return null;

    try {
      final decoded = jsonDecode(await file.readAsString());
      return decoded is Map<String, dynamic> ? decoded : null;
    } on FormatException {
      final corrupt = File(
        '${file.path}.corrupt.${DateTime.now().millisecondsSinceEpoch}',
      );
      try {
        await file.rename(corrupt.path);
      } on FileSystemException {
        // 无法隔离损坏文件时返回空数据，避免二次异常阻断应用启动。
      }
      return null;
    }
  }

  Future<void> writeJsonAtomically(
    String relativePath,
    Map<String, Object?> value,
  ) {
    final operation = _writeTail.then<void>((_) async {
      final target = _resolve(relativePath);
      await target.parent.create(recursive: true);
      final temporary = File('${target.path}.tmp');
      final backup = File('${target.path}.bak');
      await temporary.writeAsString(jsonEncode(value), flush: true);
      if (await target.exists()) await target.copy(backup.path);

      try {
        if (await target.exists()) await target.delete();
        await temporary.rename(target.path);
        if (await backup.exists()) await backup.delete();
      } on FileSystemException {
        if (!await target.exists() && await backup.exists()) {
          await backup.copy(target.path);
        }
        rethrow;
      } finally {
        if (await temporary.exists()) await temporary.delete();
      }
    });
    _writeTail = operation.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return operation;
  }

  File _resolve(String relativePath) {
    final segments = Uri(path: relativePath).pathSegments;
    if (relativePath.startsWith('/') || segments.contains('..')) {
      throw ArgumentError.value(relativePath, 'relativePath', '非法相对路径');
    }
    return File('${rootDirectory.path}/$relativePath');
  }
}
