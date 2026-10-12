import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../data/services/bbk_runtime_service.dart';

/// 通用作弊器。数值按明确的 1/2/4 字节小端格式操作，搜索在 native 帧边界执行。
class BbkCheatSheet extends StatefulWidget {
  const BbkCheatSheet({super.key, required this.runtime});
  final BbkRuntimeService runtime;
  @override
  State<BbkCheatSheet> createState() => _BbkCheatSheetState();
}

class _BbkCheatSheetState extends State<BbkCheatSheet> {
  final TextEditingController _value = TextEditingController();
  final TextEditingController _code = TextEditingController();
  List<Map<String, dynamic>> _cheats = const [];
  bool _busy = false;
  String? _message;
  late int _width;
  late String _space;

  @override
  void initState() {
    super.initState();
    _width = widget.runtime.searchWidth;
    _space = widget.runtime.searchSpace;
    unawaited(_refreshCheats());
  }

  @override
  void dispose() {
    _value.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _refreshCheats() async {
    try {
      final data = await widget.runtime.command({'op': 'cheatList'});
      final entries = data['cheats'];
      if (mounted) {
        setState(
          () => _cheats = entries is List
              ? entries.whereType<Map<String, dynamic>>().toList()
              : const [],
        );
      }
    } on Object catch (error) {
      if (mounted) setState(() => _message = _text(error));
    }
  }

  String _text(Object error) => error is PlatformException
      ? error.message ?? error.code
      : error.toString();

  Future<void> _perform(Future<void> Function() task) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await task();
    } on Object catch (error) {
      if (mounted) setState(() => _message = _text(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _search(String mode, {bool reset = false}) => _perform(() async {
    final value = int.tryParse(_value.text.trim());
    if (mode == 'equal' && (value == null || value < 0)) {
      throw const FormatException('请输入非负十进制数值');
    }
    final data = await widget.runtime.command(<String, Object?>{
      'op': 'search',
      'space': _space,
      'width': _width,
      'mode': mode,
      'reset': reset,
      if (mode == 'equal') 'value': value,
    });
    widget.runtime.searchResults = data;
    widget.runtime.searchWidth = _width;
    widget.runtime.searchSpace = _space;
    if (mounted) setState(() {});
  });

  Future<void> _edit(Map<String, dynamic> result) async {
    final address = result['address'];
    final current = result['value'];
    if (address is! int || current is! num) return;
    final controller = TextEditingController(text: current.toString());
    bool lock = false;
    final navigator = Navigator.of(context);
    final route = DialogRoute<(int, bool)>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            '地址 ${address.toRadixString(16).toUpperCase().padLeft(6, '0')}',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: controller,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '新数值（十进制）'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('持续锁定'),
                value: lock,
                onChanged: (value) => setDialogState(() => lock = value),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () {
                final value = int.tryParse(controller.text.trim());
                if (value == null ||
                    value < 0 ||
                    value >= (1 << (_width * 8))) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(const SnackBar(content: Text('数值超出所选字节宽度')));
                  return;
                }
                Navigator.pop(context, (value, lock));
              },
              child: const Text('写入'),
            ),
          ],
        ),
      ),
    );
    final answer = await navigator.push<(int, bool)>(route);
    // 弹窗 Future 在 pop 时完成，退出动画结束后再释放控制器，避免旧 TextField 访问已销毁对象。
    await route.completed;
    controller.dispose();
    if (answer == null || !mounted) return;
    await _perform(() async {
      await widget.runtime.command({
        'op': 'write',
        'address': address,
        'width': _width,
        'value': answer.$1,
        'lock': answer.$2,
      });
      await _refreshCheats();
      if (mounted) {
        setState(() => _message = answer.$2 ? '数值已锁定，可在下方作弊列表关闭' : '数值已写入');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final result = widget.runtime.searchResults;
    final results = result?['results'];
    final candidates = results is List
        ? results.whereType<Map<String, dynamic>>().toList()
        : <Map<String, dynamic>>[];
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.88,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '通用作弊器',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          if (_busy) const LinearProgressIndicator(),
          Expanded(
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                16,
                8,
                16,
                24 + MediaQuery.viewInsetsOf(context).bottom,
              ),
              children: [
                const Text('先搜索当前数值，回到游戏改变数值，再按“增加 / 减少 / 已变化”缩小范围。'),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final width in const [1, 2, 4])
                      ChoiceChip(
                        label: Text('${width * 8} 位'),
                        selected: _width == width,
                        onSelected: _busy
                            ? null
                            : (_) => setState(() {
                                _width = width;
                                widget.runtime.searchResults = null;
                              }),
                      ),
                    for (final space in const {
                      'ram': 'RAM',
                      'flash': 'Flash',
                    }.entries)
                      ChoiceChip(
                        label: Text(space.value),
                        selected: _space == space.key,
                        onSelected: _busy
                            ? null
                            : (_) => setState(() {
                                _space = space.key;
                                widget.runtime.searchResults = null;
                              }),
                      ),
                  ],
                ),
                TextField(
                  controller: _value,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: '当前数值（十进制）'),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : () => _search('equal', reset: true),
                      child: const Text('重新搜索'),
                    ),
                    OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => _search('initial', reset: true),
                      child: const Text('未知初值'),
                    ),
                    for (final mode in const {
                      'equal': '等于',
                      'increased': '增加',
                      'decreased': '减少',
                      'changed': '已变化',
                      'unchanged': '未变化',
                    }.entries)
                      OutlinedButton(
                        onPressed: _busy || result == null
                            ? null
                            : () => _search(mode.key),
                        child: Text(mode.value),
                      ),
                  ],
                ),
                if (_message != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      _message!,
                      style: const TextStyle(color: Colors.orange),
                    ),
                  ),
                if (result != null) ...[
                  const SizedBox(height: 12),
                  Text('匹配 ${result['total']} 个地址 · 展示前 100 个'),
                  for (final candidate in candidates)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        '0x${(candidate['address'] as int).toRadixString(16).toUpperCase().padLeft(6, '0')}',
                      ),
                      trailing: Text('${candidate['value']}'),
                      onTap: _busy ? null : () => _edit(candidate),
                    ),
                ],
                const Divider(height: 32),
                Text(
                  '作弊码与锁定列表',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                const Text(
                  '格式：6 位十六进制地址 : 2 / 4 / 8 位十六进制数值。8 位紧凑码和“4 位地址 空格 4 位数值”也可导入；每行一个。',
                ),
                TextField(
                  controller: _code,
                  minLines: 1,
                  maxLines: 4,
                  decoration: const InputDecoration(labelText: '输入已确认的作弊码'),
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.tonal(
                    onPressed: _busy
                        ? null
                        : () => _perform(() async {
                            final codes = _code.text
                                .split('\n')
                                .map((code) => code.trim())
                                .where((code) => code.isNotEmpty)
                                .toList();
                            if (codes.isEmpty) {
                              throw const FormatException('请输入作弊码');
                            }
                            await widget.runtime.command({
                              'op': 'cheatImport',
                              'codes': codes,
                            });
                            _code.clear();
                            await _refreshCheats();
                          }),
                    child: const Text('导入作弊码'),
                  ),
                ),
                for (final cheat in _cheats)
                  Row(
                    children: [
                      Expanded(
                        child: SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text('${cheat['code']}'),
                          value: cheat['enabled'] == true,
                          onChanged: _busy
                              ? null
                              : (enabled) => _perform(() async {
                                  await widget.runtime.command({
                                    'op': 'cheatToggle',
                                    'id': cheat['id'],
                                    'enabled': enabled,
                                  });
                                  await _refreshCheats();
                                }),
                        ),
                      ),
                      IconButton(
                        tooltip: '删除整条作弊',
                        onPressed: _busy
                            ? null
                            : () => _perform(() async {
                                await widget.runtime.command({
                                  'op': 'cheatRemove',
                                  'id': cheat['id'],
                                });
                                await _refreshCheats();
                              }),
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ],
                  ),
                if (_cheats.isEmpty) const Text('当前没有锁定项或作弊码'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
