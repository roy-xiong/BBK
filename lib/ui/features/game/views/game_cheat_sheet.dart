import 'package:flutter/material.dart';

import '../../../../domain/models/game_definition.dart';
import '../view_models/game_view_model.dart';

/// 单个作弊选项的 UI 定义。
class _CheatOption {
  const _CheatOption({
    required this.action,
    required this.title,
    required this.description,
    required this.icon,
  });

  final String action;
  final String title;
  final String description;
  final IconData icon;
}

/// 展示当前游戏专属的作弊选项。
Future<void> showGameCheatSheet(
  BuildContext context, {
  required GameDefinition game,
  required GameViewModel viewModel,
}) async {
  final options = switch (game.id) {
    GameId.sgby => const <_CheatOption>[
      _CheatOption(
        action: 'sgby_resources',
        title: '城池资源拉满',
        description: '我方全部城池金钱、粮草、后备兵力提升至上限',
        icon: Icons.savings,
      ),
      _CheatOption(
        action: 'sgby_development',
        title: '城池发展拉满',
        description: '农业、商业、人口、民忠和防灾提升至上限',
        icon: Icons.location_city,
      ),
      _CheatOption(
        action: 'sgby_generals',
        title: '强化我方武将',
        description: '武力、智力、忠诚、体力和兵力大幅提升',
        icon: Icons.shield,
      ),
    ],
    GameId.fmj => const <_CheatOption>[
      _CheatOption(
        action: 'fmj_invincible',
        title: '切换我方无敌',
        description: '敌人的攻击无法扣除我方生命',
        icon: Icons.health_and_safety,
      ),
      _CheatOption(
        action: 'fmj_one_hit_kill',
        title: '切换一击必杀',
        description: '我方攻击命中后直接消灭所有受伤敌人',
        icon: Icons.flash_on,
      ),
      _CheatOption(
        action: 'fmj_normal_attack_all',
        title: '切换普通攻击群攻',
        description: '我方角色的普通攻击同时攻击全部敌人',
        icon: Icons.blur_circular,
      ),
      _CheatOption(
        action: 'fmj_restore',
        title: '全队完全恢复',
        description: '生命和真气回满，同时清除异常状态',
        icon: Icons.favorite,
      ),
      _CheatOption(
        action: 'fmj_money',
        title: '增加十万金钱',
        description: '当前金钱增加 100000',
        icon: Icons.monetization_on,
      ),
      _CheatOption(
        action: 'fmj_stats',
        title: '全队属性拉满',
        description: '生命、真气、攻防、身法、灵力和幸运提升至上限',
        icon: Icons.auto_graph,
      ),
      _CheatOption(
        action: 'fmj_level',
        title: '全队升至满级',
        description: '按照各角色成长链提升到自身等级上限',
        icon: Icons.upgrade,
      ),
      _CheatOption(
        action: 'fmj_force_win',
        title: '当前战斗胜利',
        description: '仅在战斗过程中使用',
        icon: Icons.emoji_events,
      ),
      _CheatOption(
        action: 'fmj_random_battle',
        title: '切换随机战斗',
        description: '在开启和关闭随机战斗之间切换',
        icon: Icons.sync_alt,
      ),
    ],
  };

  var cheatState = await viewModel.getCheatState();
  if (!context.mounted) return;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) {
      String? runningAction;
      return StatefulBuilder(
        builder: (sheetContext, setSheetState) {
          return SafeArea(
            top: false,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.72,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        '${game.title}作弊系统',
                        style: Theme.of(sheetContext).textTheme.titleLarge,
                      ),
                    ),
                  ),
                  Flexible(
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: options.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final option = options[index];
                        final isRunning = runningAction == option.action;
                        return ListTile(
                          leading: Icon(option.icon),
                          title: Text(option.title),
                          subtitle: Text(option.description),
                          trailing: isRunning
                              ? const SizedBox.square(
                                  dimension: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.chevron_right),
                          enabled: runningAction == null,
                          onTap: () async {
                            setSheetState(() => runningAction = option.action);
                            final result = await viewModel.applyCheat(
                              option.action,
                            );
                            if (!sheetContext.mounted) return;
                            final latestState = await viewModel.getCheatState();
                            if (!sheetContext.mounted) return;
                            setSheetState(() {
                              runningAction = null;
                              cheatState = latestState;
                            });
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(result.message),
                                backgroundColor: result.isSuccess
                                    ? const Color(0xFF2E6E4F)
                                    : Theme.of(context).colorScheme.error,
                              ),
                            );
                          },
                        );
                      },
                    ),
                  ),
                  if (game.id == GameId.fmj) _FmjCheatStatus(state: cheatState),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}

class _FmjCheatStatus extends StatelessWidget {
  const _FmjCheatStatus({required this.state});

  final Map<String, bool> state;

  @override
  Widget build(BuildContext context) {
    final enabledLabels = <String>[
      if (state['invincible'] == true) '我方无敌',
      if (state['oneHitKill'] == true) '一击必杀',
      if (state['normalAttackAll'] == true) '普通攻击群攻',
      if (state['randomBattleDisabled'] == true) '关闭随机战斗',
    ];
    return DecoratedBox(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0xFF303438))),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('当前作弊状态', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: enabledLabels.isEmpty
                  ? const <Widget>[Chip(label: Text('未开启持续作弊'))]
                  : enabledLabels
                        .map(
                          (label) => Chip(
                            avatar: const Icon(Icons.check_circle, size: 18),
                            label: Text(label),
                          ),
                        )
                        .toList(growable: false),
            ),
          ],
        ),
      ),
    );
  }
}
