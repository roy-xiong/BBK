import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../../app.dart';
import '../../../../domain/models/game_definition.dart';
import '../../settings/view_models/settings_view_model.dart';
import '../../settings/views/game_settings_sheet.dart';
import '../view_models/game_view_model.dart';
import 'game_cheat_sheet.dart';
import 'game_controls_overlay.dart';
import 'game_map_sheet.dart';

/// 游戏承载页面。
class GamePage extends StatefulWidget {
  const GamePage({
    super.key,
    required this.dependencies,
    required this.game,
    required this.settingsViewModel,
  });

  final AppDependencies dependencies;
  final GameDefinition game;
  final SettingsViewModel settingsViewModel;

  @override
  State<GamePage> createState() => _GamePageState();
}

class _GamePageState extends State<GamePage> with WidgetsBindingObserver {
  late final GameViewModel _viewModel;
  bool _allowPop = false;
  bool _leaving = false;
  bool _portraitRequested = true;
  bool _orientationChanging = false;
  bool _darkControls = true;
  late bool _lastFmjHighDefinition;
  Offset _toolbarOffset = const Offset(8, 8);

  static const double _toolbarHeight = 44;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _viewModel = GameViewModel(
      game: widget.game,
      initialSettings: widget.settingsViewModel.settings,
      saveRepository: widget.dependencies.gameSaveRepository,
      localGameServer: widget.dependencies.localGameServer,
      onExitRequested: () => unawaited(_leaveGame()),
    );
    _lastFmjHighDefinition =
        widget.settingsViewModel.settings.fmjHighDefinition;
    widget.settingsViewModel.addListener(_onSettingsChanged);
    unawaited(_enterGameMode());
    unawaited(_viewModel.initialize());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      unawaited(_viewModel.captureSaves());
    }
  }

  @override
  void dispose() {
    widget.settingsViewModel.removeListener(_onSettingsChanged);
    WidgetsBinding.instance.removeObserver(this);
    _viewModel.dispose();
    super.dispose();
  }

  /// 将设置页或工具栏中的画质变化同步给正在运行的伏魔记页面。
  ///
  /// 使用上次值去重，避免其他设置变化时重复跨平台调用 WebView。
  void _onSettingsChanged() {
    final enabled = widget.settingsViewModel.settings.fmjHighDefinition;
    if (enabled == _lastFmjHighDefinition) return;
    _lastFmjHighDefinition = enabled;
    unawaited(_viewModel.setFmjHighDefinition(enabled));
  }

  Future<void> _enterGameMode() async {
    await SystemChrome.setPreferredOrientations(const <DeviceOrientation>[
      DeviceOrientation.portraitUp,
    ]);
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  /// 在竖屏控制台和横屏悬浮控制之间切换。
  ///
  /// 通过状态位拦截快速重复点击，避免连续的平台方向请求产生界面抖动。
  Future<void> _toggleOrientation() async {
    if (_orientationChanging) return;
    _orientationChanging = true;
    final requestPortrait = !_portraitRequested;
    if (mounted) {
      setState(() => _portraitRequested = requestPortrait);
    }
    try {
      await SystemChrome.setPreferredOrientations(
        requestPortrait
            ? const <DeviceOrientation>[DeviceOrientation.portraitUp]
            : const <DeviceOrientation>[DeviceOrientation.landscapeLeft],
      );
    } finally {
      _orientationChanging = false;
    }
  }

  Future<void> _leaveGame() async {
    if (_leaving) return;
    _leaving = true;
    await _viewModel.captureSaves();
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    await SystemChrome.setPreferredOrientations(const <DeviceOrientation>[
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    if (!mounted) return;
    setState(() => _allowPop = true);
    await Future<void>.delayed(Duration.zero);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<void>(
      canPop: _allowPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_leaveGame());
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: ListenableBuilder(
          listenable: Listenable.merge(<Listenable>[
            _viewModel,
            widget.settingsViewModel,
          ]),
          builder: (context, _) {
            final controller = _viewModel.webViewController;
            final settings = widget.settingsViewModel.settings;
            final gameSurface = _buildGameSurface(controller);
            return LayoutBuilder(
              builder: (context, constraints) {
                final usePortraitLayout =
                    constraints.maxHeight >= constraints.maxWidth;
                final toolbarWidth = widget.game.id == GameId.fmj
                    ? 308.0
                    : 220.0;
                final toolbarLeft = _toolbarOffset.dx
                    .clamp(
                      0.0,
                      math.max(0.0, constraints.maxWidth - toolbarWidth),
                    )
                    .toDouble();
                final toolbarTop = _toolbarOffset.dy
                    .clamp(
                      0.0,
                      math.max(0.0, constraints.maxHeight - _toolbarHeight),
                    )
                    .toDouble();
                return Stack(
                  fit: StackFit.expand,
                  children: [
                    if (usePortraitLayout)
                      _buildPortraitLayout(
                        constraints: constraints,
                        gameSurface: gameSurface,
                        controlsVisible: settings.controlsVisible,
                        darkControls: _darkControls,
                        hapticsEnabled: settings.hapticsEnabled,
                      )
                    else
                      _buildLandscapeLayout(
                        gameSurface: gameSurface,
                        controlsVisible: settings.controlsVisible,
                        hapticsEnabled: settings.hapticsEnabled,
                      ),
                    Positioned(
                      left: toolbarLeft,
                      top: toolbarTop,
                      child: GestureDetector(
                        behavior: HitTestBehavior.translucent,
                        onPanUpdate: (details) {
                          final nextOffset = _toolbarOffset + details.delta;
                          setState(() {
                            _toolbarOffset = Offset(
                              nextOffset.dx.clamp(
                                0.0,
                                math.max(
                                  0.0,
                                  constraints.maxWidth - toolbarWidth,
                                ),
                              ),
                              nextOffset.dy.clamp(
                                0.0,
                                math.max(
                                  0.0,
                                  constraints.maxHeight - _toolbarHeight,
                                ),
                              ),
                            );
                          });
                        },
                        child: _GameToolbar(
                          portraitRequested: _portraitRequested,
                          onBack: () => unawaited(_leaveGame()),
                          onCheat: () => showGameCheatSheet(
                            context,
                            game: widget.game,
                            viewModel: _viewModel,
                          ),
                          onMap: widget.game.id == GameId.fmj
                              ? () => showGameMapSheet(
                                  context,
                                  viewModel: _viewModel,
                                  worldMapRepository:
                                      widget.dependencies.fmjWorldMapRepository,
                                )
                              : null,
                          onOrientationChanged: () =>
                              unawaited(_toggleOrientation()),
                          onThemeChanged: () {
                            setState(() => _darkControls = !_darkControls);
                          },
                          highDefinitionEnabled:
                              settings.fmjHighDefinition,
                          onHighDefinitionChanged:
                              widget.game.id == GameId.fmj
                              ? () => widget.settingsViewModel
                                    .setFmjHighDefinition(
                                      !settings.fmjHighDefinition,
                                    )
                              : null,
                          onSettings: () => showGameSettingsSheet(
                            context,
                            viewModel: widget.settingsViewModel,
                            showEdition: false,
                            showFmjGraphics: widget.game.id == GameId.fmj,
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }

  Widget _buildGameSurface(WebViewController? controller) {
    return ColoredBox(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (controller != null)
            WebViewWidget(
              key: const ValueKey<String>('game-web-view'),
              controller: controller,
            ),
          if (_viewModel.error != null)
            _GameErrorView(
              error: _viewModel.error!,
              onRetry: () => unawaited(_viewModel.reload()),
            )
          else if (!_viewModel.isReady)
            _LoadingView(progress: _viewModel.progress),
        ],
      ),
    );
  }

  Widget _buildPortraitLayout({
    required BoxConstraints constraints,
    required Widget gameSurface,
    required bool controlsVisible,
    required bool darkControls,
    required bool hapticsEnabled,
  }) {
    final gameHeight = math.min(
      constraints.maxWidth * 3 / 5,
      constraints.maxHeight * 0.48,
    );
    final gameWidth = math.min(constraints.maxWidth, gameHeight * 5 / 3);
    return ColoredBox(
      color: darkControls ? const Color(0xFF1B1E22) : const Color(0xFFD8D5CD),
      child: Column(
        children: [
          SizedBox(
            width: constraints.maxWidth,
            height: gameHeight,
            child: Center(
              child: SizedBox(
                width: gameWidth,
                height: gameHeight,
                child: gameSurface,
              ),
            ),
          ),
          Expanded(
            child: controlsVisible
                ? PortraitGameControlsPanel(
                    isDarkTheme: darkControls,
                    hapticsEnabled: hapticsEnabled,
                    onInput: _viewModel.sendInput,
                  )
                : ColoredBox(
                    color: darkControls
                        ? const Color(0xFF1B1E22)
                        : const Color(0xFFD8D5CD),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildLandscapeLayout({
    required Widget gameSurface,
    required bool controlsVisible,
    required bool hapticsEnabled,
  }) {
    return Stack(
      fit: StackFit.expand,
      children: [
        gameSurface,
        if (_viewModel.isReady && controlsVisible)
          GameControlsOverlay(
            hapticsEnabled: hapticsEnabled,
            onInput: _viewModel.sendInput,
          ),
      ],
    );
  }
}

class _GameToolbar extends StatelessWidget {
  const _GameToolbar({
    required this.portraitRequested,
    required this.onBack,
    required this.onCheat,
    required this.onMap,
    required this.onOrientationChanged,
    required this.onThemeChanged,
    required this.highDefinitionEnabled,
    required this.onHighDefinitionChanged,
    required this.onSettings,
  });

  final bool portraitRequested;
  final VoidCallback onBack;
  final VoidCallback onCheat;
  final VoidCallback? onMap;
  final VoidCallback onOrientationChanged;
  final VoidCallback onThemeChanged;
  final bool highDefinitionEnabled;
  final VoidCallback? onHighDefinitionChanged;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    Widget iconButton({
      required String tooltip,
      required VoidCallback onPressed,
      required Widget icon,
    }) {
      return IconButton(
        tooltip: tooltip,
        constraints: const BoxConstraints.tightFor(width: 44, height: 44),
        padding: EdgeInsets.zero,
        onPressed: onPressed,
        icon: icon,
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0x99000000),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          iconButton(
            tooltip: '返回游戏选择',
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back),
          ),
          iconButton(
            tooltip: '控制设置',
            onPressed: onSettings,
            icon: const Icon(Icons.settings),
          ),
          iconButton(
            tooltip: '作弊系统',
            onPressed: onCheat,
            icon: const Icon(Icons.auto_fix_high),
          ),
          if (onMap != null)
            iconButton(
              tooltip: '探索地图',
              onPressed: onMap!,
              icon: const Icon(Icons.map),
            ),
          if (onHighDefinitionChanged != null)
            iconButton(
              tooltip: highDefinitionEnabled ? '切换经典画质' : '切换高清画质',
              onPressed: onHighDefinitionChanged!,
              icon: Icon(
                Icons.hd,
                color: highDefinitionEnabled
                    ? const Color(0xFFFFD166)
                    : null,
              ),
            ),
          iconButton(
            tooltip: '切换控制区明暗主题',
            onPressed: onThemeChanged,
            icon: const Icon(Icons.brightness_6),
          ),
          iconButton(
            tooltip: portraitRequested ? '切换横屏' : '切换竖屏',
            onPressed: onOrientationChanged,
            icon: Icon(
              portraitRequested
                  ? Icons.stay_current_landscape
                  : Icons.stay_current_portrait,
            ),
          ),
        ],
      ),
    );
  }
}

class _LoadingView extends StatelessWidget {
  const _LoadingView({required this.progress});

  final int progress;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: SizedBox(
          width: 220,
          child: LinearProgressIndicator(value: progress / 100),
        ),
      ),
    );
  }
}

class _GameErrorView extends StatelessWidget {
  const _GameErrorView({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 40),
              const SizedBox(height: 12),
              Text(error.toString(), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('重新加载'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
