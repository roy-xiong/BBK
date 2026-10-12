import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import '../../../../data/services/emulator_session_server.dart';
import '../../../../data/services/local_game_server.dart';
import '../../../../domain/models/emulator_rom.dart';

/// 浏览器异步命令结果通过 Channel 回传，不能把 evaluateJavascript 的 Promise 当返回值。
class EmulatorResult {
  const EmulatorResult(this.ok, this.message, [this.value]);
  final bool ok;
  final String message;
  final Object? value;
}

/// 单个模拟器 WebView 会话：ROM 来源、生命周期、手柄和请求回调均有明确释放边界。
class EmulatorViewModel extends ChangeNotifier {
  EmulatorViewModel({
    required this.rom,
    required this.rootPath,
    required this.localGameServer,
  });
  final EmulatorRom rom;
  final String rootPath;
  final LocalGameServer localGameServer;
  WebViewController? controller;
  EmulatorLocalSession? _session;
  StreamSubscription<dynamic>? _gamepad;
  final Map<int, Completer<EmulatorResult>> _requests = {};
  final Map<String, int> _pressedSources = {};
  Future<void> _inputTail = Future.value();
  Timer? _bootTimeout;
  int _requestId = 0;
  bool _disposed = false;
  bool _closing = false;
  bool _active = true;
  bool _uiPaused = false;
  bool ready = false;
  bool paused = false;
  String? error;

