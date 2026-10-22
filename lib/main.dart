import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'ui/features/game/views/game_page.dart';
import 'ui/core/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS) {
    await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  }
  runApp(const SgbyApp());
}

/// 单游戏独立应用入口，游戏内部画面由原资源帧缓冲提供。
class SgbyApp extends StatelessWidget {
  const SgbyApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: '三国霸业',
    theme: AppTheme.dark(),
    home: const GamePage(),
  );
}
