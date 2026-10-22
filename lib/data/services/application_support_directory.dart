import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// 获取稳定的应用数据目录，显示名变更不移动存档、设置或WebView数据。
///
/// Windows的path_provider按EXE版本信息的ProductName拼接目录。显示名改为中文后，
/// 仍使用同一公司目录下的旧内部名称；macOS/iOS继续按原Bundle ID定位。
Future<Directory> getBbkApplicationSupportDirectory() async {
  final platformDirectory = await getApplicationSupportDirectory();
  if (!Platform.isWindows) return platformDirectory;
  final stableDirectory = Directory(
    '${platformDirectory.parent.path}${Platform.pathSeparator}bbk_classics',
  );
  await stableDirectory.create(recursive: true);
  return stableDirectory;
}
