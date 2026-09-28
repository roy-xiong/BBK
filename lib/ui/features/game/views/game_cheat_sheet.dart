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
    this.stateKey,
  });

  final String action;
  final String title;
  final String description;
  final IconData icon;
  final String? stateKey;
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
        title: '我方全体属性拉满',
        description: '等级、武力、智力、忠诚、体力和兵力全部提升至上限',
        icon: Icons.shield,
      ),
      _CheatOption(
        action: 'sgby_edit_general',
        title: '单个武将详细调整',
        description: '选择我方武将，单独修改属性、兵种和战场状态',
        icon: Icons.manage_accounts,
      ),
      _CheatOption(
        action: 'sgby_faction_colors',
        title: '阵营城池着色',
        description: '我方、空城和不同敌方势力使用独立颜色',
        icon: Icons.color_lens,
        stateKey: 'factionColors',
      ),
      _CheatOption(
        action: 'sgby_invincible',
        title: '我方无敌',
        description: '敌方普通攻击和技能无法削减我方兵力或施加异常状态',
        icon: Icons.health_and_safety,
        stateKey: 'invincible',
      ),
      _CheatOption(
        action: 'sgby_one_hit_kill',
        title: '我方一击必杀',
        description: '我方普通攻击和伤害技能直接击溃敌方目标',
        icon: Icons.flash_on,
        stateKey: 'oneHitKill',
      ),
      _CheatOption(
        action: 'sgby_force_win',
        title: '当前战斗立即胜利',
        description: '仅在战斗过程中生效，并按正常胜利流程结算',
        icon: Icons.emoji_events,
      ),
    ],
    GameId.fmj => const <_CheatOption>[
      _CheatOption(
        action: 'fmj_invincible',
        title: '切换我方无敌',
        description: '敌人的攻击无法扣除我方生命',
        icon: Icons.health_and_safety,
        stateKey: 'invincible',
      ),
      _CheatOption(
        action: 'fmj_one_hit_kill',
        title: '切换一击必杀',
        description: '我方攻击命中后直接消灭所有受伤敌人',
        icon: Icons.flash_on,
        stateKey: 'oneHitKill',
      ),
      _CheatOption(
        action: 'fmj_normal_attack_all',
        title: '切换普通攻击群攻',
        description: '我方角色的普通攻击同时攻击全部敌人',
        icon: Icons.blur_circular,
        stateKey: 'normalAttackAll',
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
  final hostContext = context;

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
                maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.82,
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
                        final stateKey = option.stateKey;
                        final stateEnabled = stateKey != null
                            ? cheatState[stateKey] == true
                            : false;

                        Future<void> runOption() async {
                          if (option.action == 'sgby_edit_general') {
                            if (hostContext.mounted) {
                              await showSgbyGeneralEditor(
                                hostContext,
                                viewModel: viewModel,
                              );
                            }
                            return;
                          }
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
                          ScaffoldMessenger.of(hostContext).showSnackBar(
                            SnackBar(
                              content: Text(result.message),
                              backgroundColor: result.isSuccess
                                  ? const Color(0xFF2E6E4F)
                                  : Theme.of(hostContext).colorScheme.error,
                            ),
                          );
                        }

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
                              : stateKey != null
                              ? Switch(
                                  value: stateEnabled,
                                  onChanged: runningAction == null
                                      ? (_) => runOption()
                                      : null,
                                )
                              : const Icon(Icons.chevron_right),
                          enabled: runningAction == null,
                          onTap: runOption,
                        );
                      },
                    ),
                  ),
                  if (game.id == GameId.fmj)
                    _FmjCheatStatus(state: cheatState)
                  else
                    _SgbyCheatStatus(state: cheatState),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}

/// 展示三国霸业单武将编辑面板。
Future<void> showSgbyGeneralEditor(
  BuildContext context, {
  required GameViewModel viewModel,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) {
      return FractionallySizedBox(
        heightFactor: 0.88,
        child: _SgbyGeneralEditorSheet(viewModel: viewModel),
      );
    },
  );
}

/// 三国霸业单武将属性编辑器。
class _SgbyGeneralEditorSheet extends StatefulWidget {
  const _SgbyGeneralEditorSheet({required this.viewModel});

  final GameViewModel viewModel;

