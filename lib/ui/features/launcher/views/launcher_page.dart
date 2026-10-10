import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app.dart';
import '../../../../domain/models/game_definition.dart';
import '../../game/views/game_page.dart';
import '../../settings/view_models/settings_view_model.dart';
import '../../settings/views/game_settings_sheet.dart';

/// 应用首屏，按游戏定义展示独立入口。
class LauncherPage extends StatefulWidget {
  const LauncherPage({super.key, required this.dependencies});

  final AppDependencies dependencies;

  @override
  State<LauncherPage> createState() => _LauncherPageState();
}

class _LauncherPageState extends State<LauncherPage> {
  late final SettingsViewModel _settingsViewModel;

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

  Future<void> _restoreLauncherChrome() async {
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    await SystemChrome.setPreferredOrientations(const <DeviceOrientation>[
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
  }

  Future<void> _openGame(GameDefinition game) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => GamePage(
          dependencies: widget.dependencies,
          game: game,
          settingsViewModel: _settingsViewModel,
        ),
      ),
    );
    if (mounted) await _restoreLauncherChrome();
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
        child: ListenableBuilder(
          listenable: _settingsViewModel,
          builder: (context, _) {
            if (_settingsViewModel.isLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            return LayoutBuilder(
              builder: (context, constraints) {
                final useGrid = constraints.maxWidth >= 720;
                final cards = GameDefinition.all
                    .map(
                      (game) => _GameTile(
                        game: game,
                        editionLabel: game.id == GameId.sgby
                            ? _settingsViewModel.settings.sgbyEdition.title
                            : null,
                        onPressed: () => _openGame(game),
                      ),
                    )
                    .toList(growable: false);
                return SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  child: useGrid
                      ? GridView.count(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          crossAxisCount: 2,
                          crossAxisSpacing: 16,
                          mainAxisSpacing: 16,
                          childAspectRatio: 1.35,
                          children: cards,
                        )
                      : Column(
                          children: cards
                              .map(
                                (card) => Padding(
                                  padding: const EdgeInsets.only(bottom: 16),
                                  child: card,
                                ),
                              )
                              .toList(growable: false),
                        ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _GameTile extends StatelessWidget {
  const _GameTile({
    required this.game,
    required this.editionLabel,
    required this.onPressed,
  });

  final GameDefinition game;
  final String? editionLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 310,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ColoredBox(
                  color: Colors.black,
                  child: Image.asset(
                    game.coverAsset,
                    fit: game.id.isRpg ? BoxFit.contain : BoxFit.cover,
                    errorBuilder: (_, _, _) => const Center(
                      child: Icon(Icons.videogame_asset, size: 56),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            game.title,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 3),
                          Text(
                            editionLabel ?? game.subtitle,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    IconButton.filled(
                      tooltip: '开始${game.title}',
                      onPressed: onPressed,
                      icon: const Icon(Icons.play_arrow),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
