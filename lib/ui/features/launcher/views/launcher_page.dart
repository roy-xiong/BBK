import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app.dart';
import '../../../../domain/models/game_definition.dart';
import '../../game/views/game_page.dart';
import '../../settings/view_models/settings_view_model.dart';
import '../../settings/views/game_settings_sheet.dart';

/// 竖屏游戏库；点击封面直接进入对应游戏，焦点与最近打开项使用统一高亮。
class LauncherPage extends StatefulWidget {
  const LauncherPage({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  State<LauncherPage> createState() => _LauncherPageState();
}

class _LauncherPageState extends State<LauncherPage> {
  static const Color _selectionColor = Color(0xFF53E2D1);
  static const double _libraryMaxWidth = 420;

  late final SettingsViewModel _settingsViewModel;
  GameDefinition _selectedGame = GameDefinition.all.first;
  bool _openingGame = false;

  @override
  void initState() {
    super.initState();
    _settingsViewModel = SettingsViewModel(
      repository: widget.dependencies.settingsRepository,
    );
    unawaited(_settingsViewModel.load());
    unawaited(_restoreLauncherChrome());
  }

  @override
  void dispose() {
    _settingsViewModel.dispose();
    super.dispose();
  }

  /// 首页和返回首页时保持竖屏，避免启动区随游戏中的方向选择变成横屏。
  Future<void> _restoreLauncherChrome() async {
    await SystemChrome.setPreferredOrientations(const <DeviceOrientation>[
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    if (!mounted || _openingGame) return;
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  }

  /// 键盘聚焦时更新封面高亮；点击与确认直接进入游戏。
  void _selectGame(GameDefinition game) {
    if (_openingGame || _selectedGame.id == game.id) return;
    setState(() => _selectedGame = game);
  }

  /// 一次仅打开一个游戏页面，防止连续点击建立多个 WebView 和引擎会话。
  ///
  /// 路由退出后恢复首页方向；页面已销毁时不再刷新状态或访问上下文。
  Future<void> _openGame(GameDefinition game) async {
    if (!mounted || _openingGame) return;
    setState(() {
      _selectedGame = game;
      _openingGame = true;
    });
    try {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => GamePage(
            dependencies: widget.dependencies,
            game: game,
            settingsViewModel: _settingsViewModel,
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _openingGame = false);
        await _restoreLauncherChrome();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('步步高经典游戏'),
        actions: [
          IconButton(
            tooltip: '设置',
            onPressed: () => showGameSettingsSheet(
              context,
              viewModel: _settingsViewModel,
              showEdition: true,
              showFmjGraphics: true,
              showSgbyActivity: true,
            ),
            icon: const Icon(Icons.settings),
          ),
        ],
      ),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: _libraryMaxWidth),
            child: ListenableBuilder(
              listenable: _settingsViewModel,
              builder: (context, _) {
                if (_settingsViewModel.isLoading) {
                  return const Center(child: CircularProgressIndicator());
                }
                return SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '选择游戏',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                          Text(
                            '${GameDefinition.all.length} 款',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '点击封面直接进入游戏',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 22),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          // 封面最多两列，不横向滚动；窄窗口回到单列。使用 Wrap
                          // 让标题随系统字号自然增高，避免固定网格高度截断文字。
                          const spacing = 16.0;
                          final columns = constraints.maxWidth >= 260 ? 2 : 1;
                          final tileWidth =
                              (constraints.maxWidth - spacing * (columns - 1)) /
                              columns;
                          return FocusTraversalGroup(
                            child: Wrap(
                              spacing: spacing,
                              runSpacing: 18,
                              children: [
                                for (final game in GameDefinition.all)
                                  SizedBox(
                                    width: tileWidth,
                                    child: _GameTile(
                                      game: game,
                                      isSelected: _selectedGame.id == game.id,
                                      selectionColor: _selectionColor,
                                      onSelected: _openingGame
                                          ? null
                                          : () => _selectGame(game),
                                      onStart: _openingGame
                                          ? null
                                          : () => _openGame(game),
                                    ),
                                  ),
                              ],
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// 方形封面与独立标题，选中边框保留固定宽度，切换时不改变相邻封面位置。
class _GameTile extends StatelessWidget {
  const _GameTile({
    required this.game,
    required this.isSelected,
    required this.selectionColor,
    required this.onSelected,
    required this.onStart,
  });

  final GameDefinition game;
  final bool isSelected;
  final Color selectionColor;
  final VoidCallback? onSelected;
  final VoidCallback? onStart;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: isSelected,
      button: true,
      child: Tooltip(
        message: '进入${game.title}',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isSelected
                        ? selectionColor
                        : const Color(0xFF303438),
                    width: 3,
                  ),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: selectionColor.withValues(alpha: 0.16),
                            blurRadius: 14,
                          ),
                        ]
                      : const [],
                ),
                child: Material(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(6),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: onStart,
                    onFocusChange: (focused) {
                      if (focused) onSelected?.call();
                    },
                    child: Image.asset(
                      game.coverAsset,
                      // 原图为横幅，在方形封面内完整显示，保留游戏标题和两侧内容。
                      fit: BoxFit.contain,
                      excludeFromSemantics: true,
                      errorBuilder: (_, _, _) => const Center(
                        child: Icon(Icons.videogame_asset, size: 44),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 9),
            Text(
              game.title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: isSelected
                    ? selectionColor
                    : Theme.of(context).colorScheme.onSurface,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
