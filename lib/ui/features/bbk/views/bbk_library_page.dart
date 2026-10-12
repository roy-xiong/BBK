import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app.dart';
import '../../../../data/services/bbk_runtime_service.dart';
import '../../../../domain/models/bbk_game.dart';
import '../../launcher/views/launcher_page.dart';
import 'bbk_player_page.dart';

/// 原机 RPG 游戏库：固定 84 条目录，安装状态与菜单封面独立，不能把封面当成可玩证据。
class BbkLibraryPage extends StatefulWidget {
  const BbkLibraryPage({super.key, required this.dependencies});
  final AppDependencies dependencies;
  @override
  State<BbkLibraryPage> createState() => _BbkLibraryPageState();
}

class _BbkLibraryPageState extends State<BbkLibraryPage> {
  final TextEditingController _search = TextEditingController();
  List<BbkGame> _games = const [];
  Set<String> _installed = const {};
  Set<String> _roms = const {};
  Map<String, dynamic> _preferences = const {};
  String _filter = 'all';
  String? _error;
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    _search.addListener(_searchChanged);
  }

  void _searchChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final source = await rootBundle.loadString('assets/bbk/catalog.json');
      final decoded = jsonDecode(source);
      if (decoded is! Map<String, dynamic> ||
          decoded['version'] != 1 ||
          decoded['games'] is! List) {
        throw const FormatException('原机游戏目录损坏');
      }
      final games = (decoded['games'] as List)
          .map((item) {
            if (item is! Map<String, dynamic>) {
              throw const FormatException('游戏目录项无效');
            }
            return BbkGame.fromJson(item);
          })
          .toList(growable: false);
      if (games.length != 84 ||
          games.map((game) => game.id).toSet().length != 84) {
        throw const FormatException('原机目录必须包含 84 个唯一条目');
      }
      if (mounted) {
        setState(() {
          _games = games;
        });
      }
      await _reloadStatus();
      if (mounted) {
        setState(() {
          _loading = false;
          _error = null;
        });
      }
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = _message(error);
        });
      }
    }
  }

  Future<void> _reloadStatus() async {
    final status = await BbkRuntimeService.channel
        .invokeMapMethod<String, dynamic>('status');
    final installed = status?['installed'];
    final roms = status?['roms'];
    final raw = status?['preferences'];
    final preferences = raw is String ? jsonDecode(raw) : null;
    if (!mounted) return;
    setState(() {
      _installed = installed is List
          ? installed.whereType<String>().toSet()
          : const {};
      _roms = roms is List ? roms.whereType<String>().toSet() : const {};
      _preferences = preferences is Map<String, dynamic>
          ? preferences
          : const {};
    });
  }

  Map<String, dynamic> _preference(BbkGame game) {
    final value = _preferences[game.id];
    return value is Map<String, dynamic> ? value : <String, dynamic>{};
  }

  String _model(BbkGame game) {
    final value = _preference(game)['model'];
    return value == 'a4980' || value == 'a4988' ? value as String : game.model;
  }

  bool _ready(BbkGame game) =>
      _installed.contains(game.id) &&
      _roms.contains('${_model(game)}/8.BIN') &&
      _roms.contains('${_model(game)}/E.BIN');

  Future<void> _import() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final result = await BbkRuntimeService.channel
          .invokeMapMethod<String, dynamic>('importAssets');
      await _reloadStatus();
      if (mounted && result != null) {
        _notice('已导入 ${result['imported'] ?? 0} 个文件');
      }
    } on Object catch (error) {
      if (mounted) _notice(_message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setPreference(BbkGame game, String key, Object value) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await BbkRuntimeService.channel.invokeMethod<void>(
        'preference',
        <String, Object>{'id': game.id, 'key': key, 'value': value},
      );
      await _reloadStatus();
    } on Object catch (error) {
      if (mounted) _notice(_message(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(BbkGame game) async {
    if (_busy) return;
    if (!_ready(game)) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(game.title),
          content: Text(
            _installed.contains(game.id)
                ? '缺少 ${_model(game).toUpperCase()} 的系统 ROM。资源 ZIP 内请保留 a4980 或 a4988 文件夹，其中包含 8.BIN 和 E.BIN。'
                : '请先导入包含“${game.title}.gam”和对应机型 ROM 的 ZIP 资源包。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('知道了'),
            ),
          ],
        ),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (_) => BbkPlayerPage(game: game, model: _model(game)),
        ),
      );
      await _reloadStatus();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _notice(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String _message(Object error) => error is PlatformException
      ? error.message ?? error.code
      : error.toString();

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final visible = _games
        .where(
          (game) =>
              game.title.toLowerCase().contains(query) &&
              switch (_filter) {
                'installed' => _ready(game),
                'favorites' => _preference(game)['favorite'] == true,
                'recent' => _preference(game)['lastPlayed'] is num,
                _ => true,
              },
        )
        .toList();
    if (_filter == 'recent') {
      visible.sort(
        (a, b) => (_preference(b)['lastPlayed'] as num).compareTo(
          _preference(a)['lastPlayed'] as num,
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('步步高 RPG 游戏库'),
        actions: [
          IconButton(
            tooltip: '现有增强版 3 款',
            icon: const Icon(Icons.auto_awesome_outlined),
            onPressed: _busy
                ? null
                : () async {
                    await Navigator.of(context).push<void>(
                      MaterialPageRoute<void>(
                        builder: (_) =>
                            LauncherPage(dependencies: widget.dependencies),
                      ),
                    );
                  },
          ),
          IconButton(
            tooltip: '导入 ZIP 资源包',
            icon: const Icon(Icons.file_download_outlined),
            onPressed: _busy ? null : _import,
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: TextField(
                controller: _search,
                decoration: InputDecoration(
                  hintText: '搜索 84 款 RPG / Adventure 游戏',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          onPressed: _search.clear,
                          icon: const Icon(Icons.clear),
                        ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '共 84 款 · 已就绪 ${_games.where(_ready).length} 款',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  TextButton(
                    onPressed: _busy ? null : _import,
                    child: const Text('导入资源'),
                  ),
                ],
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  for (final filter in const {
                    'all': '全部',
                    'installed': '可启动',
                    'favorites': '收藏',
                    'recent': '最近玩过',
                  }.entries)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(filter.value),
                        selected: _filter == filter.key,
                        onSelected: (_) => setState(() => _filter = filter.key),
                      ),
                    ),
                ],
              ),
            ),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Colors.orange),
                ),
              ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : visible.isEmpty
                  ? const Center(child: Text('没有符合条件的游戏'))
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(8, 10, 8, 24),
                      itemCount: visible.length,
                      itemBuilder: (context, index) {
                        final game = visible[index];
                        final favorite = _preference(game)['favorite'] == true;
                        final ready = _ready(game);
                        return ListTile(
                          key: ValueKey(game.id),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 6,
                          ),
                          leading: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: SizedBox(
                              width: 92,
                              height: 56,
                              child: Image.asset(
                                game.coverAsset,
                                fit: BoxFit.contain,
                                filterQuality: FilterQuality.none,
                                errorBuilder: (_, _, _) =>
                                    const Icon(Icons.videogame_asset_outlined),
                              ),
                            ),
                          ),
                          title: Text(game.title),
                          subtitle: Text(
                            '${_model(game).toUpperCase()} · ${ready
                                ? '原机版'
                                : _installed.contains(game.id)
                                ? '缺少系统 ROM'
                                : '资源待导入'}',
                          ),
                          trailing: PopupMenuButton<String>(
                            enabled: !_busy,
                            icon: Icon(favorite ? Icons.star : Icons.more_vert),
                            onSelected: (value) => unawaited(
                              _setPreference(
                                game,
                                value == 'favorite' ? 'favorite' : 'model',
                                value == 'favorite' ? !favorite : value,
                              ),
                            ),
                            itemBuilder: (_) => [
                              PopupMenuItem(
                                value: 'favorite',
                                child: Text(favorite ? '取消收藏' : '收藏'),
                              ),
                              const PopupMenuItem(
                                value: 'a4980',
                                child: Text('使用 A4980'),
                              ),
                              const PopupMenuItem(
                                value: 'a4988',
                                child: Text('使用 A4988'),
                              ),
                            ],
                          ),
                          onTap: _busy ? null : () => unawaited(_open(game)),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
