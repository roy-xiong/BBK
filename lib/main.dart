import 'package:flutter/widgets.dart';

import 'app.dart';
import 'data/services/windows_webview_platform.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await WindowsGameWebViewPlatform.register();
  runApp(const BbkClassicsApp());
}
