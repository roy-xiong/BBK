/// 内置游戏标识。
enum GameId {
  fmj,
  sgby;

  String get storageKey => name;

  static GameId? fromStorageKey(String? value) {
    for (final gameId in values) {
      if (gameId.storageKey == value) return gameId;
    }
    return null;
  }
}

/// Flutter 与游戏引擎之间统一使用的输入动作。
enum GameInput {
  up,
  down,
  left,
  right,
  confirm,
  cancel,
  pageUp,
  pageDown,
  search,
  help,
  endTurn,
  battleInfo,
  autoBattle,
  toggleBattleSpeed,
  searchHistory,
  generalRoster;

  static GameInput? fromWireValue(String? value) {
    for (final input in values) {
      if (input.name == value) return input;
    }
    return null;
  }
}

/// 三国霸业内置版本。
enum SgbyEdition {
  original(
    storageValue: 'original',
    title: '词典原版',
    assetPath: 'libs/dat-mod.lib',
  ),
  refined(
    storageValue: 'refined',
    title: '原版精修 4X',
    assetPath: 'libs/SGBY-Reset-4X.lib',
  ),
  balanced(
    storageValue: 'balanced',
    title: '平衡版 2.1',
    assetPath: 'libs/balance2.01.lib',
  );

  const SgbyEdition({
    required this.storageValue,
    required this.title,
    required this.assetPath,
  });

  final String storageValue;
  final String title;
  final String assetPath;

  static SgbyEdition fromStorageValue(String? value) {
    for (final edition in values) {
      if (edition.storageValue == value) return edition;
    }
    return original;
  }
}

/// 启动页展示及运行游戏所需的静态定义。
class GameDefinition {
  const GameDefinition({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.coverAsset,
    required this.entryPath,
  });

  final GameId id;
  final String title;
  final String subtitle;
  final String coverAsset;
  final String entryPath;

  static const List<GameDefinition> all = <GameDefinition>[
    GameDefinition(
      id: GameId.fmj,
      title: '伏魔记',
      subtitle: '经典角色扮演',
      coverAsset: 'assets/images/fmj_cover.png',
      entryPath: 'fmj/index.html',
    ),
    GameDefinition(
      id: GameId.sgby,
      title: '三国霸业',
      subtitle: '经典回合策略',
      coverAsset: 'assets/images/sgby_cover.png',
      entryPath: 'sgby/index.html',
    ),
  ];
}
