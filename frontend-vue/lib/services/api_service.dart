import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String _configuredBaseUrl = String.fromEnvironment(
    "API_BASE_URL",
  );

  static String get baseUrl {
    if (_configuredBaseUrl.isNotEmpty) {
      return _configuredBaseUrl;
    }

    if (kIsWeb) {
      return "http://localhost:5001";
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return "http://10.0.2.2:5001";
      case TargetPlatform.iOS:
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
      case TargetPlatform.linux:
      case TargetPlatform.fuchsia:
        return "http://localhost:5001";
    }
  }

  static const Duration _requestTimeout = Duration(seconds: 10);

  // ===== COMMON FUNCTION =====
  static dynamic _handleResponse(http.Response res) {
    print("STATUS: ${res.statusCode}");
    print("BODY: ${res.body}");

    try {
      return jsonDecode(res.body);
    } catch (e) {
      return {"error": "Server error (not JSON)"};
    }
  }

  // ================= AUTH =================

  static Future<String?> register(
    String username,
    String password,
    String email,
  ) async {
    try {
      final res = await http.post(
        Uri.parse("$baseUrl/auth/register"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "username": username,
          "password": password,
          "email": email,
        }),
      ).timeout(_requestTimeout);

      final data = _handleResponse(res);

      if (res.statusCode == 200) {
        return null;
      } else {
        return data["error"] ?? "Register failed";
      }
    } catch (e) {
      return "Network error";
    }
  }

  static Future<Map<String, dynamic>?> login(
    String username,
    String password,
  ) async {
    try {
      final res = await http.post(
        Uri.parse("$baseUrl/auth/login"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"username": username, "password": password}),
      ).timeout(_requestTimeout);

      final data = _handleResponse(res);

      if (res.statusCode == 200) {
        if (data["token"] == null ||
            data["role"] == null ||
            data["userId"] == null) {
          return {"error": "Login response missing data"};
        }

        final prefs = await SharedPreferences.getInstance();
        await prefs.setString("token", data["token"].toString());
        await prefs.setString("role", data["role"].toString());
        await prefs.setString("userId", data["userId"].toString());
        return data;
      } else {
        return data;
      }
    } catch (e) {
      print("LOGIN ERROR: $e");
      return {"error": "Network error"};
    }
  }

  static Future<String?> updateProfile(
    String username,
    String email,
    String password,
    String newPassword,
  ) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString("token");

      final res = await http.put(
        Uri.parse("$baseUrl/auth/update"),
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer $token",
        },
        body: jsonEncode({
          "username": username,
          "email": email,
          "password": password,
          "new_password": newPassword,
        }),
      ).timeout(_requestTimeout);

      final data = _handleResponse(res);

      if (res.statusCode == 200) {
        return null;
      } else {
        return data["error"] ?? "Update failed";
      }
    } catch (e) {
      return "Network error";
    }
  }

  static Future<Map<String, dynamic>> getLatest() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString("token");

    final res = await http.get(
      Uri.parse("$baseUrl/auth/user"),
      headers: {"Authorization": "Bearer $token"},
    ).timeout(_requestTimeout);

    final data = _handleResponse(res);

    if (res.statusCode == 200) {
      return data;
    } else {
      throw Exception(data["error"] ?? "Failed to load user");
    }
  }

  // ================= STATION =================

  static Future<List<dynamic>> getStations(String line) async {
    try {
      final res = await http.get(Uri.parse("$baseUrl/station/$line"))
          .timeout(_requestTimeout);

      final data = _handleResponse(res);

      if (res.statusCode == 200) {
        return data;
      } else {
        throw Exception("Failed to load stations");
      }
    } catch (e) {
      throw Exception("Network error");
    }
  }

  // ================= BUS =================

  static Future<List<dynamic>> getBuses() async {
    try {
      final res = await http.get(Uri.parse("$baseUrl/api/buses"))
          .timeout(_requestTimeout);

      final data = _handleResponse(res);

      if (res.statusCode == 200) {
        return data;
      } else {
        throw Exception("Failed to load buses");
      }
    } catch (e) {
      throw Exception("Network error");
    }
  }

  // ================= REPORT =================
  static Future<String?> sendReport(
    String type,
    String detail,
    String location, {
    Map<String, dynamic>? feedbackRatings,
  }) async {
    try {
      final body = <String, dynamic>{
        "type": type,
        "detail": detail,
        "location": location,
      };

      if (feedbackRatings != null) {
        body["feedbackRatings"] = feedbackRatings;
      }

      final res = await http.post(
        Uri.parse("$baseUrl/api/report"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode(body),
      ).timeout(_requestTimeout);

      if (res.statusCode == 201 || res.statusCode == 200) {
        return null;
      }

      return "Send failed";
    } catch (e) {
      return "Network error";
    }
  }

  // get report
  static Future<List<dynamic>> getReports() async {
    try {
      final res = await http.get(Uri.parse("$baseUrl/api/report"))
          .timeout(_requestTimeout);

      final data = _handleResponse(res);

      if (res.statusCode == 200) {
        return data;
      } else {
        throw Exception("Failed to load reports");
      }
    } catch (e) {
      throw Exception("Network error");
    }
  }

  // confirm report
  static Future<void> confirmReport(String id) async {
    final url = Uri.parse("$baseUrl/api/report/$id");

    final res = await http.put(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"status": "done"}),
    ).timeout(_requestTimeout);

    print("STATUS: ${res.statusCode}");
    print("BODY: ${res.body}");

    if (res.statusCode != 200) {
      throw Exception("Failed to update");
    }
  }
}
