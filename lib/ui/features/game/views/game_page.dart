import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart';
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
import 'game_enemy_city_sheet.dart';
import 'game_general_roster_sheet.dart';
import 'game_map_sheet.dart';
import 'game_search_history_sheet.dart';

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
  bool _leaveConfirmationVisible = false;
  bool _portraitRequested = true;
  bool _orientationChanging = false;
  bool _enemyCitySheetVisible = false;
  bool _searchHistorySheetVisible = false;
  bool _generalRosterSheetVisible = false;
  bool _darkControls = true;
  late bool _lastFmjHighDefinition;
  late int _lastSgbyWorldActivity;

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
      onExitRequested: () => unawaited(_requestLeaveGame()),
      onEnemyCityRequested: (city) => unawaited(_showEnemyCity(city)),
      onNoticeRequested: _showGameNotice,
    );
    _lastFmjHighDefinition =
        widget.settingsViewModel.settings.fmjHighDefinition;
    _lastSgbyWorldActivity =
        widget.settingsViewModel.settings.sgbyWorldActivity;
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

  /// 将设置变化同步给正在运行的游戏页面。
  ///
  /// 使用各自的上次值去重，避免无关设置变化时重复跨平台调用 WebView。两个同步任务
  /// 相互独立，单项桥接失败不会阻断另一款游戏的设置更新。
  void _onSettingsChanged() {
    final settings = widget.settingsViewModel.settings;
    final highDefinitionEnabled = settings.fmjHighDefinition;
    if (highDefinitionEnabled != _lastFmjHighDefinition) {
      _lastFmjHighDefinition = highDefinitionEnabled;
      unawaited(_viewModel.setFmjHighDefinition(highDefinitionEnabled));
    }
    final worldActivity = settings.sgbyWorldActivity;
    if (worldActivity != _lastSgbyWorldActivity) {
      _lastSgbyWorldActivity = worldActivity;
      unawaited(_viewModel.setSgbyWorldActivity(worldActivity));
    }
  }

  Future<void> _enterGameMode() async {
    await SystemChrome.setPreferredOrientations(const <DeviceOrientation>[
      DeviceOrientation.portraitUp,
    ]);
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.black,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: Colors.black,
        systemNavigationBarIconBrightness: Brightness.light,
        systemNavigationBarDividerColor: Colors.black,
      ),
    );
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
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

  /// 请求退出当前游戏，并统一展示二次确认。
  ///
  /// Android 系统返回键、工具栏返回按钮和游戏引擎主动退出都会进入这里。状态位防止
  /// 快速重复点击叠加多个 Dialog；取消或系统返回关闭 Dialog 后继续保留游戏现场。
  Future<void> _requestLeaveGame() async {
    if (_leaving || _leaveConfirmationVisible || !mounted) return;
    _leaveConfirmationVisible = true;
    bool confirmed = false;
    try {
      confirmed =
          await showDialog<bool>(
            context: context,
            builder: (dialogContext) {
              return AlertDialog(
                title: Text('退出${widget.game.title}？'),
                content: const Text('请确认当前进度已经存档。'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(false),
                    child: const Text('继续游戏'),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.of(dialogContext).pop(true),
                    child: const Text('退出'),
                  ),
                ],
              );
            },
          ) ??
          false;
    } finally {
      _leaveConfirmationVisible = false;
    }
    if (confirmed && mounted) await _leaveGame();
  }

  /// 打开游戏原生存档界面，并反馈无法存档的具体原因。
  Future<void> _openSaveMenu() async {
    final result = await _viewModel.openSaveMenu();
    if (!mounted) return;
    if (!result.isSuccess || widget.game.id == GameId.sgby) {
      final messenger = ScaffoldMessenger.of(context);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(SnackBar(content: Text(result.message)));
    }
  }

  /// 展示长按敌方城池得到的武将信息，并防止连续长按叠加多个面板。
  Future<void> _showEnemyCity(SgbyEnemyCityInfo city) async {
    if (!mounted || _enemyCitySheetVisible || widget.game.id != GameId.sgby) {
      return;
    }
    _enemyCitySheetVisible = true;
    try {
      await showSgbyEnemyCitySheet(context, city: city);
    } finally {
      _enemyCitySheetVisible = false;
    }
  }

  /// 展示游戏脚本后台自动处理产生的底部提示，并延长阅读时间。
  void _showGameNotice(CheatResult result) {
    if (!mounted) return;
    showCheatToast(
      context,
      result,
      atBottom: true,
      duration: const Duration(seconds: 8),
    );
  }

  /// 打开本地搜索历史，并防止快速重复点击叠加多个面板。
  Future<void> _showSearchHistory() async {
    if (!mounted || _searchHistorySheetVisible) return;
    _searchHistorySheetVisible = true;
    try {
      await showSgbySearchHistorySheet(context, viewModel: _viewModel);
    } finally {
      _searchHistorySheetVisible = false;
    }
  }

  /// 打开按阵营和登场状态分类的将领列表，并防止重复叠加面板。
  Future<void> _showGeneralRoster() async {
    if (!mounted || _generalRosterSheetVisible) return;
    _generalRosterSheetVisible = true;
    try {
      await showSgbyGeneralRosterSheet(context, viewModel: _viewModel);
    } finally {
      _generalRosterSheetVisible = false;
    }
  }

  /// 分发屏幕按钮输入。
  void _sendGameInput(GameInput input) {
    if (!_viewModel.isReady) return;
    if (input == GameInput.searchHistory) {
      unawaited(_showSearchHistory());
      return;
    }
    if (input == GameInput.generalRoster) {
      unawaited(_showGeneralRoster());
      return;
    }
    _viewModel.sendInput(input);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<void>(
      canPop: _allowPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_requestLeaveGame());
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: ListenableBuilder(
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
                      ? 352.0
                      : 264.0;
                  final savedToolbarPosition =
                      settings.toolbarPositions[widget.game.id];
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
                      Positioned.fill(
                        child: _DraggableToolbar(
                          toolbarSize: Size(toolbarWidth, _toolbarHeight),
                          initialRelativeOffset: savedToolbarPosition == null
                              ? null
                              : Offset(
                                  savedToolbarPosition.xRatio,
                                  savedToolbarPosition.yRatio,
                                ),
                          onDragFinished: (relativeOffset) {
                            widget.settingsViewModel.setGameToolbarPosition(
                              widget.game.id,
                              relativeOffset,
                            );
                          },
                          child: _GameToolbar(
                            portraitRequested: _portraitRequested,
                            onBack: () => unawaited(_requestLeaveGame()),
                            onSave: () => unawaited(_openSaveMenu()),
                            onCheat: () => showGameCheatSheet(
                              context,
                              game: widget.game,
                              viewModel: _viewModel,
                            ),
                            onMap: widget.game.id == GameId.fmj
                                ? () => showGameMapSheet(
                                    context,
                                    viewModel: _viewModel,
                                    worldMapRepository: widget
                                        .dependencies
                                        .fmjWorldMapRepository,
                                  )
                                : null,
                            onOrientationChanged: () =>
                                unawaited(_toggleOrientation()),
                            onThemeChanged: () {
                              setState(() => _darkControls = !_darkControls);
                            },
                            highDefinitionEnabled: settings.fmjHighDefinition,
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
                              showSgbyActivity: widget.game.id == GameId.sgby,
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
                    showSgbyUtilityButtons: widget.game.id == GameId.sgby,
                    battleSpeedMultiplier: _viewModel.sgbyBattleSpeedMultiplier,
                    sgbyAutoBattleEnabled: _viewModel.sgbyAutoBattleEnabled,
                    sgbyAutoEndTurnEnabled: _viewModel.sgbyAutoEndTurnEnabled,
                    onInput: _sendGameInput,
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
            showSgbyUtilityButtons: widget.game.id == GameId.sgby,
            battleSpeedMultiplier: _viewModel.sgbyBattleSpeedMultiplier,
            sgbyAutoBattleEnabled: _viewModel.sgbyAutoBattleEnabled,
            sgbyAutoEndTurnEnabled: _viewModel.sgbyAutoEndTurnEnabled,
            onInput: _sendGameInput,
          ),
      ],
    );
  }
}

