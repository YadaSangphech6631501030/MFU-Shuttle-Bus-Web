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
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Homepages(),
    );
  }
}
