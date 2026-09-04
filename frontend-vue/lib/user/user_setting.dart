import 'package:flutter/material.dart';
import '../services/language_service.dart';
import 'bus_station.dart';
import 'favorite_station.dart';
import 'report_page.dart';

class UserSetting extends StatefulWidget {
  const UserSetting({super.key});

  @override
  State<UserSetting> createState() => _UserSettingState();
}

class _UserSettingState extends State<UserSetting> {
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: LanguageService.notifier,
      builder: (context, selectedLanguage, _) {
        String text({required String en, required String th}) {
          return selectedLanguage == LanguageService.thai ? th : en;
        }

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
                      right: 16,
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: RichText(
                          text: const TextSpan(
                            children: [
                              TextSpan(
                                text: 'MFU ',
                                style: TextStyle(
                                  color: Color(0xFFD2232A),
                                  fontWeight: FontWeight.w900,
                                  fontSize: 16,
                                ),
                              ),
                              TextSpan(
                                text: 'SHUTTLE BUS',
                                style: TextStyle(
                                  color: Color(0xFFBC9945),
                                  fontWeight: FontWeight.w900,
                                  fontSize: 16,
                                ),
                              ),
                            ],
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
          body: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  children: [
                    _sectionTitle(text(en: 'Transit', th: 'การเดินทาง')),
                    _settingTile(
                      icon: Icons.directions_bus,
                      title: text(en: 'MFU Transit', th: 'รถรับส่ง มฟล.'),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const BusStationPage(),
                          ),
                        );
                      },
                    ),
                    _settingTile(
                      icon: Icons.favorite_border,
                      title: text(en: 'Favorite Stations', th: 'สถานีโปรด'),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const FavoriteStationPage(),
                          ),
                        );
                      },
                    ),
                    _sectionTitle(text(en: 'Support', th: 'ช่วยเหลือ')),
                    _settingTile(
                      icon: Icons.help_outline,
                      title: text(
                        en: 'Help & Feedback',
                        th: 'ช่วยเหลือและข้อเสนอแนะ',
                      ),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const ReportPage(),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
              const SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: Text(
                    'Version 1.0.0',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.black45,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          color: Colors.black,
          fontSize: 13,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }

  Widget _settingTile({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: Colors.grey.shade200,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Icon(icon, color: const Color(0xFFD2232A)),
      ),
      title: Text(
        title,
        style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 16),
      ),
      trailing: const Icon(
        Icons.arrow_forward_ios,
        size: 16,
        color: Color(0xFFD2232A),
      ),
      onTap: onTap,
    );
  }
}
