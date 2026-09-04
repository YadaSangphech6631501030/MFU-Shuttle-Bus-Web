import 'package:flutter/material.dart';
import 'homepages.dart';

class Signin01 extends StatefulWidget {
  const Signin01({super.key});

  @override
  State<Signin01> createState() => _Signin01State();
}

class _Signin01State extends State<Signin01>
    with SingleTickerProviderStateMixin {
  late final AnimationController _loadingController;

  @override
  void initState() {
    super.initState();
    _loadingController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat();

    Future.delayed(const Duration(milliseconds: 1000), () {
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => const Homepages()),
      );
    });
  }

  @override
  void dispose() {
    _loadingController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xffffffff),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Align(
            alignment: const Alignment(0, -0.2),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Image.asset('assets/bus.png', height: 120), // bus image
                const SizedBox(height: 20),
                const Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: 'MFU ',
                        style: TextStyle(color: Color(0xFFD2232A)),
                      ),
                      TextSpan(
                        text: 'SHUTTLE BUS',
                        style: TextStyle(color: Color(0xFFBC9945)),
                      ),
                    ],
                  ),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0,
                  ),
                ),
                const SizedBox(height: 10),
                RotationTransition(
                  turns: _loadingController,
                  child: const Icon(
                    Icons.restart_alt,
                    color: Colors.black,
                    size: 30,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'loading...',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xff1f2937),
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
