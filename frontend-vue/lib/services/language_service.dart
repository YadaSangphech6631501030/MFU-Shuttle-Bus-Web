import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LanguageService {
  static const String languageKey = 'selected_language';
  static const String english = 'English';
  static const String thai = 'ไทย';

  static final ValueNotifier<String> notifier = ValueNotifier<String>(thai);

  static String get currentLanguage => notifier.value;
  static bool get isThai => currentLanguage == thai;

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    notifier.value = prefs.getString(languageKey) ?? thai;
  }

  static Future<void> changeLanguage(String language) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(languageKey, language);
    notifier.value = language;
  }

  static String text({required String en, required String th}) {
    return isThai ? th : en;
  }

  static String _firstText(Map station, List<String> keys) {
    for (final key in keys) {
      final value = station[key]?.toString().trim() ?? '';
      if (value.isNotEmpty) return value;
    }

    return '';
  }

  static String stationName(dynamic station) {
    if (station is Map) {
      final thaiName = _firstText(station, const [
        'nameTH',
        'nameTh',
        'name_th',
        'thaiName',
        'nameThai',
        'th',
      ]);
      final englishName = _firstText(station, const [
        'name',
        'nameEN',
        'nameEn',
        'name_en',
        'englishName',
        'en',
      ]);
      final primaryName = isThai ? thaiName : englishName;
      final fallbackName = isThai ? englishName : thaiName;

      return primaryName.isNotEmpty ? primaryName : fallbackName;
    }

    return station?.toString().trim() ?? '';
  }
}