  @override
  State<_SgbyGeneralEditorSheet> createState() =>
      _SgbyGeneralEditorSheetState();
}

class _SgbyGeneralEditorSheetState extends State<_SgbyGeneralEditorSheet> {
  static const List<String> _armsTypeNames = <String>[
    '骑兵',
    '步兵',
    '弓兵',
    '水兵',
    '极兵',
    '玄兵',
  ];

  SgbyCheatData? _data;
  int? _selectedGeneralIndex;
  String? _runningAction;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({int? preferredGeneralIndex}) async {
    final data = await widget.viewModel.getSgbyCheatData();
    if (!mounted) return;
    final availableIndexes = data.generals
        .map((general) => general.index)
        .toSet();
    final nextIndex =
        preferredGeneralIndex != null &&
            availableIndexes.contains(preferredGeneralIndex)
        ? preferredGeneralIndex
        : availableIndexes.contains(_selectedGeneralIndex)
        ? _selectedGeneralIndex
        : data.generals.firstOrNull?.index;
    setState(() {
      _data = data;
      _selectedGeneralIndex = nextIndex;
    });
  }

  SgbyGeneralCheatInfo? get _selectedGeneral {
    final selectedIndex = _selectedGeneralIndex;
    if (selectedIndex == null) return null;
    for (final general in _data?.generals ?? const <SgbyGeneralCheatInfo>[]) {
      if (general.index == selectedIndex) return general;
    }
    return null;
  }

