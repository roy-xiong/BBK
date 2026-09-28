/// 伏魔记当前地图的单个格子。
class FmjMapCell {
  const FmjMapCell({required this.rawValue});

  final int rawValue;

  bool get walkable => rawValue & 0x80 != 0;
  int get tileIndex => rawValue & 0x7f;
  int get eventId => rawValue >> 8 & 0xff;
}

/// 当前场景完整地图和玩家位置。
class FmjCurrentMap {
  const FmjCurrentMap({
    required this.id,
    required this.type,
    required this.index,
    required this.name,
    required this.sceneName,
    required this.width,
    required this.height,
    required this.playerX,
    required this.playerY,
    required this.cells,
  });

  final String id;
  final int type;
  final int index;
  final String name;
  final String sceneName;
  final int width;
  final int height;
  final int playerX;
  final int playerY;
  final List<FmjMapCell> cells;

  factory FmjCurrentMap.fromJson(Map<String, dynamic> json) {
    final rawCells = json['cells'];
    return FmjCurrentMap(
      id: json['id'] as String? ?? '',
      type: json['type'] as int? ?? 0,
      index: json['index'] as int? ?? 0,
      name: json['name'] as String? ?? '',
      sceneName: json['sceneName'] as String? ?? '',
      width: json['width'] as int? ?? 0,
      height: json['height'] as int? ?? 0,
      playerX: json['playerX'] as int? ?? -1,
      playerY: json['playerY'] as int? ?? -1,
      cells: rawCells is List
          ? rawCells
                .whereType<int>()
                .map((value) => FmjMapCell(rawValue: value))
                .toList(growable: false)
          : const <FmjMapCell>[],
    );
  }
}

/// 伏魔记探索面板的实时状态。
class FmjExplorationState {
  const FmjExplorationState({required this.lamps, required this.currentMap});

  final List<bool> lamps;
  final FmjCurrentMap? currentMap;

  factory FmjExplorationState.fromJson(Map<String, dynamic> json) {
    final rawLamps = json['lamps'];
    final rawMap = json['map'];
    return FmjExplorationState(
      lamps: rawLamps is List
          ? rawLamps.map((value) => value == true).toList(growable: false)
          : List<bool>.filled(8, false, growable: false),
      currentMap: rawMap is Map
          ? FmjCurrentMap.fromJson(Map<String, dynamic>.from(rawMap))
          : null,
    );
  }
}

/// 全局场景图中的地图节点。
class FmjWorldMapNode {
  const FmjWorldMapNode({
    required this.id,
    required this.type,
    required this.index,
    required this.name,
    required this.width,
    required this.height,
  });

  final String id;
  final int type;
  final int index;
  final String name;
  final int width;
  final int height;

  factory FmjWorldMapNode.fromJson(Map<String, dynamic> json) {
    return FmjWorldMapNode(
      id: json['id'] as String? ?? '',
      type: json['type'] as int? ?? 0,
      index: json['index'] as int? ?? 0,
      name: json['name'] as String? ?? '',
      width: json['width'] as int? ?? 0,
      height: json['height'] as int? ?? 0,
    );
  }
}

/// 全局场景图中的连接边。
class FmjWorldMapEdge {
  const FmjWorldMapEdge({required this.from, required this.to});

  final String from;
  final String to;

  factory FmjWorldMapEdge.fromJson(Map<String, dynamic> json) {
    return FmjWorldMapEdge(
      from: json['from'] as String? ?? '',
      to: json['to'] as String? ?? '',
    );
  }
}

/// 从原始 DAT.LIB 和剧情脚本生成的完整场景拓扑。
class FmjWorldMapData {
  const FmjWorldMapData({required this.nodes, required this.edges});

  final List<FmjWorldMapNode> nodes;
  final List<FmjWorldMapEdge> edges;

  factory FmjWorldMapData.fromJson(Map<String, dynamic> json) {
    final rawMaps = json['maps'];
    final rawEdges = json['edges'];
    return FmjWorldMapData(
      nodes: rawMaps is List
          ? rawMaps
                .whereType<Map>()
                .map(
                  (value) => FmjWorldMapNode.fromJson(
                    Map<String, dynamic>.from(value),
                  ),
                )
                .toList(growable: false)
          : const <FmjWorldMapNode>[],
      edges: rawEdges is List
          ? rawEdges
                .whereType<Map>()
                .map(
                  (value) => FmjWorldMapEdge.fromJson(
                    Map<String, dynamic>.from(value),
                  ),
                )
                .toList(growable: false)
          : const <FmjWorldMapEdge>[],
    );
  }
}
