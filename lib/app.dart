import 'dart:async';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'data/repositories/game_save_repository.dart';
import 'data/repositories/fmj_world_map_repository.dart';
import 'data/repositories/settings_repository.dart';
import 'data/services/app_file_store.dart';
import 'data/services/local_game_server.dart';
import 'ui/core/app_theme.dart';
import 'ui/features/launcher/views/launcher_page.dart';

/// 应用根组件。
///
/// 启动阶段先准备应用目录并启动只监听回环地址的本地资源服务，避免游戏页面拿到尚未
/// 就绪的依赖。初始化失败时保留明确错误界面，不让异步异常直接终止应用。
class BbkClassicsApp extends StatefulWidget {
  const BbkClassicsApp({super.key});

  @override
  State<BbkClassicsApp> createState() => _BbkClassicsAppState();
}

class _BbkClassicsAppState extends State<BbkClassicsApp> {
  late final Future<AppDependencies> _dependenciesFuture;
  AppDependencies? _dependencies;

  @override
  void initState() {
    super.initState();
    _dependenciesFuture = AppDependencies.create().then((dependencies) {
      _dependencies = dependencies;
      return dependencies;
    });
  }

  @override
  void dispose() {
    unawaited(_dependencies?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: '步步高经典游戏',
      theme: AppTheme.dark(),
      home: FutureBuilder<AppDependencies>(
        future: _dependenciesFuture,
        builder: (context, snapshot) {
          final dependencies = snapshot.data;
          if (dependencies != null) {
            return LauncherPage(dependencies: dependencies);
          }
          final error = snapshot.error;
          if (error != null) return _BootstrapErrorView(error: error);
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        },
      ),
    );
  }
}

/// 集中管理应用级依赖，保证 UI、存档和本地资源服务之间通过构造函数连接。
class AppDependencies {
  AppDependencies._({
    required this.settingsRepository,
    required this.gameSaveRepository,
    required this.fmjWorldMapRepository,
    required this.localGameServer,
  });

  final SettingsRepository settingsRepository;
  final GameSaveRepository gameSaveRepository;
  final FmjWorldMapRepository fmjWorldMapRepository;
  final LocalGameServer localGameServer;

  static Future<AppDependencies> create() async {
    final supportDirectory = await getApplicationSupportDirectory();
    final fileStore = AppFileStore(rootDirectory: supportDirectory);
    final settingsRepository = SettingsRepository(fileStore: fileStore);
    final gameSaveRepository = GameSaveRepository(fileStore: fileStore);
    final fmjWorldMapRepository = FmjWorldMapRepository();
    final localGameServer = LocalGameServer(
      gameSaveRepository: gameSaveRepository,
    );
    await localGameServer.start();
    return AppDependencies._(
      settingsRepository: settingsRepository,
      gameSaveRepository: gameSaveRepository,
      fmjWorldMapRepository: fmjWorldMapRepository,
      localGameServer: localGameServer,
    );
  }

  Future<void> dispose() => localGameServer.stop();
}

class _BootstrapErrorView extends StatelessWidget {
  const _BootstrapErrorView({required this.error});

  final Object error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 44),
                const SizedBox(height: 16),
                Text(
                  '游戏资源初始化失败',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  error.toString(),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
