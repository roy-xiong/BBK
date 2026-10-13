import 'dart:io';
import 'dart:ui';

import 'package:bbk_classics/data/repositories/game_save_repository.dart';
import 'package:bbk_classics/data/services/app_file_store.dart';
import 'package:bbk_classics/data/services/local_game_server.dart';
import 'package:bbk_classics/domain/models/app_settings.dart';
import 'package:bbk_classics/domain/models/game_definition.dart';
import 'package:bbk_classics/ui/features/game/view_models/game_view_model.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // 本测试只请求真实回环地址，关闭 Flutter 测试默认的 HTTP 400 替身。
  HttpOverrides.global = null;

  Future<(LocalGameServer, GameSaveRepository)> dependencies() async {
    final directory = await Directory.systemTemp.createTemp('bbk-load-test-');
    final saves = GameSaveRepository(
      fileStore: AppFileStore(rootDirectory: directory),
    );
    final server = LocalGameServer(gameSaveRepository: saves);
    addTearDown(() async {
      await server.stop();
      await directory.delete(recursive: true);
    });
    return (server, saves);
  }

  GameViewModel viewModel(LocalGameServer server, GameSaveRepository saves) =>
      GameViewModel(
        game: GameDefinition.all.first,
        initialSettings: AppSettings.defaults,
        saveRepository: saves,
        localGameServer: server,
        onExitRequested: () {},
        onEnemyCityRequested: (_) {},
        onNoticeRequested: (_) {},
      );

  test('并发启动只建立一个本地监听，停止后释放端口', () async {
    final (server, _) = await dependencies();
    final origins = await Future.wait(
      List.generate(4, (_) async {
        await server.start();
        return server.entryUri(GameDefinition.all.first).origin;
      }),
    );
    expect(origins.toSet(), hasLength(1));
  });

  test('首个网页请求连接失败时重启服务并自动恢复游戏', () async {
    final (server, saves) = await dependencies();
    await server.start();
    final platform = _TestPlatform(server, failures: 1);
    WebViewPlatform.instance = platform;
    final model = viewModel(server, saves);
    addTearDown(model.dispose);
    await model.initialize();
    for (var i = 0; i < 100 && !model.isReady; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(platform.controller?.loads, 2, reason: '连接被关闭后必须恢复监听并重新请求，不能停在错误网页');
    expect(model.isReady, isTrue);
    expect(model.error, isNull);
  });

  test('连续失败最多自动重试一次，保留错误供手动重试', () async {
    final (server, saves) = await dependencies();
    await server.start();
    final platform = _TestPlatform(server, failures: 10);
    WebViewPlatform.instance = platform;
    final model = viewModel(server, saves);
    addTearDown(model.dispose);
    await model.initialize();
    await Future<void>.delayed(const Duration(milliseconds: 250));
    expect(platform.controller?.loads, 2);
    expect(model.error, isNotNull);
    expect(model.isReady, isFalse);
  });
}

/// 在真实本地 HTTP 服务断开后产生与 WebView 相同的连接错误，恢复后实际请求首页。
class _TestPlatform extends WebViewPlatform {
  _TestPlatform(this.server, {required this.failures});
  final LocalGameServer server;
  final int failures;
  _TestController? controller;
  @override
  PlatformWebViewController createPlatformWebViewController(
    PlatformWebViewControllerCreationParams params,
  ) => controller = _TestController(params, server, failures);
  @override
  PlatformNavigationDelegate createPlatformNavigationDelegate(
    PlatformNavigationDelegateCreationParams params,
  ) => _TestDelegate(params);
}

class _TestDelegate extends PlatformNavigationDelegate {
  _TestDelegate(super.params) : super.implementation();
  WebResourceErrorCallback? error;
  @override
  Future<void> setOnWebResourceError(WebResourceErrorCallback callback) async {
    error = callback;
  }

  @override
  Future<void> setOnNavigationRequest(
    NavigationRequestCallback callback,
  ) async {}
  @override
  Future<void> setOnProgress(ProgressCallback callback) async {}
  @override
  Future<void> setOnPageFinished(PageEventCallback callback) async {}
}

class _TestController extends PlatformWebViewController {
  _TestController(super.params, this.server, this.failures)
    : super.implementation();
  final LocalGameServer server;
  final int failures;
  int loads = 0;
  _TestDelegate? delegate;
  final Map<String, JavaScriptChannelParams> channels = {};
  @override
  Future<void> setJavaScriptMode(JavaScriptMode mode) async {}
  @override
  Future<void> setBackgroundColor(Color color) async {}
  @override
  Future<void> addJavaScriptChannel(JavaScriptChannelParams params) async {
    channels[params.name] = params;
  }

  @override
  Future<void> setPlatformNavigationDelegate(
    PlatformNavigationDelegate value,
  ) async {
    delegate = value as _TestDelegate;
  }

  @override
  Future<void> runJavaScript(String script) async {}
  @override
  Future<Object> runJavaScriptReturningResult(String script) async => '{}';
  @override
  Future<void> loadRequest(LoadRequestParams params) async {
    loads++;
    if (loads <= failures) await server.stop();
    final client = HttpClient();
    try {
      final request = await client.getUrl(params.uri);
      final response = await request.close();
      await response.drain<void>();
      if (response.statusCode != 200) {
        throw StateError('首页请求失败：${response.statusCode}');
      }
      channels['BbkSystemChannel']?.onMessageReceived(
        const JavaScriptMessage(message: 'ready'),
      );
    } on SocketException {
      delegate?.error?.call(
        WebResourceError(
          errorCode: -6,
          description: 'net::ERR_CONNECTION_REFUSED',
          errorType: WebResourceErrorType.connect,
          isForMainFrame: true,
          url: params.uri.toString(),
        ),
      );
    } finally {
      client.close(force: true);
    }
  }
}
