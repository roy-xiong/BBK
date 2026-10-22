import 'dart:math' as math;

import '../../domain/models/game_report.dart';
import '../../domain/models/game_world.dart';
import '../../domain/use_cases/strategy_commands.dart';
import 'native_game_session.dart';

/// 原版城市命令的输入阶段。选择器均在原画布内，不依赖异步Material对话框。
///
/// 回调只由会话拥有，取消、退出与销毁会清理当前提示。每次选择后重新从世界
/// 读取人物和城市，避免多个指令连续下达后继续使用过期队列快照。
final class StrategyCommandFlow {
  StrategyCommandFlow(this.session, this.cityIndex, this.command)
    : commands = StrategyCommands(session.resources);
  final NativeGameSession session;
  final int cityIndex;
  final int command;
  final StrategyCommands commands;
  GameWorld? get _world => session.world;
  String _s(int id) => session.resources.text(64, id);

  void start({bool quickExpedition = false}) {
    if (session.isDisposed || _world == null) return;
    if (command == 18) {
      session.showStrategy();
      return;
    }
    if (command == 27) {
      _expedition(quick: quickExpedition);
      return;
    }
    if (command == 6) {
      _captive();
      return;
    }
    if (command == 9) {
      _tool();
      return;
    }
    if (command == 14) {
      _moveDestination();
      return;
    }
    _actor();
  }

  void _error(String text, {void Function()? retry}) {
    session.showStrategy();
    session.displayReports([
      GameReport(text),
    ], completed: retry ?? session.showStrategy);
  }

  List<int> _ownedPeople() {
    final world = _world;
    final city = world?.city(cityIndex);
    return world == null || city == null
        ? []
        : world.personsInCity(cityIndex, belong: city.belong);
  }

  /// 当前增强版自动选择不超过5000粮草，一键出征只选城内第一名武将。
  void _expedition({bool quick = false}) {
    final world = _world, city = _world?.city(cityIndex);
    if (world == null || city == null) return;
    final available = _ownedPeople();
    if (available.isEmpty) {
      _error(_s(84));
      return;
    }
    if (city.food <= 0) {
      _error('粮草不足');
      return;
    }
    if (city.money < commands.moneyCost(27)) {
      _error(_s(59));
      return;
    }
    final selected = <int>[];
    void destination() {
      if (selected.isEmpty) {
        session.showStrategy();
        return;
      }
      session.chooseCity((target) {
        if (target == null) {
          session.showStrategy();
          return;
        }
        final result = commands.expedition(
          world,
          cityIndex,
          target,
          selected,
          math.min(5000, world.city(cityIndex)!.food),
          attackAnyCity: session.options.enabled('attackAnyCity'),
        );
        if (!result.success) {
          _error(result.message, retry: destination);
          return;
        }
        session.showStrategy();
        session.displayReports([
          GameReport('部队已出征'),
        ], completed: session.showStrategy);
      });
    }

    void choose() {
      final people = _ownedPeople()
          .where((id) => !selected.contains(id))
          .toList();
      if (people.isEmpty || selected.length >= 10) {
        destination();
        return;
      }
      session.choosePeople(people, (id) {
        if (id == null) {
          destination();
        } else {
          selected.add(id);
          choose();
        }
      });
    }

    if (quick) {
      selected.add(available.first);
      destination();
    } else {
      choose();
    }
  }

  void _actor({int? target, int? slot}) {
    final world = _world;
    if (world == null) return;
    final people = command == 7
        ? world.personsInCity(cityIndex, belong: 65535)
        : command == 8
        ? [..._ownedPeople(), ...world.personsInCity(cityIndex, belong: 65535)]
        : _ownedPeople();
    if (people.isEmpty) {
      _error(_s(command == 7 ? 88 : 84));
      return;
    }
    session.choosePeople(people, (person) {
      if (person == null) {
        session.showStrategy();
        return;
      }
      if ([7, 8, 12, 1, 2, 3, 4, 5, 26].contains(command) ||
          command == 6 ||
          command == 9 ||
          command == 14) {
        _submit(
          StrategyAction(
            command: command,
            city: cityIndex,
            person: person,
            target: target,
            slot: slot,
          ),
        );
      } else if (command == 10) {
        _equipment(person);
      } else if (command == 11) {
        _exchange(person);
      } else if (command == 13) {
        _transport(person);
      } else if ([15, 16, 17, 19].contains(command)) {
        _enemy(person);
      } else if (command == 23) {
        session.chooseCity((city) {
          if (city == null) {
            _actor();
            return;
          }
          _submit(
            StrategyAction(
              command: command,
              city: cityIndex,
              person: person,
              target: city,
            ),
          );
        });
      } else if (command == 24 || command == 25) {
        _soldiers(person);
      }
    });
  }

  void _submit(StrategyAction action) {
    final world = _world;
    if (world == null || session.isDisposed) return;
    final result = commands.make(world, action);
    if (!result.success) {
      _error(result.message, retry: start);
      return;
    }
    session.showStrategy();
    final reports = <GameReport>[
      for (final text in result.reports)
        GameReport(text, person: action.person),
      if (result.message.isNotEmpty)
        GameReport(result.message, person: action.person),
    ];
    void finish() {
      if ([1, 2, 3, 4, 5, 6, 9, 10, 12, 14, 24, 25].contains(command)) {
        start();
      } else {
        session.showStrategy();
      }
    }

    session.displayReports(reports, completed: finish);
  }

