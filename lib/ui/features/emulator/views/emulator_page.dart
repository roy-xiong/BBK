import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../../../data/services/game_screen_awake_service.dart';
import '../../../../data/services/local_game_server.dart';
import '../../../../domain/models/emulator_rom.dart';
import '../view_models/emulator_view_model.dart';

/// 外置 ROM 的独立承载页；模拟器按钮使用真实按下/释放，不重复发送菜单型点击。
class EmulatorPage extends StatefulWidget {
  const EmulatorPage({
    super.key,
    required this.rom,
    required this.rootPath,
    required this.localGameServer,
  });
  final EmulatorRom rom;
  final String rootPath;
  final LocalGameServer localGameServer;
  @override
  State<EmulatorPage> createState() => _EmulatorPageState();
}

class _EmulatorPageState extends State<EmulatorPage>
    with WidgetsBindingObserver {
  late final EmulatorViewModel _model;
  bool _allowPop = false;
  bool _leaving = false;
  bool _operationBusy = false;
  bool _landscape = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _model = EmulatorViewModel(
      rom: widget.rom,
      rootPath: widget.rootPath,
      localGameServer: widget.localGameServer,
    );
    unawaited(GameScreenAwakeService.setEnabled(true));
    unawaited(_model.initialize());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final active = state == AppLifecycleState.resumed;
    unawaited(GameScreenAwakeService.setEnabled(active));
    unawaited(_model.setActive(active));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(GameScreenAwakeService.setEnabled(false));
    _model.dispose();
    unawaited(
      SystemChrome.setPreferredOrientations(const [
        DeviceOrientation.portraitUp,
        DeviceOrientation.portraitDown,
      ]),
    );
    super.dispose();
  }

  void _notice(String message) {
    if (!mounted || message.isEmpty) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _command(String action) async {
    if (_operationBusy) return;
    setState(() => _operationBusy = true);
    _model.releaseInputs();
    try {
      final result = action == 'pause'
          ? await _model.togglePause()
          : await _model.execute(action);
      _notice(result.message);
    } finally {
      if (mounted) setState(() => _operationBusy = false);
    }
  }

  /// 快速重复返回只展示一个确认；存档失败保留会话，让用户重试或明确选择不保存退出。
  Future<void> _leave() async {
    if (_leaving) return;
    _leaving = true;
    _model.releaseInputs();
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('退出模拟器？'),
          content: const Text('退出前将保存游戏存档和当前即时进度。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('继续游戏'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('保存并退出'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      final result = await _model.finish();
      if (!mounted) return;
      if (!result.ok) {
        final discard = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('存档失败'),
            content: Text(result.message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('返回重试'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('不保存退出'),
              ),
            ],
          ),
        );
        if (discard != true || !mounted) return;
      }
      setState(() => _allowPop = true);
      await Future<void>.delayed(Duration.zero);
      if (mounted) Navigator.of(context).pop();
    } finally {
      _leaving = false;
    }
  }

  Future<void> _rotate() async {
    _model.releaseInputs();
    _landscape = !_landscape;
    await SystemChrome.setPreferredOrientations(
      _landscape
          ? const [
              DeviceOrientation.landscapeLeft,
              DeviceOrientation.landscapeRight,
            ]
          : const [DeviceOrientation.portraitUp],
    );
  }

  /// 金手指在打开面板期间暂停，支持预置开关、手工添加与删除，避免菜单和游戏争抢输入。
  Future<void> _cheats() async {
    if (_operationBusy) return;
    setState(() => _operationBusy = true);
    _model.releaseInputs();
    await _model.setUiPaused(true);
    var rows = <Map<String, dynamic>>[];
    Future<void> refresh() async {
      final result = await _model.execute('getCheats');
      final value = result.value;
      rows = value is List
          ? value
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList()
          : [];
    }

    final nameController = TextEditingController();
    final codeController = TextEditingController();
    try {
      await refresh();
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (sheetContext) => StatefulBuilder(
          builder: (context, setSheetState) => Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              20,
              20,
              MediaQuery.viewInsetsOf(context).bottom + 20,
            ),
            child: SizedBox(
              height: MediaQuery.sizeOf(context).height * .65,
              child: ListView(
                children: [
                  Text('金手指', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  const Text(
                    '代码需与当前 ROM 和模拟器匹配。Neo Geo 开机自检完成后再开启；部分代码关闭后需要重启游戏。',
                  ),
                  const SizedBox(height: 12),
                  if (rows.isEmpty) const Text('暂无金手指，可手工添加或放入 BBK/CHEATS。'),
                  for (var i = 0; i < rows.length; i++)
                    SwitchListTile(
                      title: Text(rows[i]['desc'] as String? ?? '金手指'),
                      subtitle: Text(rows[i]['code'] as String? ?? ''),
                      value: rows[i]['checked'] == true,
                      onChanged: (enabled) async {
                        final result = await _model.execute('toggleCheat', {
                          'index': i,
                          'enabled': enabled,
                        });
                        await refresh();
                        if (context.mounted) setSheetState(() {});
                        if (!result.ok) _notice(result.message);
                      },
                      secondary: IconButton(
                        tooltip: '删除',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () async {
                          final result = await _model.execute('removeCheat', {
                            'index': i,
                          });
                          await refresh();
                          if (context.mounted) setSheetState(() {});
                          if (!result.ok) _notice(result.message);
                        },
                      ),
                    ),
                  const Divider(),
                  TextField(
                    controller: nameController,
                    maxLength: 80,
                    decoration: const InputDecoration(labelText: '名称'),
                  ),
                  TextField(
                    controller: codeController,
                    maxLength: 200,
                    decoration: const InputDecoration(labelText: '金手指代码'),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: () async {
                      final result = await _model.execute('addCheat', {
                        'desc': nameController.text.trim(),
                        'code': codeController.text.trim(),
                      });
                      if (result.ok) {
                        nameController.clear();
                        codeController.clear();
                      }
                      await refresh();
                      if (context.mounted) setSheetState(() {});
                      _notice(result.message);
                    },
                    child: const Text('添加（默认关闭）'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    } finally {
      nameController.dispose();
      codeController.dispose();
      await _model.setUiPaused(false);
      if (mounted) setState(() => _operationBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: _allowPop,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) unawaited(_leave());
    },
    child: ListenableBuilder(
      listenable: _model,
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          leading: IconButton(
            onPressed: _leave,
            icon: const Icon(Icons.arrow_back),
          ),
          title: Text(
            widget.rom.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          actions: [
            IconButton(
              tooltip: '横竖屏',
              onPressed: _rotate,
              icon: const Icon(Icons.screen_rotation),
            ),
          ],
        ),
        body: SafeArea(
          child: Column(
            children: [
              Wrap(
                spacing: 4,
                children: [
                  TextButton.icon(
                    onPressed: _model.ready && !_operationBusy
                        ? () => _command('pause')
                        : null,
                    icon: Icon(_model.paused ? Icons.play_arrow : Icons.pause),
                    label: Text(_model.paused ? '继续' : '暂停'),
                  ),
                  TextButton.icon(
                    onPressed: _model.ready && !_operationBusy
                        ? () => _command('saveState')
                        : null,
                    icon: const Icon(Icons.save),
                    label: const Text('存档'),
                  ),
                  TextButton.icon(
                    onPressed: _model.ready && !_operationBusy
                        ? () => _command('loadState')
                        : null,
                    icon: const Icon(Icons.restore),
                    label: const Text('读档'),
                  ),
                  TextButton.icon(
                    onPressed: _model.ready && !_operationBusy ? _cheats : null,
                    icon: const Icon(Icons.auto_fix_high),
                    label: const Text('金手指'),
                  ),
                ],
              ),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final landscape =
                        constraints.maxWidth > constraints.maxHeight;
                    final web = _model.controller;
                    final surface = Stack(
                      fit: StackFit.expand,
                      children: [
                        if (web != null)
                          WebViewWidget(
                            controller: web,
                            gestureRecognizers: {
                              Factory<OneSequenceGestureRecognizer>(
                                EagerGestureRecognizer.new,
                              ),
                            },
                          ),
                        if (_model.error != null)
                          ColoredBox(
                            color: const Color(0xee101214),
                            child: Center(
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Text(
                                  _model.error!,
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ),
                          )
                        else if (!_model.ready)
                          const ColoredBox(
                            color: Colors.black,
                            child: Center(child: CircularProgressIndicator()),
                          ),
                      ],
                    );
                    final controls = _EmulatorControls(
                      arcade: widget.rom.family == 'arcade',
                      enabled:
                          _model.ready && !_model.paused && !_operationBusy,
                      onInput: _model.setInput,
                    );
                    if (landscape) {
                      return Stack(
                        children: [
                          Positioned.fill(child: surface),
                          Positioned(
                            left: 8,
                            right: 8,
                            bottom: 4,
                            child: controls,
                          ),
                        ],
                      );
                    }
                    return Column(
                      children: [
                        Expanded(
                          child: ColoredBox(
                            color: Colors.black,
                            child: Center(
                              child: AspectRatio(
                                aspectRatio: 4 / 3,
                                child: surface,
                              ),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(10),
                          child: controls,
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
    ),
  );
}

/// 独立模拟器按键：Listener 支持多点触控与按键滑出，方向按钮可以同时形成斜向。
class _EmulatorControls extends StatelessWidget {
  const _EmulatorControls({
    required this.arcade,
    required this.enabled,
    required this.onInput,
  });
  final bool arcade;
  final bool enabled;
  final void Function(String source, int button, bool pressed) onInput;

  @override
  Widget build(BuildContext context) {
    Widget key(String label, EmulatorButton button, {double width = 48}) =>
        _EmulatorKey(
          label: label,
          button: button.indexValue,
          enabled: enabled,
          width: width,
          onInput: onInput,
        );
    const blank = SizedBox.square(dimension: 48);
    final direction = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [blank, key('↑', EmulatorButton.up), blank],
        ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            key('←', EmulatorButton.left),
            blank,
            key('→', EmulatorButton.right),
          ],
        ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [blank, key('↓', EmulatorButton.down), blank],
        ),
      ],
    );
    final system = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        key(arcade ? '投币' : 'SELECT', EmulatorButton.select, width: 62),
        const SizedBox(height: 12),
        key('START', EmulatorButton.start, width: 62),
      ],
    );
    final actions = arcade
        ? Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  key('射击', EmulatorButton.b),
                  key('跳跃', EmulatorButton.a),
                ],
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  key('手雷', EmulatorButton.y),
                  key('D', EmulatorButton.x),
                ],
              ),
            ],
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              key('B', EmulatorButton.b),
              const SizedBox(width: 8),
              key('A', EmulatorButton.a),
            ],
          );
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          direction,
          const SizedBox(width: 22),
          system,
          const SizedBox(width: 22),
          actions,
        ],
      ),
    );
  }
}

