import 'dart:convert';

import 'package:flutter/services.dart';

import '../../domain/models/fmj_exploration.dart';

/// 读取构建期生成的伏魔记全局场景拓扑。
class FmjWorldMapRepository {
  static const String _assetPath = 'assets/games/fmj/world-map.json';

  FmjWorldMapData? _cachedData;

  Future<FmjWorldMapData> load() async {
    final cachedData = _cachedData;
    if (cachedData != null) return cachedData;
    final content = await rootBundle.loadString(_assetPath);
    final decoded = jsonDecode(content);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('伏魔记全局地图数据格式错误');
    }
    final data = FmjWorldMapData.fromJson(decoded);
    _cachedData = data;
    return data;
  }
}