  Future<void> initialize() async {
    try {
      final session = await localGameServer.emulatorSessions.open(
        rom,
        rootPath,
      );
      if (_disposed) {
        localGameServer.emulatorSessions.close(session);
        return;
      }
      _session = session;
      final web = WebViewController();
      await web.setJavaScriptMode(JavaScriptMode.unrestricted);
      await web.setBackgroundColor(const Color(0xff000000));
      if (web.platform is AndroidWebViewController) {
        await (web.platform as AndroidWebViewController)
            .setMediaPlaybackRequiresUserGesture(false);
      }
      await web.addJavaScriptChannel(
        'BbkEmulatorChannel',
        onMessageReceived: _onMessage,
      );
      await web.setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) =>
              (request.url == 'about:blank' ||
                  localGameServer.isLocalUrl(request.url))
              ? NavigationDecision.navigate
              : NavigationDecision.prevent,
          onWebResourceError: (failure) {
            if (!_disposed && (failure.isForMainFrame ?? false)) {
              error = failure.description;
              notifyListeners();
            }
          },
        ),
      );
      if (_disposed) {
        localGameServer.emulatorSessions.close(session);
        return;
      }
      controller = web;
      _gamepad =
          const EventChannel(
            'com.xiongjian.bbkclassics/emulator_gamepad_events',
          ).receiveBroadcastStream().listen((event) {
            if (event is! Map) return;
            final button = event['button'];
            final source = event['source'];
            if (button is int && source is String && event['pressed'] is bool) {
              setInput('pad:$source', button, event['pressed'] as bool);
            }
          }, onError: (Object _) {});
      notifyListeners();
      _bootTimeout = Timer(const Duration(minutes: 2), () {
        if (!_disposed && !ready) {
          error = '加载超时，请检查 ROM 与 BIOS 是否匹配';
          notifyListeners();
        }
      });
      await web.loadRequest(localGameServer.emulatorEntryUri(session));
    } on Object catch (failure) {
      if (!_disposed) {
        error = failure.toString();
        notifyListeners();
      }
    }
  }

  void _onMessage(JavaScriptMessage message) {
    if (_disposed) return;
    try {
      final data = jsonDecode(message.message);
      if (data is! Map) return;
      if (data['type'] == 'ready') {
        _bootTimeout?.cancel();
        ready = true;
        error = null;
        if (!_active) unawaited(setActive(false));
        notifyListeners();
      } else if (data['type'] == 'error') {
        _bootTimeout?.cancel();
        error = data['message'] is String
            ? data['message'] as String
            : '模拟器运行失败';
        notifyListeners();
      } else if (data['type'] == 'reply' && data['id'] is int) {
        final completer = _requests.remove(data['id']);
        if (completer != null && !completer.isCompleted) {
          completer.complete(
            EmulatorResult(
              data['ok'] == true,
              data['message'] as String? ?? '',
              data['value'],
            ),
          );
        }
      }
    } on FormatException {
      /* 损坏消息不参与状态更新。 */
    }
  }

  /// 输入按来源计数，斜向与多键独立；只在状态边沿跨 JS 桥，并串行保证按下/释放顺序。
  void setInput(String source, int button, bool pressed) {
    if (_disposed ||
        _closing ||
        !ready ||
        !_active ||
        paused ||
        _uiPaused ||
        button < 0 ||
        button > 11) {
      return;
    }
    final wasPressed = _pressedSources.containsValue(button);
    if (pressed) {
      _pressedSources[source] = button;
    } else {
      _pressedSources.remove(source);
    }
    final nowPressed = _pressedSources.containsValue(button);
    if (wasPressed == nowPressed) return;
    _sendInput(button, nowPressed);
  }

  void _sendInput(int button, bool pressed) {
    final web = controller;
    if (web == null) return;
    _inputTail = _inputTail
        .then((_) async {
          if (!_disposed) {
            await web.runJavaScript(
              'window.bbkEmulatorInput?.($button, ${pressed ? 1 : 0});',
            );
          }
        })
        .catchError((Object _) {});
  }

  void releaseInputs() {
    final buttons = _pressedSources.values.toSet();
    _pressedSources.clear();
    for (final button in buttons) {
      _sendInput(button, false);
    }
  }

  /// JS 命令只接受固定动作，参数 JSON 编码；异步结果通过 ID 配对且有超时/销毁兜底。
  Future<EmulatorResult> execute(
    String action, [
    Map<String, Object?> parameters = const {},
  ]) async {
    final web = controller;
    if (_disposed || !ready || web == null) {
      return const EmulatorResult(false, '游戏尚未就绪');
    }
    final id = ++_requestId;
    final completer = Completer<EmulatorResult>();
    _requests[id] = completer;
    try {
      await web.runJavaScript(
        'window.bbkEmulatorRequest($id, ${jsonEncode(action)}, ${jsonEncode(parameters)});',
      );
      return await completer.future.timeout(
        const Duration(seconds: 30),
        onTimeout: () => const EmulatorResult(false, '操作超时，请稍后重试'),
      );
    } on Object catch (failure) {
      return EmulatorResult(false, failure.toString());
    } finally {
      _requests.remove(id);
    }
  }

  /// 前后台统一先释放按键再暂停，后台请求 SRAM 与自动即时存档，不开启额外模拟主循环。
  Future<void> setActive(bool active) async {
    _active = active;
    releaseInputs();
    if (!ready) return;
    if (!active) {
      await execute('pause', {'paused': true});
      await execute('snapshot');
    } else {
      await execute('pause', {'paused': paused || _uiPaused});
    }
  }

  /// 原生面板暂停独立于用户的暂停开关，关闭面板时保留前后台与手动暂停状态。
  Future<void> setUiPaused(bool value) async {
    _uiPaused = value;
    releaseInputs();
    await execute('pause', {'paused': value || paused || !_active});
  }

  Future<EmulatorResult> togglePause() async {
    releaseInputs();
    final result = await execute('pause', {'paused': !paused});
    if (result.ok && !_disposed) {
      paused = !paused;
      notifyListeners();
    }
    return result;
  }

  /// 先等待浏览器存档 POST 确认，再释放本地路由；不能在 HTTP 写入途中切断会话。
  Future<EmulatorResult> finish() async {
    _closing = true;
    releaseInputs();
    final result = ready
        ? await execute('snapshot')
        : const EmulatorResult(true, '');
    if (!result.ok) {
      _closing = false;
      return result;
    }
    final web = controller;
    if (web != null) {
      try {
        await web.runJavaScript('window.bbkEmulatorShutdown?.();');
      } on Object {
        /* 页面可能已经释放。 */
      }
    }
    await _session?.pendingWrites;
    return result;
  }

  @override
  void dispose() {
    _disposed = true;
    _bootTimeout?.cancel();
    unawaited(_gamepad?.cancel());
    for (final request in _requests.values) {
      if (!request.isCompleted) {
        request.complete(const EmulatorResult(false, '游戏已关闭'));
      }
    }
    _requests.clear();
    _pressedSources.clear();
    final session = _session;
    if (session != null) localGameServer.emulatorSessions.close(session);
    final web = controller;
    if (web != null) {
      unawaited(_releaseWebView(web));
    }
    controller = null;
    super.dispose();
  }

  /// 退出后载入空页面，释放大 WASM heap 和网页监听器，不依赖平台视图何时被 GC。
  Future<void> _releaseWebView(WebViewController web) async {
    try {
      await web.runJavaScript('window.bbkEmulatorShutdown?.();');
      await web.loadHtmlString('<html><body></body></html>');
    } on Object {
      /* 平台视图已销毁时不再重试。 */
    }
  }
}
