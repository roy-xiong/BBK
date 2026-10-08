import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../../data/repositories/game_save_repository.dart';
import '../../../../data/services/game_controller_service.dart';
import '../../../../data/services/local_game_server.dart';
import '../../../../domain/models/app_settings.dart';
import '../../../../domain/models/fmj_exploration.dart';
import '../../../../domain/models/game_definition.dart';

/// 游戏引擎执行作弊操作后的结构化结果。
class CheatResult {
  const CheatResult({required this.isSuccess, required this.message});

  final bool isSuccess;
  final String message;
}

/// 请求游戏引擎打开存档界面后的结构化结果。
class SaveMenuResult {
  const SaveMenuResult({required this.isSuccess, required this.message});

  final bool isSuccess;
  final String message;
}

/// 三国霸业将领列表固定分组。
enum SgbyGeneralGroup {
  player,
  enemy,
  currentWild,
  futureWild;

  /// 解析增强脚本返回的白名单值；未知值按敌方只读处理，避免误开放属性修改。
  static SgbyGeneralGroup fromWireValue(String? value) {
    for (final group in values) {
      if (group.name == value) return group;
    }
    return enemy;
  }
}

/// 三国霸业单个武将的属性与列表归属快照。
class SgbyGeneralCheatInfo {
  const SgbyGeneralCheatInfo({
    required this.index,
    required this.name,
    required this.group,
    required this.factionName,
    required this.isRuler,
    required this.appearanceYear,
    required this.cityIndex,
    required this.cityName,
    required this.level,
    required this.force,
    required this.iq,
    required this.devotion,
    required this.thew,
    required this.experience,
    required this.arms,
    required this.baseArmsType,
    required this.effectiveArmsType,
    required this.inBattle,
    required this.battleMove,
    required this.battleHp,
    required this.battleMp,
    required this.battleState,
    required this.canAct,
  });

  factory SgbyGeneralCheatInfo.fromJson(Map<String, dynamic> json) {
    int integer(String key) => (json[key] as num?)?.toInt() ?? 0;

    return SgbyGeneralCheatInfo(
      index: integer('index'),
      name: json['name'] as String? ?? '未知武将',
      group: SgbyGeneralGroup.fromWireValue(json['group'] as String?),
      factionName: json['factionName'] as String? ?? '未知势力',
      isRuler: json['isRuler'] == true,
      appearanceYear: integer('appearanceYear'),
      cityIndex: integer('cityIndex'),
      cityName: json['cityName'] as String? ?? '未知城池',
      level: integer('level'),
      force: integer('force'),
      iq: integer('iq'),
      devotion: integer('devotion'),
      thew: integer('thew'),
      experience: integer('experience'),
      arms: integer('arms'),
      baseArmsType: integer('baseArmsType'),
      effectiveArmsType: integer('effectiveArmsType'),
      inBattle: json['inBattle'] == true,
      battleMove: integer('battleMove'),
      battleHp: integer('battleHp'),
      battleMp: integer('battleMp'),
      battleState: integer('battleState'),
      canAct: json['canAct'] == true,
    );
  }

  final int index;
  final String name;
  final SgbyGeneralGroup group;
  final String factionName;
  final bool isRuler;
  final int appearanceYear;
  final int cityIndex;
  final String cityName;
  final int level;
  final int force;
  final int iq;
  final int devotion;
  final int thew;
  final int experience;
  final int arms;
  final int baseArmsType;
  final int effectiveArmsType;
  final bool inBattle;
  final int battleMove;
  final int battleHp;
  final int battleMp;
  final int battleState;
  final bool canAct;
}

/// 三国霸业作弊面板所需的武将列表和版本级别上限。
class SgbyCheatData {
  const SgbyCheatData({
    required this.isSuccess,
    required this.message,
    required this.maxLevel,
    required this.generals,
  });

  factory SgbyCheatData.fromJson(Map<String, dynamic> json) {
    final rawGenerals = json['generals'];
    return SgbyCheatData(
      isSuccess: json['ok'] == true,
      message: json['message'] as String? ?? '',
      maxLevel: (json['maxLevel'] as num?)?.toInt() ?? 20,
      generals: rawGenerals is List
          ? rawGenerals
                .whereType<Map>()
                .map(
                  (value) => SgbyGeneralCheatInfo.fromJson(
                    Map<String, dynamic>.from(value),
                  ),
                )
                .toList(growable: false)
          : const <SgbyGeneralCheatInfo>[],
    );
  }

