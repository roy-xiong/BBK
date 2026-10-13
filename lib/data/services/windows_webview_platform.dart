import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';
import 'package:webview_windows/webview_windows.dart' as windows;

/// Windows WebView2 对既有 WebViewController 接口的适配。
///
/// 仅 Windows 注册；游戏和存档沿用移动端的 JS 通道、回环地址与控制逻辑。
/// 固定运行时位于绿色包的 WebView2 目录，用户数据存于应用支持目录。
class WindowsGameWebViewPlatform extends WebViewPlatform {
  static Future<void> register() async {
    if (!Platform.isWindows) return;
    final support = await getApplicationSupportDirectory();
    final runtime = Directory(
      '${File(Platform.resolvedExecutable).parent.path}/WebView2',
    );
    await windows.WebviewController.initializeEnvironment(
      userDataPath: '${support.path}/webview2',
      browserExePath: await runtime.exists() ? runtime.path : null,
    );
    WebViewPlatform.instance = WindowsGameWebViewPlatform();
  }

  @override
  PlatformWebViewController createPlatformWebViewController(
    PlatformWebViewControllerCreationParams params,
  ) => WindowsGameWebViewController(params);
  @override
  PlatformNavigationDelegate createPlatformNavigationDelegate(
    PlatformNavigationDelegateCreationParams params,
  ) => _WindowsNavigationDelegate(params);
  @override
  PlatformWebViewWidget createPlatformWebViewWidget(
    PlatformWebViewWidgetCreationParams params,
  ) => _WindowsWebViewWidget(params);
}

class WindowsGameWebViewController extends PlatformWebViewController {
  WindowsGameWebViewController(super.params) : super.implementation() {
    _ready = _initialize();
  }
  final windows.WebviewController native = windows.WebviewController();
  late final Future<void> _ready;
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  final Map<String, JavaScriptChannelParams> _channels = {};
  _WindowsNavigationDelegate? _delegate;
  String _url = '';
  bool _disposed = false;

  Future<void> _initialize() async {
    await native.initialize();
    await native.setPopupWindowPolicy(windows.WebviewPopupWindowPolicy.deny);
    _subscriptions.add(
      native.webMessage.listen((message) {
        if (_disposed || message is! Map) return;
        final channel = _channels[message['channel']];
        final value = message['message'];
        if (channel != null && value is String) {
          channel.onMessageReceived(JavaScriptMessage(message: value));
        }
      }),
    );
    _subscriptions.add(
      native.url.listen((url) {
        _url = url;
      }),
    );
    _subscriptions.add(
      native.loadingState.listen((state) {
        if (_disposed) return;
        if (state == windows.LoadingState.loading) {
          _delegate?.progress?.call(10);
        }
        if (state == windows.LoadingState.navigationCompleted) {
          _delegate?.progress?.call(100);
          _delegate?.finished?.call(_url);
        }
      }),
    );
    _subscriptions.add(
      native.onLoadError.listen((error) {
        if (_disposed) return;
        _delegate?.error?.call(
          WebResourceError(
            errorCode: -6,
            description: error.name,
            errorType: WebResourceErrorType.connect,
            isForMainFrame: true,
            url: _url,
          ),
        );
      }),
    );
  }

  @override
  Future<void> setJavaScriptMode(JavaScriptMode javaScriptMode) async {}
  @override
  Future<void> setBackgroundColor(Color color) async {
    await _ready;
    await native.setBackgroundColor(color);
  }

  @override
  Future<void> addJavaScriptChannel(
    JavaScriptChannelParams javaScriptChannelParams,
  ) async {
    await _ready;
    if (_disposed) return;
    _channels[javaScriptChannelParams.name] = javaScriptChannelParams;
    await native.addScriptToExecuteOnDocumentCreated(
      'window[${jsonEncode(javaScriptChannelParams.name)}]={postMessage:function(message){window.chrome.webview.postMessage({channel:${jsonEncode(javaScriptChannelParams.name)},message:String(message)});}};',
    );
  }

  @override
  Future<void> setPlatformNavigationDelegate(
    PlatformNavigationDelegate handler,
  ) async {
    _delegate = handler as _WindowsNavigationDelegate;
  }

  @override
  Future<void> loadRequest(LoadRequestParams params) async {
    await _ready;
    if (_disposed) return;
    final decision = await _delegate?.navigation?.call(
      NavigationRequest(url: params.uri.toString(), isMainFrame: true),
    );
    if (decision == NavigationDecision.prevent) return;
    _url = params.uri.toString();
    await native.loadUrl(_url);
  }

  @override
  Future<void> runJavaScript(String javaScript) async {
    await _ready;
    if (!_disposed) await native.executeScript(javaScript);
  }

  @override
  Future<Object> runJavaScriptReturningResult(String javaScript) async {
    await _ready;
    if (_disposed) return '{}';
    return await native.executeScript(javaScript) ?? 'null';
  }

  /// 页面销毁后取消回调并释放 WebView2，拒绝旧会话继续写入存档或更新 UI。
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    try {
      await _ready;
      for (final subscription in _subscriptions) {
        await subscription.cancel();
      }
      _channels.clear();
      await native.dispose();
    } on Object {
      /* 初始化失败时页面已显示错误，释放阶段不再抛出异步异常。 */
    }
  }
}

class _WindowsNavigationDelegate extends PlatformNavigationDelegate {
  _WindowsNavigationDelegate(super.params) : super.implementation();
  ProgressCallback? progress;
  PageEventCallback? finished;
  WebResourceErrorCallback? error;
  NavigationRequestCallback? navigation;
  @override
  Future<void> setOnProgress(ProgressCallback callback) async {
    progress = callback;
  }

  @override
  Future<void> setOnPageFinished(PageEventCallback callback) async {
    finished = callback;
  }

  @override
  Future<void> setOnWebResourceError(WebResourceErrorCallback callback) async {
    error = callback;
  }

  @override
  Future<void> setOnNavigationRequest(
    NavigationRequestCallback callback,
  ) async {
    navigation = callback;
  }
}

class _WindowsWebViewWidget extends PlatformWebViewWidget {
  _WindowsWebViewWidget(super.params) : super.implementation();
  @override
  Widget build(BuildContext context) => windows.Webview(
    (params.controller as WindowsGameWebViewController).native,
    permissionRequested: (_, _, _) async =>
        windows.WebviewPermissionDecision.deny,
  );
}
