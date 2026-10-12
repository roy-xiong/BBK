import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import '../../domain/models/emulator_rom.dart';

/// 当前模拟器会话的受限本地文件路由；token、ROM、BIOS 和存档均由宿主建立白名单。
class EmulatorSessionServer {
  static const String runtimeVersion = 'ejs-4.2.3';
  EmulatorLocalSession? _session;
  bool _opening = false;

  /// ROM 的路径与扫描快照重新比对，复制/替换中的文件必须重新扫描后才能启动。
  Future<EmulatorLocalSession> open(EmulatorRom rom, String rootPath) async {
    if (_session != null || _opening) throw StateError('请先退出当前模拟器');
    _opening = true;
    try {
      final root = await Directory(rootPath).resolveSymbolicLinks();
      final file = await _withinRoot(root, File(rom.path));
      final stat = await file.stat();
      if (stat.size != rom.size ||
          stat.modified.millisecondsSinceEpoch != rom.modified) {
        throw StateError('ROM 已变更，请重新扫描');
      }
      final bios = <String, File>{};
      for (final name in ['neogeo.zip', 'disksys.rom', 'gamegenie.nes']) {
        final candidate = File('$root/BIOS/$name');
        if (await candidate.exists()) {
          bios[name] = await _withinRoot(root, candidate);
        }
      }
      // 街机 clone 只加载同目录中元数据明确声明的父档，不猜测其他文件名。
      final parentName = rom.parentName;
      if (parentName != null) {
        for (final extension in ['zip', '7z']) {
          final parent = File('${file.parent.path}/$parentName.$extension');
          if (await parent.exists()) {
            bios['$parentName.$extension'] = await _withinRoot(root, parent);
            break;
          }
        }
      }
      if (rom.isDisk && !bios.containsKey('disksys.rom')) {
        throw StateError('FDS 游戏需要将 disksys.rom 放入 BBK/BIOS');
      }
      final random = Random.secure();
      final token = List.generate(
        24,
        (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join();
      final session = EmulatorLocalSession(
        rom: rom,
        root: root,
        token: token,
        bios: bios,
      );
      await session.prepare();
      _session = session;
      return session;
    } finally {
      _opening = false;
    }
  }

  void close(EmulatorLocalSession session) {
    if (identical(_session, session)) _session = null;
  }

  /// 返回 true 表示请求属于模拟器；其他路径继续交给已有内置游戏服务。
  Future<bool> handle(HttpRequest request) async {
    final segments = request.uri.pathSegments;
    if (segments.isEmpty || segments.first != '__emulator__') return false;
    final session = _session;
    if (session == null ||
        segments.length < 3 ||
        segments[1] != session.token) {
      request.response.statusCode = HttpStatus.notFound;
      await request.response.close();
      return true;
    }
    await session.handle(request, segments.sublist(2));
    return true;
  }

  /// 解析真实路径后检查完整目录边界，避免 BBK-else 或符号链接读取目录外文件。
  static Future<File> _withinRoot(String root, File file) async {
    final path = await file.resolveSymbolicLinks();
    if (!path.startsWith('$root${Platform.pathSeparator}')) {
      throw StateError('文件不在 BBK 目录内');
    }
    return File(path);
  }
}

/// 单一 ROM 会话。HTTP 只认识固定资源名，不接受用户传入路径或存档文件名。
class EmulatorLocalSession {
  EmulatorLocalSession({
    required this.rom,
    required this.root,
    required this.token,
    required this.bios,
  });
  final EmulatorRom rom;
  final String root;
  final String token;
  final Map<String, File> bios;
  final Map<String, File> _saveFiles = {};
  Future<void> _writeTail = Future.value();

  String get prefix => '/__emulator__/$token/';
  Future<void> get pendingWrites => _writeTail;

  Future<void> prepare() async {
    for (final folder in ['SAVES', 'STATES']) {
      final base = Directory('$root/$folder');
      await base.create(recursive: true);
      final canonical = await base.resolveSymbolicLinks();
      if (!canonical.startsWith('$root/')) throw StateError('存档目录不在 BBK 内');
      final version = Directory(
        '$canonical/${EmulatorSessionServer.runtimeVersion}-${rom.core}',
      );
      await version.create();
      if (!((await version.resolveSymbolicLinks()).startsWith('$root/'))) {
        throw StateError('存档目录不在 BBK 内');
      }
      final directory = Directory('${version.path}/${rom.sha256}');
      await directory.create();
      if (!((await directory.resolveSymbolicLinks()).startsWith('$root/'))) {
        throw StateError('存档目录不在 BBK 内');
      }
      if (folder == 'SAVES') {
        _saveFiles['sram'] = File('${directory.path}/game.srm');
        _saveFiles['cheats'] = File('${directory.path}/cheats.json');
      } else {
        _saveFiles['state'] = File('${directory.path}/quick.state');
        _saveFiles['auto'] = File('${directory.path}/auto.state');
      }
    }
  }

  /// 启动配置使用真实 ROM set 文件名，避免将所有街机文件重命名为 game.zip。
  Map<String, Object?> configuration() => {
    'core': rom.core,
    'family': rom.family,
    'title': rom.title,
    'hash': rom.sha256,
    'romUrl': '${prefix}rom/${Uri.encodeComponent(rom.fileName)}',
    'prefix': prefix,
    'bios': {for (final name in bios.keys) name: '${prefix}bios/$name'},
    'sramName': '${rom.fileName.replaceFirst(RegExp(r'\.[^.]+$'), '')}.srm',
  };

  Future<void> handle(HttpRequest request, List<String> segments) async {
    final response = request.response;
    final isRead = request.method == 'GET' || request.method == 'HEAD';
    if (isRead && segments.length == 1 && segments.first == 'config') {
      final body = utf8.encode(jsonEncode(configuration()));
      response.headers.contentType = ContentType.json;
      response.contentLength = body.length;
      if (request.method == 'GET') response.add(body);
      await response.close();
      return;
    }
    File? file;
    var writable = false;
    if (segments.length == 2 &&
        segments[0] == 'rom' &&
        segments[1] == rom.fileName) {
      file = File(rom.path);
    } else if (segments.length == 2 && segments[0] == 'bios') {
      file = bios[segments[1]];
    } else if (segments.length == 2 && segments[0] == 'save') {
      file = _saveFiles[segments[1]];
      writable = true;
    } else if (segments.length == 1 && segments[0] == 'cheat-definitions') {
      file = File('$root/CHEATS/${rom.family}.json');
    }
    if (file == null) {
      response.statusCode = HttpStatus.notFound;
      await response.close();
      return;
    }
    if (isRead) {
      if (!await file.exists()) {
        response.statusCode = HttpStatus.notFound;
        await response.close();
        return;
      }
      final checked = await EmulatorSessionServer._withinRoot(root, file);
      final length = await checked.length();
      final readLimit = segments.first == 'save'
          ? (segments.last == 'cheats'
                ? 256 * 1024
                : (segments.last == 'sram'
                      ? 16 * 1024 * 1024
                      : 128 * 1024 * 1024))
          : 512 * 1024 * 1024;
      if (length > readLimit ||
          (segments.first == 'cheat-definitions' && length > 1024 * 1024)) {
        throw StateError('文件超过大小限制');
      }
      response.headers.contentType = ContentType.binary;
      response.contentLength = length;
      if (request.method == 'GET') await response.addStream(checked.openRead());
      await response.close();
      return;
    }
    final origin = request.headers.value('origin');
    final expectedOrigin =
        'http://${request.headers.value(HttpHeaders.hostHeader)}';
    if (!writable ||
        request.method != 'POST' ||
        origin != expectedOrigin ||
        request.headers.contentType?.mimeType != 'application/octet-stream') {
      response.statusCode = HttpStatus.forbidden;
      await response.close();
      return;
    }
    final target = file;
    final limit = segments.last == 'cheats'
        ? 256 * 1024
        : (segments.last == 'sram' ? 16 * 1024 * 1024 : 128 * 1024 * 1024);
    final operation = _writeTail.then((_) => _write(request, target, limit));
    _writeTail = operation.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    await operation;
    response.statusCode = HttpStatus.noContent;
    await response.close();
  }

  /// 同目录临时文件完成后 rename，失败保留原档；写入串行且流式限制大小。
  Future<void> _write(HttpRequest request, File target, int limit) async {
    final parent = await target.parent.resolveSymbolicLinks();
    if (!parent.startsWith('$root/')) throw StateError('非法存档目录');
    if (await target.exists()) {
      await EmulatorSessionServer._withinRoot(root, target);
    }
    final temporary = File(
      '$parent/${target.uri.pathSegments.last}.${DateTime.now().microsecondsSinceEpoch}.tmp',
    );
    final sink = temporary.openWrite();
    var length = 0;
    try {
      await sink.addStream(
        request.map((bytes) {
          length += bytes.length;
          if (length > limit) throw StateError('存档超过大小限制');
          return bytes;
        }),
      );
      await sink.flush();
      await sink.close();
      if (length == 0) throw StateError('不能保存空存档');
      await temporary.rename(target.path);
    } finally {
      await sink.close();
      if (await temporary.exists()) await temporary.delete();
    }
  }
}