  final bool isSuccess;
  final String message;
  final int maxLevel;
  final List<SgbyGeneralCheatInfo> generals;
}

/// 三国霸业敌方城池内单个武将的只读信息。
class SgbyEnemyCityGeneralInfo {
  const SgbyEnemyCityGeneralInfo({
    required this.name,
    required this.level,
    required this.force,
    required this.iq,
    required this.devotion,
    required this.arms,
    required this.armsType,
    required this.isCaptive,
  });

  factory SgbyEnemyCityGeneralInfo.fromJson(Map<String, dynamic> json) {
    int integer(String key) => (json[key] as num?)?.toInt() ?? 0;

    return SgbyEnemyCityGeneralInfo(
      name: json['name'] as String? ?? '未知武将',
      level: integer('level'),
      force: integer('force'),
      iq: integer('iq'),
      devotion: integer('devotion'),
      arms: integer('arms'),
      armsType: integer('armsType'),
      isCaptive: json['captive'] == true,
    );
  }

  final String name;
  final int level;
  final int force;
  final int iq;
  final int devotion;
  final int arms;
  final int armsType;
  final bool isCaptive;
}

/// 三国霸业长按敌方城池时由本地游戏引擎返回的信息快照。
class SgbyEnemyCityInfo {
  const SgbyEnemyCityInfo({
    required this.name,
    required this.rulerName,
    required this.generals,
  });

  factory SgbyEnemyCityInfo.fromJson(Map<String, dynamic> json) {
    final rawGenerals = json['generals'];
    return SgbyEnemyCityInfo(
      name: json['name'] as String? ?? '未知城池',
      rulerName: json['rulerName'] as String? ?? '未知势力',
      generals: rawGenerals is List
          ? rawGenerals
                .whereType<Map>()
                .map(
                  (value) => SgbyEnemyCityGeneralInfo.fromJson(
                    Map<String, dynamic>.from(value),
                  ),
                )
                .toList(growable: false)
          : const <SgbyEnemyCityGeneralInfo>[],
    );
  }

  final String name;
  final String rulerName;
  final List<SgbyEnemyCityGeneralInfo> generals;
}

/// 单座城池一次搜索中发现的人物和物品。
class SgbySearchCityRecord {
  const SgbySearchCityRecord({
    required this.cityName,
    required this.people,
    required this.tools,
    required this.recruited,
    required this.executed,
    required this.exiled,
  });

  factory SgbySearchCityRecord.fromJson(Map<String, dynamic> json) {
    List<String> strings(String key) {
      final value = json[key];
      return value is List
          ? value.whereType<String>().toList(growable: false)
          : const <String>[];
    }

    return SgbySearchCityRecord(
      cityName: json['cityName'] as String? ?? '未知城池',
      people: strings('people'),
      tools: strings('tools'),
      recruited: strings('recruited'),
      executed: strings('executed'),
      exiled: strings('exiled'),
    );
  }

  final String cityName;
  final List<String> people;
  final List<String> tools;
  final List<String> recruited;
  final List<String> executed;
  final List<String> exiled;
}

/// 三国霸业搜索记录对应的战斗方向。
enum SgbyBattleDirection {
  playerAttack,
  playerDefence,
  auto;

  static SgbyBattleDirection? fromWireValue(String? value) {
    for (final direction in values) {
      if (direction.name == value) return direction;
    }
    return null;
  }
}

/// 战斗开始时保存的来源快照。
///
/// 城池归属会在结算时改变，因此 UI 只展示引擎在 `enterBattle` 阶段记录的双方主公和
/// 战斗城市，不根据当前存档状态二次推断，避免胜利占城后把防守主公显示成我方。
class SgbySearchBattleSource {
  const SgbySearchBattleSource({
    required this.direction,
    required this.cityName,
    required this.attackerRulerName,
    required this.defenderRulerName,
  });

