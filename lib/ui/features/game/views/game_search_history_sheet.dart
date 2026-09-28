import 'package:flutter/material.dart';

import '../view_models/game_view_model.dart';

/// 展示三国霸业最近 50 次手动或战后自动搜索记录。
Future<void> showSgbySearchHistorySheet(
  BuildContext context, {
  required GameViewModel viewModel,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => FractionallySizedBox(
      heightFactor: 0.8,
      child: _SgbySearchHistorySheet(viewModel: viewModel),
    ),
  );
}

/// 搜索历史面板状态，支持用户在面板内主动刷新最新记录。
class _SgbySearchHistorySheet extends StatefulWidget {
  const _SgbySearchHistorySheet({required this.viewModel});

  final GameViewModel viewModel;

  @override
  State<_SgbySearchHistorySheet> createState() =>
      _SgbySearchHistorySheetState();
}

class _SgbySearchHistorySheetState extends State<_SgbySearchHistorySheet> {
  SgbySearchHistoryData? _data;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() => _loading = true);
    final data = await widget.viewModel.getSgbySearchHistory();
    if (!mounted) return;
    setState(() {
      _data = data;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return SafeArea(
      top: false,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 12, 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '搜索记录',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  tooltip: '刷新搜索记录',
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
          const Divider(height: 1),
          Expanded(child: _buildContent(data)),
        ],
      ),
    );
  }

  Widget _buildContent(SgbySearchHistoryData? data) {
    if (data == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (!data.isSuccess) {
      return const Center(child: Text('读取搜索记录失败，请稍后刷新'));
    }
    if (data.records.isEmpty) {
      return const Center(child: Text('暂无搜索记录'));
    }
    return ListView.separated(
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: data.records.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final record = data.records[index];
        return ExpansionTile(
          leading: const Icon(Icons.manage_search),
          title: Text('${record.source} · ${record.gameTime}'),
          subtitle: Text(
            '${record.realTime} · 人物 ${record.peopleCount} · 物品 ${record.toolCount}',
          ),
          children: record.cities.isEmpty
              ? const <Widget>[
                  ListTile(
                    dense: true,
                    leading: Icon(Icons.info_outline),
                    title: Text('本次未发现新的隐藏人物或物品'),
                  ),
                ]
              : record.cities
                    .map(
                      (city) => ListTile(
                        dense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 4,
                        ),
                        title: Text(city.cityName),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 4),
                            Text(
                              city.people.isEmpty
                                  ? '人物：无'
                                  : '人物：${city.people.join('、')}',
                            ),
                            Text(
                              city.tools.isEmpty
                                  ? '物品：无'
                                  : '物品：${city.tools.join('、')}',
                            ),
                          ],
                        ),
                      ),
                    )
                    .toList(growable: false),
        );
      },
    );
  }
}
