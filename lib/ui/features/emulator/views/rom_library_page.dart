import 'dart:async';
import 'package:flutter/material.dart';
import '../../../../app.dart';
import '../../../../data/repositories/rom_catalog_repository.dart';
import '../../../../domain/models/emulator_rom.dart';
import 'emulator_page.dart';

/// 外置 ROM 游戏库。列表来自应用启动的单次扫描，刷新按钮显式重新扫描。
class RomLibraryPage extends StatefulWidget {
  const RomLibraryPage({super.key, required this.dependencies});
  final AppDependencies dependencies;
  @override
  State<RomLibraryPage> createState() => _RomLibraryPageState();
}

class _RomLibraryPageState extends State<RomLibraryPage> {
  bool _opening = false;
  bool _authorizing = false;
  RomCatalogRepository get _catalog => widget.dependencies.romCatalogRepository;

  Future<void> _authorize() async {
    if (_authorizing) return;
    setState(() => _authorizing = true);
    try {
      await _catalog.requestPermission();
    } finally {
      if (mounted) setState(() => _authorizing = false);
    }
  }

  Future<void> _open(EmulatorRom rom) async {
    final root = _catalog.rootPath;
    if (_opening || root == null) return;
    setState(() => _opening = true);
    try {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => EmulatorPage(
            rom: rom,
            rootPath: root,
            localGameServer: widget.dependencies.localGameServer,
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('模拟器游戏库'),
      actions: [
        ListenableBuilder(
          listenable: _catalog,
          builder: (_, _) => IconButton(
            tooltip: '重新扫描',
            onPressed: _catalog.isLoading || _opening
                ? null
                : () => unawaited(_catalog.refresh()),
            icon: const Icon(Icons.refresh),
          ),
        ),
      ],
    ),
    body: ListenableBuilder(
      listenable: _catalog,
      builder: (context, _) {
        if (_catalog.isLoading) {
          return const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('正在扫描 BBK 文件夹…'),
              ],
            ),
          );
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              _catalog.rootPath ?? '主共享存储 / BBK',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            const Text(
              'NES/FC 放入 NES，街机放入 ARCADE，BIOS 放入 BIOS。\n复制文件后点击右上角重新扫描。',
            ),
            const SizedBox(height: 16),
            if (_catalog.error != null) ...[
              Text(
                _catalog.error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              const SizedBox(height: 12),
            ],
            if (!_catalog.authorized)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('允许访问 BBK 文件夹'),
                      const SizedBox(height: 8),
                      const Text(
                        '首次使用请允许文件访问。Android 11 及以上需在系统设置中开启“所有文件访问权限”，返回后会创建 BBK 文件夹并扫描。',
                      ),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _authorizing ? null : _authorize,
                        icon: const Icon(Icons.folder_open),
                        label: Text(_authorizing ? '等待系统授权…' : '去授权'),
                      ),
                    ],
                  ),
                ),
              ),
            if (_catalog.authorized && _catalog.games.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text('还没有 ROM。将游戏文件复制到 BBK 后重新扫描。'),
              ),
            for (final rom in _catalog.games)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Card(
                  child: ListTile(
                    leading: Icon(
                      rom.family == 'nes'
                          ? Icons.videogame_asset
                          : Icons.sports_esports,
                    ),
                    title: Text(rom.title),
                    subtitle: Text(
                      '${rom.systemLabel} · ${(rom.size / 1024 / 1024).toStringAsFixed(1)} MB',
                    ),
                    trailing: const Icon(Icons.play_arrow),
                    onTap: _opening ? null : () => _open(rom),
                  ),
                ),
              ),
            if (_catalog.issues.isNotEmpty)
              ExpansionTile(
                title: Text('未能扫描的文件（${_catalog.issues.length}）'),
                children: [
                  for (final issue in _catalog.issues)
                    ListTile(title: Text(issue)),
                ],
              ),
            const SizedBox(height: 16),
            const Text(
              '合金弹头原版使用 Neo Geo 街机 ROM，例如 mslug.zip，并需匹配的 neogeo.zip 放入 BIOS。街机压缩包保持原名；目录扫描通过不代表 ROM set 已与内核匹配。',
            ),
          ],
        );
      },
    ),
  );
}