  factory SgbySearchBattleSource.fromJson(Map<String, dynamic> json) {
    final rawDirection = json['direction'];
    final direction = SgbyBattleDirection.fromWireValue(
      rawDirection is String ? rawDirection : null,
    );
    if (direction == null) {
      throw const FormatException('无效的战斗来源方向');
    }
    String readString(String key, String fallback) {
      final value = json[key];
      return value is String && value.isNotEmpty ? value : fallback;
    }

    return SgbySearchBattleSource(
      direction: direction,
      cityName: readString('cityName', '未知城池'),
      attackerRulerName: readString('attackerRulerName', '未知主公'),
      defenderRulerName: readString('defenderRulerName', '未知主公'),
    );
  }

  final SgbyBattleDirection direction;
  final String cityName;
  final String attackerRulerName;
  final String defenderRulerName;
}

/// 三国霸业单次搜索历史记录。
class SgbySearchHistoryRecord {
  const SgbySearchHistoryRecord({
    required this.realTime,
    required this.gameTime,
    required this.source,
    required this.peopleCount,
    required this.toolCount,
    required this.recruitedCount,
    required this.executedCount,
    required this.exiledCount,
    required this.cities,
    this.battleSource,
  });

  factory SgbySearchHistoryRecord.fromJson(Map<String, dynamic> json) {
    final rawCities = json['cities'];
    final rawBattleSource = json['battle'];
    SgbySearchBattleSource? battleSource;
    if (rawBattleSource is Map) {
      try {
        battleSource = SgbySearchBattleSource.fromJson(
          Map<String, dynamic>.from(rawBattleSource),
        );
      } on FormatException {
        // 旧版本或损坏的可选来源不应阻断整份搜索历史展示。
      }
    }
    return SgbySearchHistoryRecord(
      realTime: json['realTime'] as String? ?? '未知时间',
      gameTime: json['gameTime'] as String? ?? '未知年月',
      source: json['source'] as String? ?? '搜索',
      peopleCount: (json['peopleCount'] as num?)?.toInt() ?? 0,
      toolCount: (json['toolCount'] as num?)?.toInt() ?? 0,
      recruitedCount: (json['recruitedCount'] as num?)?.toInt() ?? 0,
      executedCount: (json['executedCount'] as num?)?.toInt() ?? 0,
      exiledCount: (json['exiledCount'] as num?)?.toInt() ?? 0,
      battleSource: battleSource,
      cities: rawCities is List
          ? rawCities
                .whereType<Map>()
                .map(
                  (value) => SgbySearchCityRecord.fromJson(
                    Map<String, dynamic>.from(value),
                  ),
                )
                .toList(growable: false)
          : const <SgbySearchCityRecord>[],
    );
  }

  final String realTime;
  final String gameTime;
  final String source;
  final int peopleCount;
  final int toolCount;
  final int recruitedCount;
  final int executedCount;
  final int exiledCount;
  final List<SgbySearchCityRecord> cities;
  final SgbySearchBattleSource? battleSource;
}

/// 搜索历史查询结果。
class SgbySearchHistoryData {
  const SgbySearchHistoryData({required this.isSuccess, required this.records});

  factory SgbySearchHistoryData.fromJson(Map<String, dynamic> json) {
    final rawRecords = json['records'];
    return SgbySearchHistoryData(
      isSuccess: json['ok'] == true,
      records: rawRecords is List
          ? rawRecords
                .whereType<Map>()
                .map(
                  (value) => SgbySearchHistoryRecord.fromJson(
                    Map<String, dynamic>.from(value),
                  ),
                )
                .toList(growable: false)
          : const <SgbySearchHistoryRecord>[],
    );
  }

  final bool isSuccess;
  final List<SgbySearchHistoryRecord> records;
}

/// 单个游戏页面的运行状态和桥接逻辑。
class GameViewModel extends ChangeNotifier {
  GameViewModel({
    required this.game,
    required AppSettings initialSettings,
    required GameSaveRepository saveRepository,
    required LocalGameServer localGameServer,
    required VoidCallback onExitRequested,
    required ValueChanged<SgbyEnemyCityInfo> onEnemyCityRequested,
    required ValueChanged<CheatResult> onNoticeRequested,
  }) : _initialSettings = initialSettings,
       _fmjHighDefinition = initialSettings.fmjHighDefinition,
       _sgbyWorldActivity = initialSettings.sgbyWorldActivity,
       _saveRepository = saveRepository,
       _localGameServer = localGameServer,
       _onExitRequested = onExitRequested,
       _onEnemyCityRequested = onEnemyCityRequested,
       _onNoticeRequested = onNoticeRequested;

