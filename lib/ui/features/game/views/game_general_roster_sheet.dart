import 'package:flutter/material.dart';

import '../view_models/game_view_model.dart';

/// 展示按城池顺序排列的我方将领列表。
Future<void> showSgbyGeneralRosterSheet(
  BuildContext context, {
  required GameViewModel viewModel,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => FractionallySizedBox(
      heightFactor: 0.88,
      child: _SgbyGeneralRosterSheet(viewModel: viewModel),
    ),
  );
}

/// 我方将领列表状态，支持人物名和城池名实时过滤。
class _SgbyGeneralRosterSheet extends StatefulWidget {
  const _SgbyGeneralRosterSheet({required this.viewModel});

  final GameViewModel viewModel;

  @override
  State<_SgbyGeneralRosterSheet> createState() =>
      _SgbyGeneralRosterSheetState();
}

class _SgbyGeneralRosterSheetState extends State<_SgbyGeneralRosterSheet> {
  static const List<String> _armsTypeNames = <String>[
    '骑兵',
    '步兵',
    '弓兵',
    '水兵',
    '极兵',
    '玄兵',
  ];

  final TextEditingController _searchController = TextEditingController();
  SgbyCheatData? _data;
  bool _loading = false;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() => _loading = true);
    final data = await widget.viewModel.getSgbyCheatData();
    if (!mounted) return;
    setState(() {
      _data = data;
      _loading = false;
    });
  }

  List<SgbyGeneralCheatInfo> get _filteredGenerals {
    final query = _query.trim().toLowerCase();
    final generals = _data?.generals ?? const <SgbyGeneralCheatInfo>[];
    if (query.isEmpty) return generals;
    return generals
        .where(
          (general) =>
              general.name.toLowerCase().contains(query) ||
              general.cityName.toLowerCase().contains(query),
        )
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final generals = _filteredGenerals;
    return SafeArea(
      top: false,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 8, 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '我方将领 · ${generals.length} 人',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  tooltip: '刷新将领列表',
                  onPressed: _loading ? null : _load,
                  icon: _loading
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _searchController,
              onChanged: (value) => setState(() => _query = value),
              decoration: InputDecoration(
                hintText: '搜索武将或城池',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        tooltip: '清空搜索',
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _query = '');
                        },
                        icon: const Icon(Icons.clear),
                      ),
                border: const OutlineInputBorder(),
              ),
            ),
          ),
          const Divider(height: 1),
          Expanded(child: _buildContent(data, generals)),
        ],
      ),
    );
  }

  Widget _buildContent(
    SgbyCheatData? data,
    List<SgbyGeneralCheatInfo> generals,
  ) {
    if (data == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (!data.isSuccess) {
      return Center(
        child: Text(data.message.isEmpty ? '读取将领失败' : data.message),
      );
    }
    if (generals.isEmpty) {
      return Center(child: Text(_query.isEmpty ? '当前没有我方将领' : '没有匹配的武将或城池'));
    }

    final rows = <Object>[];
    String? lastCity;
    for (final general in generals) {
      if (general.cityName != lastCity) {
        lastCity = general.cityName;
        rows.add(lastCity);
      }
      rows.add(general);
    }
    return ListView.separated(
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: rows.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final row = rows[index];
        if (row is String) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text(row, style: Theme.of(context).textTheme.titleMedium),
          );
        }
        final general = row as SgbyGeneralCheatInfo;
        return ListTile(
          leading: CircleAvatar(
            child: Text(
              general.name.isEmpty ? '?' : general.name.characters.first,
            ),
          ),
          title: Text(general.name),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                Text('等级 ${general.level}'),
                Text('武力 ${general.force}'),
                Text('智力 ${general.iq}'),
                Text('忠诚 ${general.devotion}'),
                Text('兵力 ${general.arms}'),
                Text('兵种 ${_armsTypeName(general.effectiveArmsType)}'),
              ],
            ),
          ),
        );
      },
    );
  }

  String _armsTypeName(int index) {
    return index >= 0 && index < _armsTypeNames.length
        ? _armsTypeNames[index]
        : '未知';
  }
}
