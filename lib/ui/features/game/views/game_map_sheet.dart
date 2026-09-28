import 'package:flutter/material.dart';

import '../../../../data/repositories/fmj_world_map_repository.dart';
import '../../../../domain/models/fmj_exploration.dart';
import '../view_models/game_view_model.dart';

/// 打开伏魔记探索面板，提供当前地图与全局场景两个视图。
Future<void> showGameMapSheet(
  BuildContext context, {
  required GameViewModel viewModel,
  required FmjWorldMapRepository worldMapRepository,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _GameMapSheet(
      viewModel: viewModel,
      worldMapRepository: worldMapRepository,
    ),
  );
}

class _MapPanelData {
  const _MapPanelData({required this.exploration, required this.world});

  final FmjExplorationState? exploration;
  final FmjWorldMapData world;
}

class _GameMapSheet extends StatefulWidget {
  const _GameMapSheet({
    required this.viewModel,
    required this.worldMapRepository,
  });

  final GameViewModel viewModel;
  final FmjWorldMapRepository worldMapRepository;

  @override
  State<_GameMapSheet> createState() => _GameMapSheetState();
}

class _GameMapSheetState extends State<_GameMapSheet> {
  late Future<_MapPanelData> _dataFuture;

  @override
  void initState() {
    super.initState();
    _dataFuture = _loadData();
  }

  Future<_MapPanelData> _loadData() async {
    final results = await Future.wait<Object?>(<Future<Object?>>[
      widget.viewModel.getExplorationState(),
      widget.worldMapRepository.load(),
    ]);
    return _MapPanelData(
      exploration: results[0] as FmjExplorationState?,
      world: results[1] as FmjWorldMapData,
    );
  }

