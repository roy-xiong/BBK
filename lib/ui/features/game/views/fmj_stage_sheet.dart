import 'package:flutter/material.dart';
import '../view_models/game_view_model.dart';

/// 详细故事节点选择器；关闭、取消与选择完成均恢复网页游戏循环。
Future<CheatResult?> showFmjStageSheet(
  BuildContext context,
  GameViewModel viewModel,
) async {
  final stages = await viewModel.openFmjStages();
  if (!context.mounted) {
    await viewModel.closeFmjStages();
    return null;
  }
  try {
    return await showModalBottomSheet<CheatResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF141E29),
      builder: (_) => _StageList(stages: stages, viewModel: viewModel),
    );
  } finally {
    await viewModel.closeFmjStages();
  }
}

class _StageList extends StatefulWidget {
  const _StageList({required this.stages, required this.viewModel});
  final List<Map<String, dynamic>> stages;
  final GameViewModel viewModel;
  @override
  State<_StageList> createState() => _StageListState();
}

class _StageListState extends State<_StageList> {
  String _query = '';
  bool _selecting = false;
  String _text(Map<String, dynamic> s, String key) =>
      s[key] is String ? s[key] as String : '';

  Future<void> _select(Map<String, dynamic> stage) async {
    if (_selecting) return;
    final id = _text(stage, 'id');
    if (id.isEmpty) return;
    setState(() => _selecting = true);
    final result = await widget.viewModel.selectFmjStage(id);
    if (!mounted) return;
    if (result.isSuccess) {
      Navigator.of(context).pop(result);
    } else {
      setState(() => _selecting = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = widget.stages
        .where(
          (s) => [
            'title',
            'scene',
            'chapter',
            'kind',
          ].any((k) => _text(s, k).contains(_query)),
        )
        .toList(growable: false);
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * .82,
        child: Column(
          children: [
            const SizedBox(height: 12),
            Text(
              '选择关卡 · ${widget.stages.length} 个故事节点',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                '选择后切换当前进度，自动准备物品、队伍和装备；不覆盖已有存档。',
                style: TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  hintText: '搜索人物、地点或故事',
                  hintStyle: TextStyle(color: Colors.white54),
                  prefixIcon: Icon(Icons.search, color: Colors.white70),
                ),
                onChanged: (text) => setState(() => _query = text.trim()),
              ),
            ),
            if (_selecting) const LinearProgressIndicator(),
            Expanded(
              child: filtered.isEmpty
                  ? const Center(
                      child: Text(
                        '没有匹配的关卡',
                        style: TextStyle(color: Colors.white70),
                      ),
                    )
                  : ListView.builder(
                      itemCount: filtered.length,
                      itemBuilder: (_, index) {
                        final s = filtered[index],
                            chapter = _text(s, 'chapter');
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (index == 0 ||
                                _text(filtered[index - 1], 'chapter') !=
                                    chapter)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  16,
                                  16,
                                  16,
                                  4,
                                ),
                                child: Text(
                                  chapter,
                                  style: const TextStyle(
                                    color: Color(0xFF82DCC3),
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ListTile(
                              enabled: !_selecting,
                              title: Text(
                                _text(s, 'title'),
                                style: const TextStyle(color: Colors.white),
                              ),
                              subtitle: Text(
                                '${_text(s, 'kind')} · ${_text(s, 'scene')}\n${_text(s, 'preparation')}',
                                style: const TextStyle(
                                  color: Colors.white60,
                                  fontSize: 12,
                                ),
                              ),
                              trailing: const Icon(
                                Icons.play_circle_outline,
                                color: Color(0xFF82DCC3),
                              ),
                              onTap: () => _select(s),
                            ),
                          ],
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