  final GameDefinition game;
  final AppSettings _initialSettings;
  final GameSaveRepository _saveRepository;
  final LocalGameServer _localGameServer;
  final VoidCallback _onExitRequested;
  final ValueChanged<SgbyEnemyCityInfo> _onEnemyCityRequested;
  final ValueChanged<CheatResult> _onNoticeRequested;
  final GameControllerService _controllerService = GameControllerService();

  WebViewController? _webViewController;
  int _progress = 0;
  bool _isReady = false;
  bool _fmjHighDefinition;
  int _sgbyWorldActivity;
  int _sgbyBattleSpeedMultiplier = 2;
  bool _sgbyAutoBattleEnabled = false;
  bool _sgbyAutoEndTurnEnabled = false;
  Object? _error;

  WebViewController? get webViewController => _webViewController;
  int get progress => _progress;
  bool get isReady => _isReady;
  int get sgbyBattleSpeedMultiplier => _sgbyBattleSpeedMultiplier;
  bool get sgbyAutoBattleEnabled => _sgbyAutoBattleEnabled;
  bool get sgbyAutoEndTurnEnabled => _sgbyAutoEndTurnEnabled;
  Object? get error => _error;

  Future<void> initialize() async {
    _error = null;
    _isReady = false;
    _progress = 0;
    notifyListeners();

    if (game.id == GameId.sgby) {
      final edition = _initialSettings.sgbyEdition;
      await _saveRepository.updateEntries(GameId.sgby, <String, String>{
        'baye/libpath': edition.assetPath,
        'baye/libname': edition.title,
        'baye/resolution': '0',
      });
    }

    final controller = WebViewController();
    await controller.setJavaScriptMode(JavaScriptMode.unrestricted);
    await controller.setBackgroundColor(const Color(0xFF000000));
    await controller.addJavaScriptChannel(
      'BbkSaveChannel',
      onMessageReceived: _onSaveMessage,
    );
    await controller.addJavaScriptChannel(
      'BbkSystemChannel',
      onMessageReceived: _onSystemMessage,
    );
    await controller.setNavigationDelegate(
      NavigationDelegate(
        onProgress: (progress) {
          _progress = progress;
          notifyListeners();
        },
        onPageFinished: (_) {
          _progress = 100;
          notifyListeners();
        },
        onWebResourceError: (resourceError) {
          if (resourceError.isForMainFrame ?? true) {
            _error = StateError(resourceError.description);
            notifyListeners();
          }
        },
        onNavigationRequest: (request) {
          return _localGameServer.isLocalUrl(request.url)
              ? NavigationDecision.navigate
              : NavigationDecision.prevent;
        },
      ),
    );
    _webViewController = controller;
    _controllerService.start(sendInput);
    notifyListeners();
    await controller.loadRequest(_localGameServer.entryUri(game));
  }

  Future<void> reload() async {
    final controller = _webViewController;
    if (controller == null) {
      await initialize();
      return;
    }
    _error = null;
    _isReady = false;
    notifyListeners();
    await controller.reload();
  }

  void sendInput(GameInput input) {
    final controller = _webViewController;
    if (!_isReady || controller == null) return;
    if (input == GameInput.autoBattle) {
      unawaited(_toggleSgbyAutoBattle());
      return;
    }
    if (input == GameInput.autoEndTurn) {
      unawaited(_toggleSgbyAutoEndTurn());
      return;
    }
    if (input == GameInput.quickExpedition) {
      unawaited(_startSgbyQuickExpedition());
      return;
    }
    final wireValue = jsonEncode(input.name);
    if (input == GameInput.toggleBattleSpeed) {
      _sgbyBattleSpeedMultiplier = nextSgbyGameSpeedMultiplier(
        _sgbyBattleSpeedMultiplier,
      );
      notifyListeners();
    }
    unawaited(
      controller
          .runJavaScript(
            'window.bbkSendInput && window.bbkSendInput($wireValue);',
          )
          .catchError((_) {}),
    );
  }

