import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../data/services/bbk_runtime_service.dart';
import '../../../../data/services/game_controller_service.dart';
import '../../../../data/services/game_screen_awake_service.dart';
import '../../../../domain/models/bbk_game.dart';
import '../../../../domain/models/game_definition.dart';
import '../../game/views/game_controls_overlay.dart';
import 'bbk_cheat_sheet.dart';

/// 原机玩家页面。画面使用 native Texture，按钮仅调用平台控制通道。
class BbkPlayerPage extends StatefulWidget {
  const BbkPlayerPage({super.key, required this.game, required this.model});
  final BbkGame game;
  final String model;
  @override
  State<BbkPlayerPage> createState() => _BbkPlayerPageState();
}

class _BbkPlayerPageState extends State<BbkPlayerPage>
    with WidgetsBindingObserver {
  final BbkRuntimeService _runtime = BbkRuntimeService();
  final GameControllerService _controller = GameControllerService();
  StreamSubscription<dynamic>? _events;
  late final Future<void> _boot;
  String? _error;
  bool _ready = false;
  bool _paused = false;
  bool _muted = false;
  bool _busy = false;
  bool _leaving = false;
  bool _canPop = false;
  bool _landscape = false;
  int _speed = 1;
  int _lcdQuarterTurns = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _controller.start(_sendInput);
    _events = BbkRuntimeService.events.receiveBroadcastStream().listen(
      (event) {
        if (!mounted ||
            event is! Map ||
            event['session'] != _runtime.sessionId) {
          return;
        }
        final message = event['message'];
        if (message is! String) return;
        if (event['type'] == 'error' || event['type'] == 'stopped') {
          setState(() {
            _paused = true;
            _error = message;
          });
        }
        _notice(message);
      },
      onError: (Object error) {
        if (mounted) _notice(_message(error));
      },
    );
    _boot = _start();
  }

  Future<void> _start() async {
    try {
      await _runtime.start(widget.game.id, widget.model);
      if (!mounted || _leaving) return;
      await GameScreenAwakeService.setEnabled(true);
      if (mounted) setState(() => _ready = true);
    } on Object catch (error) {
      if (mounted) setState(() => _error = _message(error));
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    unawaited(
      GameScreenAwakeService.setEnabled(
        state == AppLifecycleState.resumed && _ready && !_leaving,
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_events?.cancel());
    unawaited(_controller.dispose());
    unawaited(
      _runtime.close().catchError((Object error) {
        debugPrint('BbkRuntime close: $error');
      }),
    );
    unawaited(GameScreenAwakeService.setEnabled(false));
    super.dispose();
  }

  String _message(Object error) => error is PlatformException
      ? error.message ?? error.code
      : error.toString();
  void _notice(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  void _sendInput(GameInput input) {
    final code = switch (input) {
      GameInput.up => 0x35,
      GameInput.down => 0x38,
      GameInput.left => 0x37,
      GameInput.right => 0x39,
      GameInput.confirm => 0x2f,
      GameInput.cancel => 0x2e,
      GameInput.pageUp => 0x3a,
      GameInput.pageDown => 0x3b,
      GameInput.search => widget.model == 'a4988' ? 0x28 : 0x2a,
      GameInput.help => widget.model == 'a4988' ? 0x21 : 0x29,
      _ => null,
    };
    if (code != null) _sendCode(code);
  }

  void _sendCode(int code) {
    if (!_ready || _paused || _leaving || _busy) return;
    unawaited(
      _runtime.invoke('input', <String, Object>{'code': code}).catchError((
        Object error,
      ) {
        if (mounted) _notice(_message(error));
      }),
    );
  }

  Future<void> _perform(Future<void> Function() action) async {
    if (_busy || _leaving || !_ready) return;
    setState(() => _busy = true);
    try {
      await action();
    } on Object catch (error) {
      if (mounted) _notice(_message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pause() => _perform(() async {
    await _runtime.invoke('pause', <String, Object>{'paused': !_paused});
    if (mounted) setState(() => _paused = !_paused);
  });

  Future<void> _speedUp() => _perform(() async {
    const speeds = [1, 2, 3, 4, 6, 8];
    final next = speeds[(speeds.indexOf(_speed) + 1) % speeds.length];
    await _runtime.command(<String, Object>{'op': 'speed', 'value': next});
    if (mounted) setState(() => _speed = next);
  });

  Future<void> _rotate() async {
    await SystemChrome.setPreferredOrientations(
      _landscape
          ? const [DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]
          : const [
              DeviceOrientation.landscapeLeft,
              DeviceOrientation.landscapeRight,
            ],
    );
    if (mounted) setState(() => _landscape = !_landscape);
  }

  Future<void> _keyboard() async {
    const codes = {
      '菜单': 0x01,
      '空格': 0x36,
      '插入': 0x2b,
      '修改': 0x2c,
      '删除': 0x2d,
      '1': 0x08,
      '2': 0x09,
      '3': 0x0a,
      '4': 0x0b,
      '5': 0x0c,
      '6': 0x0d,
      '7': 0x0e,
      '8': 0x0f,
      '9': 0x30,
      '0': 0x31,
      'Q': 0x10,
      'W': 0x11,
      'E': 0x12,
      'R': 0x13,
      'T': 0x14,
      'Y': 0x15,
      'U': 0x16,
      'I': 0x17,
      'A': 0x18,
      'S': 0x19,
      'D': 0x1a,
      'F': 0x1b,
      'G': 0x1c,
      'H': 0x1d,
      'J': 0x1e,
      'K': 0x1f,
      'Z': 0x21,
      'X': 0x22,
      'C': 0x23,
      'V': 0x24,
      'B': 0x25,
      'N': 0x26,
      'M': 0x27,
      'O': 0x32,
      'P': 0x33,
      'L': 0x34,
    };
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.55,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: codes.entries
                  .map(
                    (key) => FilledButton.tonal(
                      onPressed: () => _sendCode(key.value),
                      child: Text(key.key),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
      ),
    );
  }

  /// 正常返回等待首次初始化和存档落盘完成，用户不能在上局仍关闭时启动下一局。
  Future<void> _exit() async {
    if (_leaving) return;
    setState(() => _leaving = true);
    await _boot;
    try {
      await _runtime.close();
    } on Object catch (error) {
      if (mounted) _notice('退出时保存失败：${_message(error)}');
    }
    await GameScreenAwakeService.setEnabled(false);
    await SystemChrome.setPreferredOrientations(const [
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    if (!mounted) return;
    setState(() => _canPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).pop();
    });
  }

  Widget _screen() {
    final texture = _runtime.textureId;
    return Center(
      child: AspectRatio(
        aspectRatio: _lcdQuarterTurns.isEven ? 159 / 96 : 96 / 159,
        child: RotatedBox(
          quarterTurns: _lcdQuarterTurns,
          child: texture == null
              ? const SizedBox.shrink()
              : Texture(textureId: texture, filterQuality: FilterQuality.none),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<void>(
      canPop: _canPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_exit());
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            onPressed: _leaving ? null : _exit,
            icon: const Icon(Icons.arrow_back),
          ),
          title: Text(
            widget.game.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          actions: [
            IconButton(
              tooltip: _paused ? '继续' : '暂停',
              onPressed: _busy || !_ready ? null : _pause,
              icon: Icon(_paused ? Icons.play_arrow : Icons.pause),
            ),
            PopupMenuButton<String>(
              enabled: _ready && !_busy && !_leaving,
              onSelected: (action) {
                switch (action) {
                  case 'save':
                    unawaited(
                      _perform(() async {
                        await _runtime.invoke('saveState');
                        if (mounted) _notice('即时状态已保存');
                      }),
                    );
                  case 'load':
                    unawaited(
                      _perform(() async {
                        await _runtime.invoke('loadState');
                        if (mounted) _notice('即时状态已恢复');
                      }),
                    );
                  case 'mute':
                    unawaited(
                      _perform(() async {
                        await _runtime.invoke('mute', {'muted': !_muted});
                        if (mounted) setState(() => _muted = !_muted);
                      }),
                    );
                  case 'lcd':
                    setState(
                      () => _lcdQuarterTurns = (_lcdQuarterTurns + 1) % 4,
                    );
                  case 'keys':
                    unawaited(_keyboard());
                }
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'save', child: Text('保存即时状态')),
                const PopupMenuItem(value: 'load', child: Text('恢复即时状态')),
                PopupMenuItem(
                  value: 'mute',
                  child: Text(_muted ? '开启声音' : '静音'),
                ),
                const PopupMenuItem(value: 'lcd', child: Text('旋转 LCD 画面')),
                const PopupMenuItem(value: 'keys', child: Text('完整原机键盘')),
              ],
            ),
          ],
        ),
        body: SafeArea(
          child: !_ready
              ? Center(
                  child: _error == null
                      ? const CircularProgressIndicator()
                      : Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(_error!, textAlign: TextAlign.center),
                        ),
                )
              : Column(
                  children: [
                    if (_busy || _leaving) const LinearProgressIndicator(),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 4,
                      ),
                      child: Wrap(
                        spacing: 8,
                        alignment: WrapAlignment.center,
                        children: [
                          TextButton(
                            onPressed: _busy ? null : _speedUp,
                            child: Text('速度 $_speed×'),
                          ),
                          TextButton(
                            onPressed: _busy ? null : _rotate,
                            child: const Text('横竖屏'),
                          ),
                          TextButton(
                            onPressed: _busy
                                ? null
                                : () => showModalBottomSheet<void>(
                                    context: context,
                                    isScrollControlled: true,
                                    useSafeArea: true,
                                    builder: (_) =>
                                        BbkCheatSheet(runtime: _runtime),
                                  ),
                            child: const Text('作弊器'),
                          ),
                          TextButton(
                            onPressed: _keyboard,
                            child: const Text('原机键盘'),
                          ),
                        ],
                      ),
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text(
                          _error!,
                          style: const TextStyle(color: Colors.orange),
                        ),
                      ),
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          if (constraints.maxWidth > constraints.maxHeight) {
                            return Stack(
                              children: [
                                _screen(),
                                GameControlsOverlay(
                                  hapticsEnabled: false,
                                  onInput: _sendInput,
                                ),
                              ],
                            );
                          }
                          return Column(
                            children: [
                              Expanded(flex: 5, child: _screen()),
                              Expanded(
                                flex: 6,
                                child: PortraitGameControlsPanel(
                                  isDarkTheme: true,
                                  hapticsEnabled: false,
                                  onInput: _sendInput,
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
