import 'dart:async';
import 'dart:math' as math;
import 'package:google_maps_flutter/google_maps_flutter.dart';

class BusController {
  BusController._private();
  static final BusController instance = BusController._private();

  List<dynamic> busData = [];

  Map<String, LatLng> busPositions = {};
  Map<String, double> busProgress = {};
  Map<String, double> busHeadings = {};
  Map<String, String> busSprites = {};
  Map<String, int> busETA = {};
  Map<String, int> stationETA = {};
  Map<String, DateTime?> busWaitUntil = {};
  Map<String, String?> lastStationId = {};

  Timer? moveTimer;

  double speed = 0.3;
  List<LatLng> route = [];

  void start() {
    moveTimer ??= Timer.periodic(const Duration(milliseconds: 100), (_) {
      move();
    });
  }

  // ✅ logic การวิ่ง (ย้ายมาจากหน้า Home)
  void move() {
    if (route.isEmpty || busData.isEmpty) return;

    final now = DateTime.now();

    for (int i = 0; i < busData.length; i++) {
      final id = busData[i]["busNumber"].toString();

      // WAIT
      if (busWaitUntil[id] != null && now.isBefore(busWaitUntil[id]!)) {
        continue;
      }

      double currentProgress = busProgress[id] ?? (i * 20.0);
      double nextProgress = currentProgress + speed;

      // LOOP
      if (nextProgress >= route.length - 1) {
        nextProgress = 0;
      }

      busProgress[id] = nextProgress;

      int idx = nextProgress.floor();
      double t = nextProgress - idx;

      LatLng p1 = route[idx];
      LatLng p2 = route[idx + 1];

      busPositions[id] = LatLng(
        p1.latitude + (p2.latitude - p1.latitude) * t,
        p1.longitude + (p2.longitude - p1.longitude) * t,
      );
      updateBusVisualState(id, route, idx);
    }
  }

  void updateBusVisualState(String id, List<LatLng> routePoints, int index) {
    if (routePoints.length < 2) return;

    final idx = index.clamp(0, routePoints.length - 2).toInt();
    final heading = _bearingBetween(routePoints[idx], routePoints[idx + 1]);
    final previousHeading = busHeadings[id];
    final movementDelta = previousHeading == null
        ? 0.0
        : _normalizeDegrees(heading - previousHeading);
    final routeDelta = _routeTurnDelta(routePoints, idx);
    final turnDelta = routeDelta.abs() > movementDelta.abs()
        ? routeDelta
        : movementDelta;

    busHeadings[id] = heading;
    busSprites[id] = _spriteFor(heading, turnDelta);
  }

  double _bearingBetween(LatLng from, LatLng to) {
    final fromLat = _radians(from.latitude);
    final toLat = _radians(to.latitude);
    final lngDelta = _radians(to.longitude - from.longitude);
    final y = math.sin(lngDelta) * math.cos(toLat);
    final x =
        (math.cos(fromLat) * math.sin(toLat)) -
        (math.sin(fromLat) * math.cos(toLat) * math.cos(lngDelta));

    return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
  }

  double _routeTurnDelta(List<LatLng> routePoints, int index) {
    if (index <= 0 || index >= routePoints.length - 2) return 0;

    final before = _bearingBetween(routePoints[index - 1], routePoints[index]);
    final after = _bearingBetween(routePoints[index], routePoints[index + 1]);
    return _normalizeDegrees(after - before);
  }

  double _normalizeDegrees(double degrees) {
    var normalized = (degrees + 540) % 360 - 180;
    if (normalized == -180) normalized = 180;
    return normalized;
  }

  double _radians(double degrees) => degrees * math.pi / 180;

  String _spriteFor(double heading, double turnDelta) {
    if (turnDelta > 14) return "turnRight";
    if (turnDelta < -14) return "turnLeft";

    if (heading >= 180 && heading < 360) return "left";
    return "right";
  }

  void updateBuses(List<dynamic> data) {
    busData = data;

    for (var bus in data) {
      final id = bus["busNumber"].toString();

      busPositions.putIfAbsent(id, () => const LatLng(0, 0));
      busProgress.putIfAbsent(id, () => 0);
      busSprites.putIfAbsent(id, () => "right");
      busWaitUntil.putIfAbsent(id, () => null);
      lastStationId.putIfAbsent(id, () => null);
    }

    final activeIds = data.map((b) => b["busNumber"].toString()).toSet();

    busPositions.removeWhere((k, _) => !activeIds.contains(k));
    busProgress.removeWhere((k, _) => !activeIds.contains(k));
    busHeadings.removeWhere((k, _) => !activeIds.contains(k));
    busSprites.removeWhere((k, _) => !activeIds.contains(k));
    busWaitUntil.removeWhere((k, _) => !activeIds.contains(k));
    lastStationId.removeWhere((k, _) => !activeIds.contains(k));
  }

  void setRoute(List<LatLng> newRoute) {
    route = newRoute;
  }
}