/// 只重绘自身合成层的可拖动悬浮工具栏。
///
/// 拖动过程中通过 [ValueNotifier] 更新一个 [Transform]，不会调用游戏页面的
/// `setState`，因此 WebView、游戏画面和下方控制区都不会随每个指针事件重建。
/// [onDragFinished] 仅在抬手或手势取消时调用，用于低频持久化最终位置。
class _DraggableToolbar extends StatefulWidget {
  const _DraggableToolbar({
    required this.toolbarSize,
    required this.initialRelativeOffset,
    required this.onDragFinished,
    required this.child,
  });

  final Size toolbarSize;
  final Offset? initialRelativeOffset;
  final ValueChanged<Offset> onDragFinished;
  final Widget child;

  @override
  State<_DraggableToolbar> createState() => _DraggableToolbarState();
}

class _DraggableToolbarState extends State<_DraggableToolbar> {
  late final ValueNotifier<Offset?> _relativeOffset;
  Offset _maxPixelOffset = Offset.zero;
  bool _dragging = false;

  @override
  void initState() {
    super.initState();
    _relativeOffset = ValueNotifier<Offset?>(widget.initialRelativeOffset);
  }

  @override
  void didUpdateWidget(covariant _DraggableToolbar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_dragging &&
        oldWidget.initialRelativeOffset != widget.initialRelativeOffset) {
      _relativeOffset.value = widget.initialRelativeOffset;
    }
  }

  @override
  void dispose() {
    _relativeOffset.dispose();
    super.dispose();
  }

  /// 将持久化比例换算为当前屏幕内的物理位置。
  Offset _resolvePixelOffset(Offset? relativeOffset) {
    if (relativeOffset == null) {
      return Offset(
        math.min(8.0, _maxPixelOffset.dx),
        math.min(8.0, _maxPixelOffset.dy),
      );
    }
    return Offset(
      relativeOffset.dx.clamp(0.0, 1.0) * _maxPixelOffset.dx,
      relativeOffset.dy.clamp(0.0, 1.0) * _maxPixelOffset.dy,
    );
  }

  /// 只更新工具栏自身的归一化坐标，不触发父页面重建或磁盘写入。
  void _handlePanUpdate(DragUpdateDetails details) {
    final current = _resolvePixelOffset(_relativeOffset.value);
    final next = Offset(
      (current.dx + details.delta.dx).clamp(0.0, _maxPixelOffset.dx),
      (current.dy + details.delta.dy).clamp(0.0, _maxPixelOffset.dy),
    );
    _relativeOffset.value = Offset(
      _maxPixelOffset.dx > 0 ? next.dx / _maxPixelOffset.dx : 0.0,
      _maxPixelOffset.dy > 0 ? next.dy / _maxPixelOffset.dy : 0.0,
    );
  }

  /// 结束拖动并持久化唯一一次最终位置。
  void _finishDrag() {
    _dragging = false;
    final relativeOffset = _relativeOffset.value;
    if (relativeOffset != null) widget.onDragFinished(relativeOffset);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        _maxPixelOffset = Offset(
          math.max(0.0, constraints.maxWidth - widget.toolbarSize.width),
          math.max(0.0, constraints.maxHeight - widget.toolbarSize.height),
        );
        return ValueListenableBuilder<Offset?>(
          valueListenable: _relativeOffset,
          child: RepaintBoundary(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              dragStartBehavior: DragStartBehavior.down,
              onPanStart: (_) => _dragging = true,
              onPanUpdate: _handlePanUpdate,
              onPanEnd: (_) => _finishDrag(),
              onPanCancel: _finishDrag,
              child: widget.child,
            ),
          ),
          builder: (context, relativeOffset, child) {
            return Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  left: 0,
                  top: 0,
                  child: Transform.translate(
                    offset: _resolvePixelOffset(relativeOffset),
                    child: child,
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _GameToolbar extends StatelessWidget {
  const _GameToolbar({
    required this.portraitRequested,
    required this.onBack,
    required this.onSave,
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
  final VoidCallback onSave;
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
            tooltip: '打开存档界面',
            onPressed: onSave,
            icon: const Icon(Icons.save),
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
                color: highDefinitionEnabled ? const Color(0xFFFFD166) : null,
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
