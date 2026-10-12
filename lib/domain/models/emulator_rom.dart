/// 已通过目录与文件头检查的外置 ROM；SHA-256 用于存档隔离。
class EmulatorRom {
  const EmulatorRom({
    required this.path,
    required this.fileName,
    required this.family,
    required this.sha256,
    required this.size,
    required this.modified,
    this.parentName,
  });

  final String path;
  final String fileName;
  final String family;
  final String sha256;
  final int size;
  final int modified;
  final String? parentName;
  String get core => family == 'nes' ? 'fceumm' : 'fbneo';
  String get title => fileName.replaceFirst(RegExp(r'\.[^.]+$'), '');
  String get systemLabel => family == 'nes' ? 'NES / FC' : '街机 / Neo Geo';
  bool get isDisk => fileName.toLowerCase().endsWith('.fds');

  /// 平台通道返回值严格校验，损坏记录不能进入本地文件路由。
  static EmulatorRom? fromPlatform(Object? value) {
    if (value is! Map) return null;
    final path = value['path'];
    final name = value['name'];
    final family = value['family'];
    final hash = value['sha256'];
    final size = value['size'];
    final modified = value['modified'];
    if (path is! String ||
        name is! String ||
        hash is! String ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(hash) ||
        (family != 'nes' && family != 'arcade') ||
        size is! int ||
        modified is! int) {
      return null;
    }
    return EmulatorRom(
      path: path,
      fileName: name,
      family: family as String,
      sha256: hash,
      size: size,
      modified: modified,
      parentName:
          value['parent'] is String &&
              RegExp(r'^[A-Za-z0-9_+-]+$').hasMatch(value['parent'] as String)
          ? value['parent'] as String
          : null,
    );
  }
}

/// RetroPad 按钮编号，屏幕按键与实体手柄使用同一套按下/释放接口。
enum EmulatorButton {
  b(0),
  y(1),
  select(2),
  start(3),
  up(4),
  down(5),
  left(6),
  right(7),
  a(8),
  x(9),
  l(10),
  r(11);

  const EmulatorButton(this.indexValue);
  final int indexValue;
}