  void _refresh() {
    setState(() => _dataFuture = _loadData());
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.9,
      child: FutureBuilder<_MapPanelData>(
        future: _dataFuture,
        builder: (context, snapshot) {
          final data = snapshot.data;
          if (data == null) {
            if (snapshot.hasError) {
              return _MapErrorView(error: snapshot.error!, onRetry: _refresh);
            }
            return const Center(child: CircularProgressIndicator());
          }
          final currentMapId = data.exploration?.currentMap?.id;
          return DefaultTabController(
            length: 2,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '伏魔记探索地图',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ),
                      IconButton(
                        tooltip: '刷新位置和进度',
                        onPressed: _refresh,
                        icon: const Icon(Icons.refresh),
                      ),
                    ],
                  ),
                ),
                _LampProgress(lamps: data.exploration?.lamps),
                const TabBar(
                  tabs: [
                    Tab(icon: Icon(Icons.map), text: '当前地图'),
                    Tab(icon: Icon(Icons.hub), text: '全局场景'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      _CurrentMapView(map: data.exploration?.currentMap),
                      _WorldMapView(
                        data: data.world,
                        currentMapId: currentMapId,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LampProgress extends StatelessWidget {
  const _LampProgress({required this.lamps});

  final List<bool>? lamps;

  @override
  Widget build(BuildContext context) {
    final values = lamps?.length == 8
        ? lamps!
        : List<bool>.filled(8, false, growable: false);
    final completed = values.where((value) => value).length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '灯洞进度  $completed / 8',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          LayoutBuilder(
            builder: (context, constraints) {
              final itemWidth = (constraints.maxWidth - 24) / 4;
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: List<Widget>.generate(8, (index) {
                  final done = values[index];
                  return Container(
                    width: itemWidth,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: done
                          ? const Color(0xFF245C43)
                          : const Color(0xFF2B2E32),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: done
                            ? const Color(0xFF62B88A)
                            : const Color(0xFF555A60),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          done
                              ? Icons.check_circle
                              : Icons.radio_button_unchecked,
                          size: 16,
                        ),
                        const SizedBox(width: 4),
                        Flexible(child: Text('灯${index + 1}')),
                      ],
                    ),
                  );
                }),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _CurrentMapView extends StatelessWidget {
  const _CurrentMapView({required this.map});

  final FmjCurrentMap? map;

  @override
  Widget build(BuildContext context) {
    final map = this.map;
    if (map == null || map.width <= 0 || map.height <= 0) {
      return const Center(child: Text('请先进入或载入一局游戏'));
    }
    const cellSize = 12.0;
    final canvasSize = Size(map.width * cellSize, map.height * cellSize);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  map.sceneName.isNotEmpty ? map.sceneName : map.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Text('${map.id}  (${map.playerX}, ${map.playerY})'),
            ],
          ),
        ),
        const _MapLegend(),
        Expanded(
          child: ClipRect(
            child: InteractiveViewer(
              constrained: false,
              minScale: 0.45,
              maxScale: 5,
              boundaryMargin: const EdgeInsets.all(120),
              child: CustomPaint(
                size: canvasSize,
                painter: _CurrentMapPainter(map: map, cellSize: cellSize),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _MapLegend extends StatelessWidget {
  const _MapLegend();

  @override
  Widget build(BuildContext context) {
    Widget item(Color color, String text) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 12, height: 12, color: color),
          const SizedBox(width: 4),
          Text(text),
        ],
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Wrap(
        spacing: 14,
        runSpacing: 6,
        children: [
          item(const Color(0xFF798C70), '可行走'),
          item(const Color(0xFF34383D), '障碍'),
          item(const Color(0xFFD5A53D), '事件点'),
          item(const Color(0xFFE84D4D), '当前位置'),
        ],
      ),
    );
  }
}

class _CurrentMapPainter extends CustomPainter {
  _CurrentMapPainter({required this.map, required this.cellSize});

  final FmjCurrentMap map;
  final double cellSize;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFF181A1D),
    );
    final obstaclePaint = Paint()..color = const Color(0xFF34383D);
    final eventPaint = Paint()..color = const Color(0xFFD5A53D);
    final gridPaint = Paint()
      ..color = const Color(0x22000000)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5;

    for (var y = 0; y < map.height; y++) {
      for (var x = 0; x < map.width; x++) {
        final index = y * map.width + x;
        if (index >= map.cells.length) continue;
        final cell = map.cells[index];
        final rect = Rect.fromLTWH(
          x * cellSize,
          y * cellSize,
          cellSize,
          cellSize,
        );
        if (cell.eventId > 0) {
          canvas.drawRect(rect, eventPaint);
        } else if (cell.walkable) {
          final shade = 0.78 + cell.tileIndex % 4 * 0.045;
          canvas.drawRect(
            rect,
            Paint()
              ..color = Color.lerp(
                const Color(0xFF506249),
                const Color(0xFFA8B59D),
                shade,
              )!,
          );
        } else {
          canvas.drawRect(rect, obstaclePaint);
        }
        canvas.drawRect(rect, gridPaint);
      }
    }

    if (map.playerX >= 0 && map.playerY >= 0) {
      final center = Offset(
        (map.playerX + 0.5) * cellSize,
        (map.playerY + 0.5) * cellSize,
      );
      canvas.drawCircle(
        center,
        cellSize * 0.48,
        Paint()
          ..color = Colors.white
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      canvas.drawCircle(
        center,
        cellSize * 0.34,
        Paint()..color = const Color(0xFFE84D4D),
      );
    }
  }

  @override
  bool shouldRepaint(_CurrentMapPainter oldDelegate) => oldDelegate.map != map;
}

class _WorldMapView extends StatelessWidget {
  const _WorldMapView({required this.data, required this.currentMapId});

  final FmjWorldMapData data;
  final String? currentMapId;

  @override
  Widget build(BuildContext context) {
    final layout = _WorldGraphLayout.build(data.nodes);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
          child: Row(
            children: [
              const Expanded(child: Text('双指缩放，拖动查看全部 83 个场景')),
              if (currentMapId != null) Text('当前位置 $currentMapId'),
            ],
          ),
        ),
        Expanded(
          child: ClipRect(
            child: InteractiveViewer(
              constrained: false,
              minScale: 0.35,
              maxScale: 3,
              boundaryMargin: const EdgeInsets.all(160),
              child: CustomPaint(
                size: layout.size,
                painter: _WorldMapPainter(
                  data: data,
                  layout: layout,
                  currentMapId: currentMapId,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _WorldGraphLayout {
  const _WorldGraphLayout({
    required this.size,
    required this.positions,
    required this.groupHeaders,
  });

  static const double nodeWidth = 126;
  static const double nodeHeight = 46;

  final Size size;
  final Map<String, Offset> positions;
  final Map<int, Offset> groupHeaders;

  factory _WorldGraphLayout.build(List<FmjWorldMapNode> nodes) {
    const columns = 4;
    const horizontalGap = 22.0;
    const verticalGap = 24.0;
    const left = 24.0;
    var top = 54.0;
    final positions = <String, Offset>{};
    final groupHeaders = <int, Offset>{};
    for (final type in const <int>[1, 2, 3]) {
      final group = nodes.where((node) => node.type == type).toList()
        ..sort((a, b) => a.index.compareTo(b.index));
      groupHeaders[type] = Offset(left, top - 34);
      for (var index = 0; index < group.length; index++) {
        final column = index % columns;
        final row = index ~/ columns;
        positions[group[index].id] = Offset(
          left + column * (nodeWidth + horizontalGap),
          top + row * (nodeHeight + verticalGap),
        );
      }
      final rows = (group.length / columns).ceil();
      top += rows * (nodeHeight + verticalGap) + 62;
    }
    return _WorldGraphLayout(
      size: Size(
        left * 2 + columns * nodeWidth + (columns - 1) * horizontalGap,
        top,
      ),
      positions: positions,
      groupHeaders: groupHeaders,
    );
  }
}

class _WorldMapPainter extends CustomPainter {
  _WorldMapPainter({
    required this.data,
    required this.layout,
    required this.currentMapId,
  });

  final FmjWorldMapData data;
  final _WorldGraphLayout layout;
  final String? currentMapId;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFF17191C),
    );
    final edgePaint = Paint()
      ..color = const Color(0x334FC28B)
      ..strokeWidth = 1.2;
    final activeEdgePaint = Paint()
      ..color = const Color(0xAAE84D4D)
      ..strokeWidth = 2.2;

    for (final edge in data.edges) {
      final from = layout.positions[edge.from];
      final to = layout.positions[edge.to];
      if (from == null || to == null) continue;
      final fromCenter =
          from +
          const Offset(
            _WorldGraphLayout.nodeWidth / 2,
            _WorldGraphLayout.nodeHeight / 2,
          );
      final toCenter =
          to +
          const Offset(
            _WorldGraphLayout.nodeWidth / 2,
            _WorldGraphLayout.nodeHeight / 2,
          );
      final active = edge.from == currentMapId || edge.to == currentMapId;
      canvas.drawLine(
        fromCenter,
        toCenter,
        active ? activeEdgePaint : edgePaint,
      );
    }

    const groupNames = <int, String>{1: '室外区域', 2: '建筑内部', 3: '洞穴迷宫'};
    for (final entry in layout.groupHeaders.entries) {
      _paintText(
        canvas,
        groupNames[entry.key] ?? '其他区域',
        entry.value,
        const TextStyle(
          color: Color(0xFFE7E4DD),
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      );
    }

    for (final node in data.nodes) {
      final offset = layout.positions[node.id];
      if (offset == null) continue;
      final rect = Rect.fromLTWH(
        offset.dx,
        offset.dy,
        _WorldGraphLayout.nodeWidth,
        _WorldGraphLayout.nodeHeight,
      );
      final isCurrent = node.id == currentMapId;
      final color = isCurrent
          ? const Color(0xFFB9323A)
          : switch (node.type) {
              1 => const Color(0xFF315E49),
              2 => const Color(0xFF4B5057),
              3 => const Color(0xFF675071),
              _ => const Color(0xFF3B3E43),
            };
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(6)),
        Paint()..color = color,
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(6)),
        Paint()
          ..color = isCurrent ? Colors.white : const Color(0x667D858C)
          ..style = PaintingStyle.stroke
          ..strokeWidth = isCurrent ? 2.2 : 1,
      );
      _paintText(
        canvas,
        node.name,
        offset + const Offset(7, 6),
        const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
        maxWidth: _WorldGraphLayout.nodeWidth - 14,
      );
      _paintText(
        canvas,
        node.id,
        offset + const Offset(7, 27),
        const TextStyle(color: Color(0xFFDFDDD7), fontSize: 9),
      );
    }
  }

  void _paintText(
    Canvas canvas,
    String text,
    Offset offset,
    TextStyle style, {
    double? maxWidth,
  }) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: maxWidth ?? double.infinity);
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(_WorldMapPainter oldDelegate) {
    return oldDelegate.currentMapId != currentMapId || oldDelegate.data != data;
  }
}

class _MapErrorView extends StatelessWidget {
  const _MapErrorView({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 40),
            const SizedBox(height: 12),
            Text(error.toString(), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('重新加载'),
            ),
          ],
        ),
      ),
    );
  }
}
