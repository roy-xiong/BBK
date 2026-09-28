import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show FlutterError;
import 'package:flutter/services.dart';

import '../../domain/models/game_definition.dart';
import '../repositories/game_save_repository.dart';

/// 内置游戏静态资源服务。
///
/// WebAssembly 需要 HTTP 来源才能可靠加载，因此服务只监听 127.0.0.1，并优先使用
/// 固定端口保持 localStorage 来源稳定。它不连接外网，也不接受非应用资源路径。
class LocalGameServer {
  LocalGameServer({required GameSaveRepository gameSaveRepository})
    : _gameSaveRepository = gameSaveRepository;

  static const List<int> _candidatePorts = <int>[8765, 8766, 8767, 8768, 8769];
  final GameSaveRepository _gameSaveRepository;
  HttpServer? _server;
  Uri? _baseUri;

  Future<void> start() async {
    if (_server != null) return;
    HttpServer? server;
    for (final port in _candidatePorts) {
      try {
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
        break;
      } on SocketException {
        // 固定端口被占用时继续尝试，存档镜像负责恢复不同来源下的数据。
      }
    }
    server ??= await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server = server;
    _baseUri = Uri.parse('http://127.0.0.1:${server.port}/');
    server.listen(_handleRequest, onError: (_) {});
  }

  Uri entryUri(GameDefinition game) {
    final baseUri = _baseUri;
    if (baseUri == null) throw StateError('本地游戏服务尚未启动');
    return baseUri.resolve(game.entryPath);
  }

  bool isLocalUrl(String url) {
    final baseUri = _baseUri;
    final uri = Uri.tryParse(url);
    return baseUri != null &&
        uri != null &&
        uri.host == baseUri.host &&
        uri.port == baseUri.port;
  }

  Future<void> stop() async {
    final server = _server;
    _server = null;
    _baseUri = null;
    await server?.close(force: true);
  }

  Future<void> _handleRequest(HttpRequest request) async {
    final response = request.response;
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set(HttpHeaders.cacheControlHeader, 'no-store');
    if (request.method != 'GET' && request.method != 'HEAD') {
      response.statusCode = HttpStatus.methodNotAllowed;
      await response.close();
      return;
    }
    try {
      if (request.uri.path.startsWith('/__state__/')) {
        await _serveState(request);
      } else {
        await _serveAsset(request);
      }
    } on Object {
      try {
        response.statusCode = HttpStatus.internalServerError;
        await response.close();
      } on Object {
        // 响应已经开始发送时无法再替换状态码，连接会由 HttpServer 自行回收。
      }
    }
  }

  Future<void> _serveState(HttpRequest request) async {
    final response = request.response;
    final storageKey = request.uri.pathSegments.length >= 2
        ? request.uri.pathSegments[1]
        : null;
    final gameId = GameId.fromStorageKey(storageKey);
    if (gameId == null) {
      response.statusCode = HttpStatus.notFound;
      await response.close();
      return;
    }
    final entries = await _gameSaveRepository.snapshot(gameId);
    final body = utf8.encode(
      jsonEncode(<String, Object>{'version': 1, 'entries': entries}),
    );
    response.headers.contentType = ContentType.json;
    response.contentLength = body.length;
    if (request.method == 'GET') response.add(body);
    await response.close();
  }

  Future<void> _serveAsset(HttpRequest request) async {
    final response = request.response;
    final segments = request.uri.pathSegments;
    if (segments.isEmpty || segments.contains('..')) {
      response.statusCode = HttpStatus.notFound;
      await response.close();
      return;
    }
    final assetKey = 'assets/games/${segments.join('/')}';
    ByteData data;
    try {
      data = await rootBundle.load(assetKey);
    } on FlutterError {
      response.statusCode = HttpStatus.notFound;
      await response.close();
      return;
    }
    final bytes = Uint8List.sublistView(data);
    response.headers.set(HttpHeaders.contentTypeHeader, _contentType(assetKey));
    response.contentLength = bytes.length;
    if (request.method == 'GET') response.add(bytes);
    await response.close();
  }

  String _contentType(String path) {
    if (path.endsWith('.html')) return 'text/html; charset=utf-8';
    if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
    if (path.endsWith('.css')) return 'text/css; charset=utf-8';
    if (path.endsWith('.json')) return 'application/json; charset=utf-8';
    if (path.endsWith('.wasm')) return 'application/wasm';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    return 'application/octet-stream';
  }
}