  void _captive() {
    final world = _world;
    if (world == null) return;
    final ids = world.personsInCity(cityIndex, belong: 65535);
    if (ids.isEmpty) {
      _error(_s(88));
      return;
    }
    session.choosePeople(ids, (target) {
      if (target == null) {
        session.showStrategy();
        return;
      }
      _actor(target: target);
    });
  }

  void _tool() {
    final world = _world;
    if (world == null) return;
    final goods = world
        .goodsInCity(cityIndex, discoveredOnly: true)
        .map((e) => e & 0x7fff)
        .toList();
    if (goods.isEmpty) {
      _error(_s(86));
      return;
    }
    session.chooseTools(goods, (index) {
      if (index == null) {
        session.showStrategy();
        return;
      }
      _actor(target: goods[index]);
    });
  }

  void _equipment(int personIndex) {
    final person = _world?.person(personIndex);
    if (person == null) return;
    final slots = <int>[if (person.equip0 > 0) 0, if (person.equip1 > 0) 1];
    if (slots.isEmpty) {
      _error(_s(85), retry: start);
      return;
    }
    session.chooseTools(
      [
        for (final slot in slots)
          (slot == 0 ? person.equip0 : person.equip1) - 1,
      ],
      (index) {
        if (index == null) {
          _actor();
          return;
        }
        _submit(
          StrategyAction(
            command: command,
            city: cityIndex,
            person: personIndex,
            slot: slots[index],
          ),
        );
      },
    );
  }

  void _moveDestination() {
    session.chooseCity((target) {
      if (target == null) {
        session.showStrategy();
        return;
      }
      final world = _world;
      if (world == null) return;
      if (world.city(target)?.belong != world.city(cityIndex)?.belong ||
          commands.distance(world, cityIndex, target) == null) {
        _error(_s(55), retry: _moveDestination);
        return;
      }
      _actor(target: target);
    });
  }

  void _exchange(int person) {
    final options = session.resources.text(64, 46);
    session.chooseOptions([options.substring(0, 2), options.substring(2, 4)], (
      choice,
    ) {
      if (choice == null) {
        _actor();
        return;
      }
      final city = _world?.city(cityIndex);
      if (city == null) return;
      final maximum = choice == 0 ? city.money ~/ 5 : city.food;
      if (maximum < 1) {
        _error(_s(choice == 0 ? 59 : 57), retry: () => _exchange(person));
        return;
      }
      session.chooseNumber(_s(41), 1, maximum, (value) {
        if (value == null) {
          _exchange(person);
          return;
        }
        _submit(
          StrategyAction(
            command: command,
            city: cityIndex,
            person: person,
            amount: value,
            slot: choice,
          ),
        );
      });
    });
  }

  void _transport(
    int person, {
    int stage = 0,
    int food = 0,
    int money = 0,
    int arms = 0,
  }) {
    final city = _world?.city(cityIndex);
    if (city == null) return;
    if (stage < 3) {
      session.chooseNumber(
        _s(41 + stage),
        0,
        [city.food, city.money, city.mothballArms][stage],
        (value) {
          if (value == null) {
            if (stage == 0) {
              _actor();
            } else {
              _transport(
                person,
                stage: stage - 1,
                food: food,
                money: money,
                arms: arms,
              );
            }
            return;
          }
          _transport(
            person,
            stage: stage + 1,
            food: stage == 0 ? value : food,
            money: stage == 1 ? value : money,
            arms: stage == 2 ? value : arms,
          );
        },
      );
    } else {
      session.chooseCity((target) {
        if (target == null) {
          _transport(person, stage: 2, food: food, money: money, arms: arms);
          return;
        }
        _submit(
          StrategyAction(
            command: command,
            city: cityIndex,
            person: person,
            target: target,
            food: food,
            money: money,
            arms: arms,
          ),
        );
      });
    }
  }

  void _soldiers(int personIndex) {
    final world = _world;
    final city = world?.city(cityIndex);
    final person = world?.person(personIndex);
    if (world == null || city == null || person == null) return;
    final maximum = command == 24
        ? math.min(
            city.peopleDevotion * session.resources.rule('armsPerDevotion', 20),
            math.min(
              city.money * session.resources.rule('armsPerMoney', 10),
              65534,
            ),
          )
        : math.min(
            commands.maximumArms(person),
            city.mothballArms + person.arms,
          );
    if (maximum == 0) {
      _error(_s(57), retry: start);
      return;
    }
    session.chooseNumber(_s(43), 0, maximum, (value) {
      if (value == null) {
        _actor();
        return;
      }
      _submit(
        StrategyAction(
          command: command,
          city: cityIndex,
          person: personIndex,
          amount: value,
        ),
      );
    });
  }

  void _enemy(int person) {
    final world = _world;
    if (world == null) return;
    final ids = <int>[];
    final ruler = world.playerRulerIndex;
    for (var i = 0; i < world.cities.length; i++) {
      final city = world.city(i)!;
      if (city.belong == 0 || city.belong == ruler! + 1) continue;
      if (command == 17) {
        final satrap = city.satrapId - 1;
        if (satrap >= 0 && satrap + 1 != city.belong && !ids.contains(satrap)) {
          ids.add(satrap);
        }
      } else if (command == 19) {
        if (!ids.contains(city.belong - 1)) ids.add(city.belong - 1);
      } else {
        ids.addAll(world.personsInCity(i, belong: city.belong));
      }
    }
    if (ids.isEmpty) {
      _error(_s(84));
      return;
    }
    session.choosePeople(ids, (target) {
      if (target == null) {
        _actor();
        return;
      }
      _submit(
        StrategyAction(
          command: command,
          city: cityIndex,
          person: person,
          target: target,
        ),
      );
    });
  }
}