  Future<void> _apply(
    String action, {
    Map<String, Object?> extraParameters = const <String, Object?>{},
  }) async {
    final selectedIndex = _selectedGeneralIndex;
    if (_runningAction != null || selectedIndex == null) return;
    setState(() => _runningAction = action);
    final result = await widget.viewModel.applyCheat(
      action,
      parameters: <String, Object?>{
        'generalIndex': selectedIndex,
        ...extraParameters,
      },
    );
    if (!mounted) return;
    await _loadData(preferredGeneralIndex: selectedIndex);
    if (!mounted) return;
    setState(() => _runningAction = null);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result.message),
        backgroundColor: result.isSuccess
            ? const Color(0xFF2E6E4F)
            : Theme.of(context).colorScheme.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return const SafeArea(child: Center(child: CircularProgressIndicator()));
    }
    if (!data.isSuccess || data.generals.isEmpty) {
      return SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.person_off, size: 40),
                const SizedBox(height: 12),
                Text(
                  data.message.isEmpty ? '没有可编辑的我方武将' : data.message,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _loadData,
                  icon: const Icon(Icons.refresh),
                  label: const Text('重新读取'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final selected = _selectedGeneral;
    return SafeArea(
      top: false,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '单个武将调整',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  tooltip: '刷新武将数据',
                  onPressed: _runningAction == null ? _loadData : null,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              children: [
                DropdownButtonFormField<int>(
                  key: ValueKey<int?>(_selectedGeneralIndex),
                  initialValue: _selectedGeneralIndex,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: '我方武将',
                    prefixIcon: Icon(Icons.person_search),
                    border: OutlineInputBorder(),
                  ),
                  items: data.generals
                      .map(
                        (general) => DropdownMenuItem<int>(
                          value: general.index,
                          child: Text(
                            '${general.name} · ${general.cityName}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: _runningAction == null
                      ? (value) => setState(() => _selectedGeneralIndex = value)
                      : null,
                ),
                if (selected != null) ...[
                  const SizedBox(height: 16),
                  _GeneralAttributeSummary(
                    general: selected,
                    maxLevel: data.maxLevel,
                    armsTypeNames: _armsTypeNames,
                  ),
                  const SizedBox(height: 20),
                  Text('属性强化', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _actionButton(
                        '全部拉满',
                        Icons.auto_graph,
                        'sgby_general_all',
                      ),
                      _actionButton(
                        '武力 100',
                        Icons.fitness_center,
                        'sgby_general_force',
                      ),
                      _actionButton(
                        '智力 100',
                        Icons.psychology,
                        'sgby_general_iq',
                      ),
                      _actionButton(
                        '体力 100',
                        Icons.favorite,
                        'sgby_general_thew',
                      ),
                      _actionButton(
                        '忠诚 100',
                        Icons.handshake,
                        'sgby_general_devotion',
                      ),
                      _actionButton(
                        '等级 ${data.maxLevel}',
                        Icons.upgrade,
                        'sgby_general_level',
                      ),
                      _actionButton(
                        '兵力 65535',
                        Icons.groups,
                        'sgby_general_arms',
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  DropdownButtonFormField<int>(
                    key: ValueKey<String>(
                      '${selected.index}:${selected.baseArmsType}',
                    ),
                    initialValue: selected.baseArmsType
                        .clamp(0, _armsTypeNames.length - 1)
                        .toInt(),
                    decoration: const InputDecoration(
                      labelText: '基础兵种',
                      prefixIcon: Icon(Icons.security),
                      border: OutlineInputBorder(),
                    ),
                    items: List<DropdownMenuItem<int>>.generate(
                      _armsTypeNames.length,
                      (index) => DropdownMenuItem<int>(
                        value: index,
                        child: Text(_armsTypeNames[index]),
                      ),
                    ),
                    onChanged: _runningAction == null
                        ? (value) {
                            if (value != null) {
                              _apply(
                                'sgby_general_arm_type',
                                extraParameters: <String, Object?>{
                                  'armsType': value,
                                },
                              );
                            }
                          }
                        : null,
                  ),
                  if (selected.effectiveArmsType != selected.baseArmsType)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        '当前装备将实际兵种覆盖为：'
                        '${_armsTypeName(selected.effectiveArmsType)}',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.tertiary,
                        ),
                      ),
                    ),
                  const SizedBox(height: 20),
                  Text('当前战斗', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _actionButton(
                        '移动 8 步并恢复行动',
                        Icons.directions_run,
                        'sgby_general_move',
                        enabled: selected.inBattle,
                      ),
                      _actionButton(
                        '恢复生命、技能与状态',
                        Icons.healing,
                        'sgby_general_restore',
                        enabled: selected.inBattle,
                      ),
                    ],
                  ),
                  if (!selected.inBattle)
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text('该武将当前不在我方战场队列中'),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionButton(
    String label,
    IconData icon,
    String action, {
    bool enabled = true,
  }) {
    final running = _runningAction == action;
    return OutlinedButton.icon(
      onPressed: enabled && _runningAction == null
          ? () => _apply(action)
          : null,
      icon: running
          ? const SizedBox.square(
              dimension: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(icon),
      label: Text(label),
    );
  }

  String _armsTypeName(int index) {
    return index >= 0 && index < _armsTypeNames.length
        ? _armsTypeNames[index]
        : '未知兵种';
  }
}

/// 当前选中武将的属性摘要。
class _GeneralAttributeSummary extends StatelessWidget {
  const _GeneralAttributeSummary({
    required this.general,
    required this.maxLevel,
    required this.armsTypeNames,
  });

  final SgbyGeneralCheatInfo general;
  final int maxLevel;
  final List<String> armsTypeNames;

  @override
  Widget build(BuildContext context) {
    String armsTypeName(int index) => index >= 0 && index < armsTypeNames.length
        ? armsTypeNames[index]
        : '未知';

    final labels = <String>[
      '等级 ${general.level}/$maxLevel',
      '武力 ${general.force}',
      '智力 ${general.iq}',
      '体力 ${general.thew}',
      '忠诚 ${general.devotion}',
      '经验 ${general.experience}',
      '兵力 ${general.arms}',
      '兵种 ${armsTypeName(general.effectiveArmsType)}',
      if (general.inBattle) '移动 ${general.battleMove}',
      if (general.inBattle) '生命 ${general.battleHp}',
      if (general.inBattle) '技能 ${general.battleMp}',
      if (general.inBattle) general.canAct ? '可行动' : '已行动',
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: labels
          .map((label) => Chip(label: Text(label)))
          .toList(growable: false),
    );
  }
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

/// 三国霸业持续作弊与阵营着色状态。
class _SgbyCheatStatus extends StatelessWidget {
  const _SgbyCheatStatus({required this.state});

  final Map<String, bool> state;

  @override
  Widget build(BuildContext context) {
    final enabledLabels = <String>[
      if (state['factionColors'] == true) '阵营城池着色',
      if (state['invincible'] == true) '我方无敌',
      if (state['oneHitKill'] == true) '一击必杀',
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
            Text('当前增强状态', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: enabledLabels.isEmpty
                  ? const <Widget>[Chip(label: Text('未开启持续增强'))]
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
