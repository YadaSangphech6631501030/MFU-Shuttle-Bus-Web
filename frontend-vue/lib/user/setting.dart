import 'package:flutter/material.dart';
import '../services/language_service.dart';

class Setting extends StatefulWidget {
  const Setting({super.key});

  @override
  State<Setting> createState() => _SettingState();
}

class _SettingState extends State<Setting> {
  void _showLanguageOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) {
        final selectedLanguage = LanguageService.currentLanguage;

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: const Text('English'),
                trailing: selectedLanguage == LanguageService.english
                    ? const Icon(Icons.check, color: Color(0xFFD2232A))
                    : null,
                onTap: () {
                  LanguageService.changeLanguage(LanguageService.english);
                  Navigator.pop(context);
                },
              ),
              ListTile(
                title: const Text('ไทย'),
                trailing: selectedLanguage == LanguageService.thai
                    ? const Icon(Icons.check, color: Color(0xFFD2232A))
                    : null,
                onTap: () {
                  LanguageService.changeLanguage(LanguageService.thai);
                  Navigator.pop(context);
                },
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: LanguageService.notifier,
      builder: (context, selectedLanguage, _) {
        final topPadding = MediaQuery.of(context).padding.top;
        const homeAppBarHeight = 88.0;
        const backButtonSize = 44.0;
        final backButtonTop =
            (topPadding +
                    ((homeAppBarHeight - topPadding - backButtonSize) / 2))
                .clamp(0.0, homeAppBarHeight - backButtonSize);

        return Scaffold(
          backgroundColor: Colors.white,
          appBar: PreferredSize(
            preferredSize: const Size.fromHeight(homeAppBarHeight),
            child: Material(
              color: Colors.white,
              elevation: 0,
              child: Container(
                height: homeAppBarHeight,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(
                    bottom: BorderSide(color: Color(0xFFE0E0E0), width: 1),
                  ),
                ),
                child: Stack(
                  children: [
                    Positioned.fill(
                      top: topPadding,
                      child: Center(
                        child: Text(
                          LanguageService.text(en: 'Settings', th: 'ตั้งค่า'),
                          style: const TextStyle(
                            color: Colors.black,
                            fontSize: 22,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      left: 16,
                      top: backButtonTop,
                      child: SizedBox(
                        width: backButtonSize,
                        height: backButtonSize,
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          icon: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade200,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Icon(
                              Icons.arrow_back_ios_new_rounded,
                              color: Colors.black,
                              size: 18,
                            ),
                          ),
                          onPressed: () {
                            Navigator.pop(context);
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          body: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                InkWell(
                  onTap: _showLanguageOptions,
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Icon(
                          Icons.translate,
                          color: Color(0xFFD2232A),
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          LanguageService.text(en: 'Language', th: 'ภาษา'),
                          style: const TextStyle(
                            color: Colors.black,
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      Text(
                        selectedLanguage,
                        style: const TextStyle(
                          color: Colors.black54,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(
                        Icons.arrow_forward_ios,
                        color: Color(0xFFD2232A),
                        size: 16,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
