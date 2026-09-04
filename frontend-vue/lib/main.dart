import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'services/language_service.dart';
import 'user/homepages.dart';
import 'user/bus_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LanguageService.load();
  BusController.instance.start();

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'MFU Shuttle Bus',
      theme: ThemeData(
        useMaterial3: false,
        scaffoldBackgroundColor: Colors.white,
      ),
      home: const _WebMobileShell(child: Homepages()),
    );
  }
}

class _WebMobileShell extends StatelessWidget {
  const _WebMobileShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) {
      return child;
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF2F4F7),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: DecoratedBox(
              decoration: const BoxDecoration(
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Color(0x1F000000),
                    blurRadius: 24,
                    offset: Offset(0, 12),
                  ),
                ],
              ),
              child: ClipRect(child: child),
            ),
          ),
        ),
      ),
    );
  }
}