class _EmulatorKey extends StatefulWidget {
  const _EmulatorKey({
    required this.label,
    required this.button,
    required this.enabled,
    required this.width,
    required this.onInput,
  });
  final String label;
  final int button;
  final bool enabled;
  final double width;
  final void Function(String, int, bool) onInput;
  @override
  State<_EmulatorKey> createState() => _EmulatorKeyState();
}

class _EmulatorKeyState extends State<_EmulatorKey> {
  final Set<int> _pointers = {};
  String _source(int pointer) => 'touch:${widget.button}:$pointer';
  void _release(int pointer) {
    if (_pointers.remove(pointer)) {
      widget.onInput(_source(pointer), widget.button, false);
    }
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(covariant _EmulatorKey oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.enabled) {
      for (final pointer in _pointers.toList()) {
        _release(pointer);
      }
    }
  }

  @override
  void dispose() {
    for (final pointer in _pointers) {
      widget.onInput(_source(pointer), widget.button, false);
    }
    _pointers.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: widget.label,
    child: Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (event) {
        if (!widget.enabled) return;
        _pointers.add(event.pointer);
        widget.onInput(_source(event.pointer), widget.button, true);
        setState(() {});
      },
      onPointerMove: (event) {
        if (!(Offset.zero & Size(widget.width, 48)).contains(
          event.localPosition,
        )) {
          _release(event.pointer);
        }
      },
      onPointerUp: (event) => _release(event.pointer),
      onPointerCancel: (event) => _release(event.pointer),
      child: Container(
        width: widget.width,
        height: 48,
        alignment: Alignment.center,
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: _pointers.isEmpty
              ? const Color(0xcc383d44)
              : const Color(0xffb32632),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          widget.label,
          style: const TextStyle(fontSize: 12, color: Colors.white),
        ),
      ),
    ),
  );
}