  /// 切换自动战斗，并以增强脚本返回的持久化状态校准按钮。
  ///
  /// UI 先显示用户期望的状态以保证点击反馈及时；如果 WebView 已离开游戏、脚本拒绝
  /// 操作或页面恰好被销毁，则恢复旧值并通过页面顶部提示失败。所有状态更新都发生在
  /// Flutter 主 isolate，避免后台回调直接刷新界面。
  Future<void> _toggleSgbyAutoBattle() async {
    final controller = _webViewController;
    if (game.id != GameId.sgby || !_isReady || controller == null) return;
    final previous = _sgbyAutoBattleEnabled;
    _sgbyAutoBattleEnabled = !previous;
    notifyListeners();
    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkSendInput ? window.bbkSendInput("autoBattle") : '
        'JSON.stringify({ok:false,message:"自动战斗模块尚未加载"});',
      );
      final decoded = _decodeJavaScriptResult(result);
      if (decoded is! Map || decoded['ok'] != true) {
        _sgbyAutoBattleEnabled = previous;
        notifyListeners();
        _onNoticeRequested(
          CheatResult(
            isSuccess: false,
            message: decoded is Map && decoded['message'] is String
                ? decoded['message'] as String
                : '无法切换自动战斗',
          ),
        );
        return;
      }
      final state = await getCheatState();
      final actual = state['autoBattle'];
      if (actual != null && actual != _sgbyAutoBattleEnabled) {
        _sgbyAutoBattleEnabled = actual;
        notifyListeners();
      }
    } on Object {
      _sgbyAutoBattleEnabled = previous;
      notifyListeners();
      _onNoticeRequested(
        const CheatResult(isSuccess: false, message: '无法切换自动战斗'),
      );
    }
  }

  /// 切换战略地图连续自动结束策略，并以增强脚本返回值校准按钮状态。
  ///
  /// 脚本只允许在战略地图开启；战斗期间保留开关状态并暂停推进，战斗结束回到主地图
  /// 后继续自动结束策略。Flutter 同时监听 `sgby_control_state`，确保按钮状态与脚本一致。
  Future<void> _toggleSgbyAutoEndTurn() async {
    final controller = _webViewController;
    if (game.id != GameId.sgby || !_isReady || controller == null) return;
    final previous = _sgbyAutoEndTurnEnabled;
    _sgbyAutoEndTurnEnabled = !previous;
    notifyListeners();
    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkSendInput ? window.bbkSendInput("autoEndTurn") : '
        'JSON.stringify({ok:false,message:"自动策略模块尚未加载"});',
      );
      final decoded = _decodeJavaScriptResult(result);
      if (decoded is! Map || decoded['ok'] != true) {
        _sgbyAutoEndTurnEnabled = previous;
        notifyListeners();
        _onNoticeRequested(
          CheatResult(
            isSuccess: false,
            message: decoded is Map && decoded['message'] is String
                ? decoded['message'] as String
                : '无法切换自动策略结束',
          ),
        );
        return;
      }
      final state = await getCheatState();
      final actual = state['autoEndTurn'];
      if (actual != null && actual != _sgbyAutoEndTurnEnabled) {
        _sgbyAutoEndTurnEnabled = actual;
        notifyListeners();
      }
    } on Object {
      _sgbyAutoEndTurnEnabled = previous;
      notifyListeners();
      _onNoticeRequested(
        const CheatResult(isSuccess: false, message: '无法切换自动策略结束'),
      );
    }
  }

  /// 从战略地图当前我方城市启动一键出征，并展示脚本返回的明确结果。
  Future<void> _startSgbyQuickExpedition() async {
    final controller = _webViewController;
    if (game.id != GameId.sgby || !_isReady || controller == null) return;
    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkSendInput ? window.bbkSendInput("quickExpedition") : '
        'JSON.stringify({ok:false,message:"一键出征模块尚未加载"});',
      );
      final decoded = _decodeJavaScriptResult(result);
      _onNoticeRequested(
        CheatResult(
          isSuccess: decoded is Map && decoded['ok'] == true,
          message: decoded is Map && decoded['message'] is String
              ? decoded['message'] as String
              : '无法启动一键出征',
        ),
      );
    } on Object {
      _onNoticeRequested(
        const CheatResult(isSuccess: false, message: '无法启动一键出征'),
      );
    }
  }

  /// 切换伏魔记的显示画质。
  ///
  /// 画质命令只调用本地白名单 JS 接口。页面尚未就绪时先保存目标值，收到 ready
  /// 消息后自动补发，避免初始化竞态导致设置失效。
  Future<void> setFmjHighDefinition(bool enabled) async {
    _fmjHighDefinition = enabled;
    final controller = _webViewController;
    if (game.id != GameId.fmj || !_isReady || controller == null) return;
    try {
      await controller.runJavaScript(
        'window.bbkSetHighDefinition && '
        'window.bbkSetHighDefinition(${enabled ? 'true' : 'false'});',
      );
    } on Object {
      // 高清显示属于可选增强；桥接失败时网页渲染器会保留自身的安全默认值。
    }
  }

  /// 将世界活跃度同步到正在运行的三国霸业引擎。
  ///
  /// 值会先限制到 `0～100` 并保存为待同步状态。页面尚未 ready 时不访问 WebView；
  /// ready 回调会补发最新值，从而规避初始化和设置拖动并发造成的丢失更新。
  Future<void> setSgbyWorldActivity(int value) async {
    _sgbyWorldActivity = value.clamp(0, 100).toInt();
    final controller = _webViewController;
    if (game.id != GameId.sgby || !_isReady || controller == null) return;
    try {
      await controller.runJavaScript(
        'window.bbkSetSgbyWorldActivity && '
        'window.bbkSetSgbyWorldActivity($_sgbyWorldActivity);',
      );
    } on Object {
      // 世界活跃度属于增强能力；桥接失败时引擎保留自身默认值，不影响游戏主循环。
    }
  }

  /// 打开当前游戏原生的存档档位界面。
  ///
  /// Flutter 只调用固定桥接函数，不拼接来自 UI 的任意脚本。真正的档位选择、覆盖确认
  /// 和写入仍由游戏引擎完成，因此不会绕过原游戏的存档限制。
  Future<SaveMenuResult> openSaveMenu() async {
    final controller = _webViewController;
    if (!_isReady || controller == null) {
      return const SaveMenuResult(isSuccess: false, message: '游戏尚未加载完成');
    }

    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkOpenSaveMenu ? window.bbkOpenSaveMenu() : '
        'JSON.stringify({ok:false,message:"当前游戏不支持快捷存档"});',
      );
      final decoded = _decodeJavaScriptResult(result);
      if (decoded is Map) {
        return SaveMenuResult(
          isSuccess: decoded['ok'] == true,
          message: decoded['message'] is String
              ? decoded['message'] as String
              : '请选择存档位置',
        );
      }
      return const SaveMenuResult(isSuccess: false, message: '游戏返回了无效结果');
    } on Object {
      return const SaveMenuResult(isSuccess: false, message: '无法打开存档界面');
    }
  }

  /// 在当前游戏引擎内执行经过白名单限制的作弊操作。
  ///
  /// 具体字段修改由各游戏的本地 JS 适配层完成；Flutter 只传递固定 action，避免
  /// 拼接任意脚本。页面未就绪、尚未开始游戏或脚本异常时返回失败结果而不抛到 UI。
  Future<CheatResult> applyCheat(
    String action, {
    Map<String, Object?> parameters = const <String, Object?>{},
  }) async {
    final controller = _webViewController;
    if (!_isReady || controller == null) {
      return const CheatResult(isSuccess: false, message: '游戏尚未加载完成');
    }

    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkApplyCheat ? '
        'window.bbkApplyCheat(${jsonEncode(action)}, ${jsonEncode(parameters)}) : '
        'JSON.stringify({ok:false,message:"当前游戏不支持此操作"});',
      );
      final decoded = _decodeJavaScriptResult(result);
      if (decoded is Map) {
        return CheatResult(
          isSuccess: decoded['ok'] == true,
          message: decoded['message'] is String
              ? decoded['message'] as String
              : '操作已完成',
        );
      }
      return const CheatResult(isSuccess: false, message: '游戏返回了无效结果');
    } on Object {
      return const CheatResult(isSuccess: false, message: '操作失败，请稍后重试');
    }
  }

  /// 读取三国霸业当前我方武将列表和详细属性。
  Future<SgbyCheatData> getSgbyCheatData() async {
    if (game.id != GameId.sgby) {
      return const SgbyCheatData(
        isSuccess: false,
        message: '当前游戏不是三国霸业',
        maxLevel: 20,
        generals: <SgbyGeneralCheatInfo>[],
      );
    }
    final controller = _webViewController;
    if (!_isReady || controller == null) {
      return const SgbyCheatData(
        isSuccess: false,
        message: '游戏尚未加载完成',
        maxLevel: 20,
        generals: <SgbyGeneralCheatInfo>[],
      );
    }

    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkGetSgbyCheatData ? window.bbkGetSgbyCheatData() : '
        'JSON.stringify({ok:false,message:"当前版本不支持武将编辑"});',
      );
      final decoded = _decodeJavaScriptResult(result);
      if (decoded is Map) {
        return SgbyCheatData.fromJson(Map<String, dynamic>.from(decoded));
      }
    } on Object {
      // 下方统一返回可展示错误，避免 WebView 异常抛到 UI 线程。
    }
    return const SgbyCheatData(
      isSuccess: false,
      message: '读取武将数据失败，请回到主地图后重试',
      maxLevel: 20,
      generals: <SgbyGeneralCheatInfo>[],
    );
  }

  /// 读取三国霸业本地保存的逐城搜索历史。
  Future<SgbySearchHistoryData> getSgbySearchHistory() async {
    final controller = _webViewController;
    if (game.id != GameId.sgby || !_isReady || controller == null) {
      return const SgbySearchHistoryData(
        isSuccess: false,
        records: <SgbySearchHistoryRecord>[],
      );
    }
    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkGetSgbySearchHistory ? '
        'window.bbkGetSgbySearchHistory() : '
        'JSON.stringify({ok:false,records:[]});',
      );
      final decoded = _decodeJavaScriptResult(result);
      if (decoded is Map) {
        return SgbySearchHistoryData.fromJson(
          Map<String, dynamic>.from(decoded),
        );
      }
    } on Object {
      // WebView 页面切换时返回空结果，历史面板可通过刷新重试。
    }
    return const SgbySearchHistoryData(
      isSuccess: false,
      records: <SgbySearchHistoryRecord>[],
    );
  }

  /// 获取当前引擎内可持续生效的作弊状态。
  Future<Map<String, bool>> getCheatState() async {
    final controller = _webViewController;
    if (!_isReady || controller == null) return const <String, bool>{};
    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkGetCheatState ? window.bbkGetCheatState() : "{}";',
      );
      final decoded = _decodeJavaScriptResult(result);
      if (decoded is Map) {
        return <String, bool>{
          for (final entry in decoded.entries)
            if (entry.key is String && entry.value is bool)
              entry.key as String: entry.value as bool,
        };
      }
    } on Object {
      // 状态展示属于辅助能力，读取失败不影响游戏和其他作弊操作。
    }
    return const <String, bool>{};
  }

  /// 读取伏魔记的灯洞进度、当前完整地图和玩家位置。
  Future<FmjExplorationState?> getExplorationState() async {
    if (game.id != GameId.fmj) return null;
    final controller = _webViewController;
    if (!_isReady || controller == null) return null;
    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkGetExplorationState ? window.bbkGetExplorationState() : "{}";',
      );
      final decoded = _decodeJavaScriptResult(result);
      if (decoded is Map) {
        return FmjExplorationState.fromJson(Map<String, dynamic>.from(decoded));
      }
    } on Object {
      // 场景切换时地图对象可能短暂为空，由面板刷新按钮重试。
    }
    return null;
  }

  Future<void> captureSaves() async {
    final controller = _webViewController;
    if (!_isReady || controller == null) return;
    try {
      final result = await controller.runJavaScriptReturningResult(
        'window.bbkExportState ? window.bbkExportState() : "{}";',
      );
      final entries = _decodeEntries(result);
      if (entries.isNotEmpty) {
        await _saveRepository.updateEntries(game.id, entries);
      }
    } on Object {
      // 页面关闭和 WebView 销毁可能同时发生；实时存档桥已覆盖正常保存路径。
    }
  }

  void _onSaveMessage(JavaScriptMessage message) {
    try {
      final decoded = jsonDecode(message.message);
      if (decoded is! Map) return;
      final entries = _stringEntries(decoded['entries']);
      if (entries.isNotEmpty) {
        unawaited(_saveRepository.updateEntries(game.id, entries));
      }
    } on Object catch (error) {
      _error = error;
      notifyListeners();
    }
  }

  void _onSystemMessage(JavaScriptMessage message) {
    if (message.message == 'ready') {
      _isReady = true;
      _error = null;
      notifyListeners();
      unawaited(setFmjHighDefinition(_fmjHighDefinition));
      unawaited(setSgbyWorldActivity(_sgbyWorldActivity));
      unawaited(_restoreSgbyControlState());
    } else if (message.message == 'exit') {
      _onExitRequested();
    } else {
      try {
        final decoded = jsonDecode(message.message);
        if (decoded is! Map) return;
        final type = decoded['type'];
        final data = decoded['data'];
        if (type == 'sgby_enemy_city' && data is Map) {
          _onEnemyCityRequested(
            SgbyEnemyCityInfo.fromJson(Map<String, dynamic>.from(data)),
          );
        } else if (type == 'sgby_notice' && data is Map) {
          _onNoticeRequested(
            CheatResult(
              isSuccess: data['ok'] == true,
              message: data['message'] as String? ?? '自动处理已完成',
            ),
          );
        } else if (type == 'sgby_control_state' && data is Map) {
          final autoEndTurn = data['autoEndTurn'];
          if (autoEndTurn is bool && autoEndTurn != _sgbyAutoEndTurnEnabled) {
            _sgbyAutoEndTurnEnabled = autoEndTurn;
            notifyListeners();
          }
        }
      } on FormatException {
        // 游戏可能发送未来版本的普通文本消息；无法识别时静默忽略。
      } on Object {
        // 敌城详情属于辅助展示，解析失败不影响游戏主循环。
      }
    }
  }

  /// 页面就绪后同步三国霸业持久化的速度倍率和自动战斗开关。
  Future<void> _restoreSgbyControlState() async {
    if (game.id != GameId.sgby) return;
    final state = await getCheatState();
    final restoredSpeed = state['battleSpeed8x'] == true
        ? 8
        : state['battleSpeed6x'] == true
        ? 6
        : state['battleSpeed4x'] == true
        ? 4
        : state['battleSpeed3x'] == true
        ? 3
        : state['battleSpeed2x'] == true
        ? 2
        : 1;
    final restoredAutoBattle = state['autoBattle'] == true;
    final restoredAutoEndTurn = state['autoEndTurn'] == true;
    if (restoredSpeed == _sgbyBattleSpeedMultiplier &&
        restoredAutoBattle == _sgbyAutoBattleEnabled &&
        restoredAutoEndTurn == _sgbyAutoEndTurnEnabled) {
      return;
    }
    _sgbyBattleSpeedMultiplier = restoredSpeed;
    _sgbyAutoBattleEnabled = restoredAutoBattle;
    _sgbyAutoEndTurnEnabled = restoredAutoEndTurn;
    notifyListeners();
  }

  Map<String, String> _decodeEntries(Object result) {
    return _stringEntries(_decodeJavaScriptResult(result));
  }

  Object? _decodeJavaScriptResult(Object result) {
    Object? decoded = result;
    for (var attempt = 0; attempt < 2 && decoded is String; attempt++) {
      try {
        decoded = jsonDecode(decoded);
      } on FormatException {
        break;
      }
    }
    return decoded;
  }

  Map<String, String> _stringEntries(Object? value) {
    final entries = <String, String>{};
    if (value is Map) {
      for (final entry in value.entries) {
        if (entry.key is String && entry.value is String) {
          entries[entry.key as String] = entry.value as String;
        }
      }
    }
    return entries;
  }

  @override
  void dispose() {
    unawaited(_controllerService.dispose());
    super.dispose();
  }
}
