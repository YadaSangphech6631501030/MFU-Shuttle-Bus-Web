import 'dart:convert';
import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:latlong2/latlong.dart' as ll;
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shuttle_bus_fronted/services/api_service.dart';
import 'package:shuttle_bus_fronted/services/language_service.dart';
import 'package:shuttle_bus_fronted/services/route_asset_service.dart';
import 'bus_controller.dart';
import 'user_setting.dart';

class Homepages extends StatefulWidget {
  final LatLng? initialMapTarget;
  final double initialMapZoom;

  const Homepages({
    super.key,
    this.initialMapTarget,
    this.initialMapZoom = 16.9,
  });

  @override
  State<Homepages> createState() => _HomepagesState();
}

class _HomepagesState extends State<Homepages> {
  static const String _favoriteStationsKey = 'favorite_stations';
  static const LatLng _mSquareStationCenter = LatLng(
    20.045780781087203,
    99.89135359185909,
  );
  static final LatLngBounds _mfuCampusBounds = LatLngBounds(
    southwest: const LatLng(20.0385, 99.8875),
    northeast: const LatLng(20.0640, 99.9040),
  );
  static const double _defaultMapZoom = 16.9;
  static const double _minMapZoom = 15.0;
  static const double _maxMapZoom = 18.2;
  static const double _routeOverviewNorthOffsetDegrees = 0.0045;

  int currentIndex = 0;

  String selectedLine = "all";
  String activeBusLine = "line1";
  GoogleMapController? mapController;
  double currentZoom = _defaultMapZoom;

  Timer? stationTimer;
  Timer? busTimer;
  Timer? moveTimer;
  final TextEditingController fromSearchController = TextEditingController();
  final TextEditingController searchController = TextEditingController();

  List<dynamic> busData = [];
  List<dynamic> stationData = [];
  List<Map<String, dynamic>> filteredStations = [];
  Set<String> favoriteStationIds = {};
  Map<String, dynamic>? selectedFromStation;
  Map<String, dynamic>? selectedStation;
  String activeSearchField = "to";
  bool showStationSuggestions = false;
  bool isTripSearchCollapsed = false;
  Map<String, LatLng> busPositions = {};
  BitmapDescriptor stationMarkerIcon = BitmapDescriptor.defaultMarker;
  BitmapDescriptor selectedStationMarkerIcon = BitmapDescriptor.defaultMarker;
  final Map<String, BitmapDescriptor> stationDensityIcons = {};
  final Map<String, BitmapDescriptor> selectedStationDensityIcons = {};
  final Map<String, BitmapDescriptor> busMarkerIcons = {};
  static const Map<String, String> _busMarkerAssets = {
    "left": "assets/gemcar_left.png",
    "right": "assets/gemcar_right.png",
    "turnLeft": "assets/gemcar_turnleft.png",
    "turnRight": "assets/gemcar_turnright.png",
  };

  // statuses for bus
  Map<String, double> busProgress = {};
  Map<String, DateTime?> busWaitUntil = {};
  Map<String, String?> lastStationId = {};

  double speed = 1.2;
  List<LatLng> route = [];
  List<LatLng> route1 = [];
  List<LatLng> route2 = [];
  List<LatLng> selectedTripRoute = [];
  int selectedTripRouteRequestId = 0;

  //BusTimeline
  Widget busTimeline(List<Map<String, dynamic>> stations, double progress) {
    int currentIndex = progress.floor();
    double t = progress - currentIndex;

    return Column(
      children: [
        Row(
          children: List.generate(stations.length * 2 - 1, (i) {
            // DOT
            if (i % 2 == 0) {
              int index = i ~/ 2;

              bool passed = index < currentIndex;
              bool current = index == currentIndex;

              return Column(
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: current
                          ? Colors.amber
                          : passed
                          ? Colors.grey
                          : Colors.white,
                      border: Border.all(color: Colors.amber),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    cleanStationName(stations[index]),
                    style: const TextStyle(fontSize: 10),
                  ),
                ],
              );
            }

            // LINE
            return Expanded(
              child: Container(
                height: 3,
                color: Colors.grey.shade300,
                child: FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: (i ~/ 2) == currentIndex ? t : 1.0,
                  child: Container(color: Colors.amber),
                ),
              ),
            );
          }),
        ),
      ],
    );
  }

  Widget buildReportItem(IconData icon, String title, Color color) {
    return GestureDetector(
      onTap: () {
        debugPrint("Report tapped: $title");
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              backgroundColor: color,
              child: Icon(icon, color: Colors.white),
            ),
            const SizedBox(height: 8),
            Text(title, style: GoogleFonts.kanit(fontSize: 14)),
          ],
        ),
      ),
    );
  }

  // fetch station
  Future<void> fetchStations() async {
    try {
      final lines = await Future.wait([
        ApiService.getStations("line1"),
        ApiService.getStations("line2"),
      ]);
      final stationById = <String, dynamic>{};

      for (final station in [...lines[0], ...lines[1]]) {
        final id = station["id"]?.toString() ?? "";
        if (id.isNotEmpty) {
          stationById[id] = station;
        }
      }

      if (!mounted) return;

      final sortedLine1 =
          lines[0].map((station) => Map<String, dynamic>.from(station)).toList()
            ..sort(
              (a, b) => _stationOrderForLine(
                "line1",
                a["id"],
              ).compareTo(_stationOrderForLine("line1", b["id"])),
            );
      final sortedLine2 =
          lines[1].map((station) => Map<String, dynamic>.from(station)).toList()
            ..sort(
              (a, b) => _stationOrderForLine(
                "line2",
                a["id"],
              ).compareTo(_stationOrderForLine("line2", b["id"])),
            );

      setState(() {
        line1
          ..clear()
          ..addAll(sortedLine1);
        line2
          ..clear()
          ..addAll(sortedLine2);
        stationData = stationById.values.toList();
      });

      if (route1.isEmpty || route2.isEmpty) {
        updateAllRoutes();
      }
    } catch (e) {
      debugPrint("API ERROR: $e");
    }
  }

  double stationHeatWeight(dynamic waitingValue, String status) {
    final waiting = double.tryParse(waitingValue?.toString() ?? "") ?? 0;
    final waitingWeight = (waiting / 20).clamp(0.18, 1.0).toDouble();
    final statusWeight = switch (status.toUpperCase()) {
      "HIGH" => 1.0,
      "MEDIUM" => 0.62,
      _ => 0.28,
    };

    return waitingWeight > statusWeight ? waitingWeight : statusWeight;
  }

  String stationDensityLevel(dynamic waitingValue, String status) {
    final weight = stationHeatWeight(waitingValue, status);
    if (weight >= 0.78) return "HIGH";
    if (weight >= 0.48) return "MEDIUM";
    return "LOW";
  }

  BitmapDescriptor stationIconFor(
    dynamic waitingValue,
    String status,
    bool isSelected,
  ) {
    final level = stationDensityLevel(waitingValue, status);
    final icons = isSelected
        ? selectedStationDensityIcons
        : stationDensityIcons;
    return icons[level] ??
        (isSelected ? selectedStationMarkerIcon : stationMarkerIcon);
  }

  BitmapDescriptor busIconFor(String id) {
    final sprite = BusController.instance.busSprites[id] ?? "right";
    return busMarkerIcons[sprite] ??
        busMarkerIcons["right"] ??
        BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueBlue);
  }

  double distanceBetween(LatLng from, LatLng to) {
    return const ll.Distance().as(
      ll.LengthUnit.Meter,
      ll.LatLng(from.latitude, from.longitude),
      ll.LatLng(to.latitude, to.longitude),
    );
  }

  final List<Map<String, dynamic>> line1 = [];
  final List<Map<String, dynamic>> line2 = [];

  List<Map<String, dynamic>> getSelectedLine() {
    if (selectedLine == "all") return getAllLines();
    return selectedLine == "line1" ? line1 : line2;
  }

  List<Map<String, dynamic>> getActiveBusLine() {
    return activeBusLine == "line1" ? line1 : line2;
  }

  List<LatLng> getSelectedLinePoints() {
    if (selectedLine == "all") return [];
    final selectedRoute = selectedLine == "line1" ? route1 : route2;
    return selectedRoute.isNotEmpty
        ? selectedRoute
        : getLineLatLngs(getSelectedLine());
  }

  Color lineColor(String line) {
    if (line == "line1") return const Color(0xFFBC9945);
    if (line == "line2") return Colors.grey.shade700;
    return const Color(0xFFBC9945);
  }

  String lineLabel(String line) {
    if (line == "line1") return _t(en: "Line 1", th: "สาย 1");
    if (line == "line2") return _t(en: "Line 2", th: "สาย 2");
    return _t(en: "All", th: "ทั้งหมด");
  }

  String? busLineKey(Map<String, dynamic>? bus) {
    final rawLine = bus?["line"]?.toString();
    if (rawLine == "1" || rawLine == "line1") return "line1";
    if (rawLine == "2" || rawLine == "line2") return "line2";
    return selectedLine;
  }

  List<String> stationLineKeys(Map<String, dynamic> station) {
    final stationId = station["id"]?.toString();
    final lines = <String>[];
    if (_lineContainsStation(line1, stationId)) lines.add("line1");
    if (_lineContainsStation(line2, stationId)) lines.add("line2");
    return lines;
  }

  String stationLineSummary(Map<String, dynamic> station) {
    final lines = stationLineKeys(station).map(lineLabel).toList();
    return lines.isEmpty ? lineLabel("all") : lines.join(" / ");
  }

  String _t({required String en, required String th}) {
    return LanguageService.text(en: en, th: th);
  }

  Future<void> _toggleLanguage() async {
    final nextLanguage = LanguageService.isThai
        ? LanguageService.english
        : LanguageService.thai;
    await LanguageService.changeLanguage(nextLanguage);
  }

  Widget _buildLanguageToggleButton() {
    final flagAsset = LanguageService.isThai
        ? "assets/thai_flag.png"
        : "assets/eng_flag.png";

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(4),
        onTap: _toggleLanguage,
        child: Padding(
          padding: const EdgeInsets.all(3),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: Image.asset(
              flagAsset,
              width: 25,
              height: 18,
              fit: BoxFit.cover,
            ),
          ),
        ),
      ),
    );
  }

  String _minuteText(String value) {
    return _t(en: "$value min", th: "$value นาที");
  }

  String _peopleText(int value) {
    return _t(en: "$value people", th: "$value คน");
  }

  String _busText(String busNumber) {
    return _t(en: "Bus $busNumber", th: "รถ $busNumber");
  }

  String _statusLabel(String status) {
    switch (status.toUpperCase()) {
      case "HIGH":
        return _t(en: "HIGH", th: "หนาแน่น");
      case "MEDIUM":
        return _t(en: "MEDIUM", th: "ปานกลาง");
      default:
        return _t(en: "LOW", th: "ปกติ");
    }
  }

  bool stationInLine(Map<String, dynamic>? station, String line) {
    if (station == null) return true;
    if (line == "all") return true;
    final stationId = station["id"]?.toString();
    final stations = line == "line1" ? line1 : line2;
    return stations.any((item) => item["id"]?.toString() == stationId);
  }

  String lineForStation(Map<String, dynamic> station) {
    final stationId = station["id"]?.toString();
    if (line1.any((item) => item["id"]?.toString() == stationId)) {
      return "line1";
    }
    if (line2.any((item) => item["id"]?.toString() == stationId)) {
      return "line2";
    }
    return selectedLine;
  }

  bool _lineContainsStation(
    List<Map<String, dynamic>> line,
    String? stationId,
  ) {
    if (stationId == null) return false;
    return line.any((station) => station["id"]?.toString() == stationId);
  }

  List<Map<String, dynamic>> _stationsForLineKey(String line) {
    return line == "line1" ? line1 : line2;
  }

  List<LatLng> _routeForLineKey(String line) {
    return line == "line1" ? route1 : route2;
  }

  List<String> _tripLineCandidatesFor(
    Map<String, dynamic>? fromStation,
    Map<String, dynamic>? toStation,
  ) {
    final fromId = fromStation?["id"]?.toString();
    final toId = toStation?["id"]?.toString();
    if (fromId == null || toId == null) return [];

    final candidates = <String>[];
    if (_lineContainsStation(line1, fromId) &&
        _lineContainsStation(line1, toId)) {
      candidates.add("line1");
    }
    if (_lineContainsStation(line2, fromId) &&
        _lineContainsStation(line2, toId)) {
      candidates.add("line2");
    }
    return candidates;
  }

  String? _bestTripLineKeyFor(
    Map<String, dynamic>? fromStation,
    Map<String, dynamic>? toStation, {
    String? preferredLine,
  }) {
    final candidates = _tripLineCandidatesFor(fromStation, toStation);
    if (candidates.isEmpty) return null;

    if (candidates.length == 1) return candidates.first;
    if (preferredLine != null && candidates.contains(preferredLine)) {
      return preferredLine;
    }

    candidates.sort((a, b) {
      final aPoints = _buildTripPointsForLine(
        _stationsForLineKey(a),
        _routeForLineKey(a),
        fromStation!,
        toStation!,
      );
      final bPoints = _buildTripPointsForLine(
        _stationsForLineKey(b),
        _routeForLineKey(b),
        fromStation,
        toStation,
      );
      return _pointsDistanceMeters(
        aPoints,
      ).compareTo(_pointsDistanceMeters(bPoints));
    });

    return candidates.first;
  }

  String? _routeTripLineKeyFor(
    Map<String, dynamic>? fromStation,
    Map<String, dynamic>? toStation, {
    String? preferredLine,
  }) {
    final selectedTripLine = _bestTripLineKeyFor(
      fromStation,
      toStation,
      preferredLine: preferredLine,
    );
    if (selectedTripLine != null) return selectedTripLine;

    final candidates = _tripLineCandidatesFor(fromStation, toStation);
    if (candidates.isEmpty) return null;

    candidates.sort((a, b) {
      final aPoints = _buildTripPointsForLine(
        _stationsForLineKey(a),
        _routeForLineKey(a),
        fromStation!,
        toStation!,
      );
      final bPoints = _buildTripPointsForLine(
        _stationsForLineKey(b),
        _routeForLineKey(b),
        fromStation,
        toStation,
      );
      return _pointsDistanceMeters(
        aPoints,
      ).compareTo(_pointsDistanceMeters(bPoints));
    });

    return candidates.first;
  }

  void selectLine(String line) {
    final nextLine = selectedLine == line ? "all" : line;

    setState(() {
      selectedLine = nextLine;
      if (nextLine != "all") {
        activeBusLine = nextLine;
      }
      showStationSuggestions = false;
      filteredStations.clear();

      if (!stationInLine(selectedFromStation, nextLine)) {
        selectedFromStation = null;
        fromSearchController.clear();
      }

      if (!stationInLine(selectedStation, nextLine)) {
        selectedStation = null;
        searchController.clear();
      }
    });

    updateRoute();
    if (hasCompleteTripSearch()) {
      updateSelectedTripRoute(focusAfterUpdate: true);
    }
  }

  void handleCameraMove(CameraPosition position) {
    currentZoom = position.zoom;
  }

  Future<void> focusInitialMapTarget() async {
    final controller = mapController;
    if (controller == null) return;

    try {
      await controller.animateCamera(
        CameraUpdate.newCameraPosition(
          CameraPosition(
            target: widget.initialMapTarget ?? _mSquareStationCenter,
            zoom: widget.initialMapZoom,
            tilt: 0,
            bearing: 0,
          ),
        ),
      );
    } catch (e) {
      debugPrint("MAP CAMERA ERROR: $e");
    }
  }

  Future<void> focusSelectedTrip() async {
    final controller = mapController;
    if (controller == null) return;

    final points = getSelectedTripPoints();
    if (points.length < 2) return;

    FocusScope.of(context).unfocus();

    try {
      await controller.animateCamera(
        CameraUpdate.newLatLngBounds(routeOverviewBounds(points), 96),
      );
    } catch (e) {
      debugPrint("MAP TRIP CAMERA ERROR: $e");
    }
  }

  LatLngBounds routeOverviewBounds(List<LatLng> points) {
    final bounds = lineBounds(points);
    return LatLngBounds(
      southwest: bounds.southwest,
      northeast: LatLng(
        bounds.northeast.latitude + _routeOverviewNorthOffsetDegrees,
        bounds.northeast.longitude,
      ),
    );
  }

  LatLngBounds lineBounds(List<LatLng> points) {
    var minLat = points.first.latitude;
    var maxLat = points.first.latitude;
    var minLng = points.first.longitude;
    var maxLng = points.first.longitude;

    for (final point in points) {
      if (point.latitude < minLat) minLat = point.latitude;
      if (point.latitude > maxLat) maxLat = point.latitude;
      if (point.longitude < minLng) minLng = point.longitude;
      if (point.longitude > maxLng) maxLng = point.longitude;
    }

    return LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
  }

  List<Map<String, dynamic>> getAllLines() {
    final stationById = <String, Map<String, dynamic>>{};

    for (final station in [...line1, ...line2]) {
      final id = station["id"]?.toString() ?? "";
      if (id.isNotEmpty) {
        stationById[id] = station;
      }
    }

    final stations = stationById.values.toList();
    stations.sort(
      (a, b) => _stationNumber(a["id"]).compareTo(_stationNumber(b["id"])),
    );
    return stations;
  }

  int _stationNumber(dynamic id) {
    final number = RegExp(r'\d+').firstMatch(id?.toString() ?? "")?.group(0);
    return int.tryParse(number ?? "") ?? 9999;
  }

  int _stationOrderForLine(String line, dynamic id) {
    final stationNumber = _stationNumber(id);

    // Line 2 visits the medical center after station 10, then returns to
    // station 13. Its numeric id (22) does not represent its route position.
    if (line == "line2" && stationNumber == 22) return 11;
    return stationNumber;
  }

  String stationDisplayName(dynamic station) {
    final raw = station is Map
        ? station["name"]?.toString().trim() ?? ""
        : station?.toString().trim() ?? "";

    var name = raw
        .replaceFirst(
          RegExp(
            r'^station\s*0*\d+\s*[:\-ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â.]?\s*',
            caseSensitive: false,
          ),
          '',
        )
        .replaceFirst(
          RegExp(r'^0*\d+\s*[:\-ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â.]?\s*'),
          '',
        )
        .replaceAll(RegExp(r'\s*\([^)]*\)\s*$'), '')
        .trim();

    return name.isEmpty ? raw : name;
  }

  String cleanStationName(dynamic station) {
    final raw = LanguageService.stationName(station);

    final stationWithName = RegExp(
      r'^station\s*0*\d+\s*\((.*)\)\s*$',
      caseSensitive: false,
    ).firstMatch(raw);
    if (stationWithName != null) {
      return stationWithName.group(1)?.trim() ?? raw;
    }

    var name = raw.replaceFirst(
      RegExp(r'^station\s*0*\d+\s*[:\-.]?\s*', caseSensitive: false),
      '',
    );
    name = name.replaceFirst(RegExp(r'^0*\d+\s*[:\-.]?\s*'), '').trim();
    if (name.startsWith("(") && name.endsWith(")") && name.length > 2) {
      name = name.substring(1, name.length - 1).trim();
    }

    return name.isEmpty ? raw : name;
  }

  String _searchableStationName(Map<String, dynamic> station) {
    final names = [
      cleanStationName(station),
      stationDisplayName(station),
      station["name"]?.toString() ?? "",
      station["nameTH"]?.toString() ?? "",
      station["nameTh"]?.toString() ?? "",
      station["name_th"]?.toString() ?? "",
      station["thaiName"]?.toString() ?? "",
      station["nameThai"]?.toString() ?? "",
      station["th"]?.toString() ?? "",
      station["nameEN"]?.toString() ?? "",
      station["nameEn"]?.toString() ?? "",
      station["name_en"]?.toString() ?? "",
      station["englishName"]?.toString() ?? "",
      station["en"]?.toString() ?? "",
    ];

    return names
        .map(_normalizeSearchText)
        .where((name) => name.isNotEmpty)
        .join(" ");
  }

  String _searchableStationId(Map<String, dynamic> station) {
    return _normalizeSearchText(station["id"]?.toString() ?? "");
  }

  String _normalizeSearchText(String value) {
    return value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
  }

  bool _matchesStationSearch(Map<String, dynamic> station, String query) {
    final name = _searchableStationName(station);
    final id = _searchableStationId(station);
    final searchableText = "$name $id";
    final queryWords = query
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty)
        .toList();

    if (searchableText.contains(query)) return true;
    return queryWords.isNotEmpty &&
        queryWords.every((word) => searchableText.contains(word));
  }

  static const List<String> _forwardCampusStationOrder = [
    "station11",
    "station12",
    "station13",
    "station14",
    "station15",
    "station16",
    "station17",
    "station18",
    "station19",
    "station20",
    "station21",
  ];

  String _routeRuleName(Map<String, dynamic>? station) {
    if (station == null) return "";
    final names = [
      cleanStationName(station),
      station["name"]?.toString() ?? "",
      station["nameTH"]?.toString() ?? "",
      station["nameEn"]?.toString() ?? "",
      station["id"]?.toString() ?? "",
    ];
    return names.join(" ").toLowerCase();
  }

  bool _mustTravelOutboundFrom(Map<String, dynamic>? station) {
    final name = _routeRuleName(station);
    if (name.isEmpty) return false;

    return name.contains("e2") ||
        name.contains("c4") ||
        name.contains("c5") ||
        name.contains("m square") ||
        name.contains("m-square") ||
        name.contains("m aqure") ||
        name.contains("maqure") ||
        name.contains("mfu medical center") ||
        name.contains("โรงพยาบาลแม่ฟ้าหลวง");
  }

  bool _isForwardCampusRouteStation(Map<String, dynamic>? station) {
    final stationId = station?["id"]?.toString();
    return stationId != null && _forwardCampusStationOrder.contains(stationId);
  }

  bool _isAllowedForwardCampusDestination({
    required Map<String, dynamic> fromStation,
    required Map<String, dynamic> toStation,
  }) {
    final toId = toStation["id"]?.toString();
    if (toId == null) return false;

    final fromId = fromStation["id"]?.toString();
    final fromIndex = _forwardCampusStationOrder.indexOf(fromId ?? "");
    final toIndex = _forwardCampusStationOrder.indexOf(toId);

    if (fromIndex >= 0) {
      return toIndex > fromIndex;
    }

    return toIndex >= 0;
  }

  bool _isAllowedTripSelection({
    required Map<String, dynamic>? fromStation,
    required Map<String, dynamic>? toStation,
  }) {
    if (fromStation == null || toStation == null) return true;
    if (!_mustTravelOutboundFrom(fromStation)) return true;
    if (_isForwardCampusRouteStation(fromStation)) {
      return _isAllowedForwardCampusDestination(
        fromStation: fromStation,
        toStation: toStation,
      );
    }
    return _isAllowedForwardCampusDestination(
      fromStation: fromStation,
      toStation: toStation,
    );
  }

  List<Map<String, dynamic>> visibleStationMarkers() {
    if (!hasCompleteTripSearch()) return getSelectedLine();

    final selectedIds = {
      selectedFromStation?["id"]?.toString(),
      selectedStation?["id"]?.toString(),
    }..removeWhere((id) => id == null || id.isEmpty);

    return getAllLines()
        .where((station) => selectedIds.contains(station["id"]?.toString()))
        .toList();
  }

  List<Map<String, dynamic>> _searchStationPool(Set<String> favoriteIds) {
    final stationById = <String, Map<String, dynamic>>{};
    final sourceStations = selectedLine == "all"
        ? getAllLines()
        : getSelectedLine();

    for (final station in sourceStations) {
      final id = station["id"]?.toString() ?? "";
      if (id.isNotEmpty) stationById[id] = station;
    }

    for (final station in getAllLines()) {
      final id = station["id"]?.toString() ?? "";
      if (id.isNotEmpty && favoriteIds.contains(id)) {
        stationById[id] = station;
      }
    }

    return stationById.values.toList();
  }

  String? _blockedStationIdForField(String field) {
    final station = field == "from" ? selectedStation : selectedFromStation;
    final id = station?["id"]?.toString();
    return id == null || id.isEmpty ? null : id;
  }

  Future<void> searchStations(String value, String field) async {
    final query = value.trim().toLowerCase();
    final prefs = await SharedPreferences.getInstance();
    final favoriteStationIds = (prefs.getStringList(_favoriteStationsKey) ?? [])
        .toSet();

    if (!mounted) return;

    final blockedStationId = _blockedStationIdForField(field);
    final stations = _searchStationPool(favoriteStationIds)
        .where((station) => station["id"]?.toString() != blockedStationId)
        .where((station) {
          final nextFromStation = field == "from"
              ? station
              : selectedFromStation;
          final nextToStation = field == "from" ? selectedStation : station;
          return _isAllowedTripSelection(
            fromStation: nextFromStation,
            toStation: nextToStation,
          );
        })
        .toList();
    final matchedStations = query.isEmpty
        ? stations
        : stations.where((station) {
            return _matchesStationSearch(station, query);
          }).toList();

    matchedStations.sort(
      (a, b) => _compareSearchStations(a, b, favoriteStationIds, query),
    );

    setState(() {
      activeSearchField = field;
      this.favoriteStationIds = favoriteStationIds;
      filteredStations = matchedStations;
      showStationSuggestions = filteredStations.isNotEmpty;
      isTripSearchCollapsed = false;
    });
  }

  int _compareSearchStations(
    Map<String, dynamic> a,
    Map<String, dynamic> b,
    Set<String> favoriteStationIds,
    String query,
  ) {
    final aStarts =
        _searchableStationName(a).startsWith(query) ||
        _searchableStationId(a).startsWith(query);
    final bStarts =
        _searchableStationName(b).startsWith(query) ||
        _searchableStationId(b).startsWith(query);
    if (aStarts != bStarts) return aStarts ? -1 : 1;

    final aFavorite = favoriteStationIds.contains(a["id"]?.toString());
    final bFavorite = favoriteStationIds.contains(b["id"]?.toString());
    if (aFavorite != bFavorite) return aFavorite ? -1 : 1;

    final nameCompare = cleanStationName(
      a,
    ).toLowerCase().compareTo(cleanStationName(b).toLowerCase());
    if (nameCompare != 0) return nameCompare;

    return (a["id"]?.toString() ?? "").compareTo(b["id"]?.toString() ?? "");
  }

  void selectStation(Map<String, dynamic> station) {
    if (station["id"]?.toString() ==
        _blockedStationIdForField(activeSearchField)) {
      return;
    }

    final stationName = cleanStationName(station);
    final stationLines = stationLineKeys(station);
    final nextFromStation = activeSearchField == "from"
        ? station
        : selectedFromStation;
    final nextToStation = activeSearchField == "from"
        ? selectedStation
        : station;

    if (!_isAllowedTripSelection(
      fromStation: nextFromStation,
      toStation: nextToStation,
    )) {
      return;
    }

    final nextLine =
        _bestTripLineKeyFor(
          nextFromStation,
          nextToStation,
          preferredLine: selectedLine == "all" ? null : selectedLine,
        ) ??
        (selectedLine != "all" && stationInLine(station, selectedLine)
            ? selectedLine
            : stationLines.length == 1
            ? stationLines.first
            : "all");
    final shouldUpdateLine = selectedLine != nextLine;

    setState(() {
      selectedLine = nextLine;
      if (nextLine != "all") {
        activeBusLine = nextLine;
      }
      if (activeSearchField == "from") {
        selectedFromStation = station;
        fromSearchController.text = stationName;
      } else {
        selectedStation = station;
        searchController.text = stationName;
      }
      showStationSuggestions = false;
      isTripSearchCollapsed = false;
      filteredStations.clear();
      isTripSearchCollapsed = nextFromStation != null && nextToStation != null;
    });

    if (shouldUpdateLine) {
      updateRoute();
    }

    if (selectedFromStation != null && selectedStation != null) {
      updateSelectedTripRoute(focusAfterUpdate: true);
    } else {
      selectedTripRouteRequestId++;
      setState(() {
        selectedTripRoute = [];
      });
      mapController?.animateCamera(
        CameraUpdate.newCameraPosition(
          CameraPosition(
            target: LatLng(station["lat"], station["lng"]),
            zoom: 17,
            tilt: 0,
            bearing: 0,
          ),
        ),
      );
    }
  }

  void resetStationSelection() {
    FocusScope.of(context).unfocus();

    setState(() {
      selectedFromStation = null;
      selectedStation = null;
      selectedLine = "all";
      selectedTripRoute = [];
      showStationSuggestions = false;
      isTripSearchCollapsed = false;
      filteredStations.clear();
      fromSearchController.clear();
      searchController.clear();
    });
  }

  void hideSearchOverlay({bool resetLineWhenEmpty = false}) {
    FocusScope.of(context).unfocus();

    setState(() {
      showStationSuggestions = false;
      filteredStations.clear();
      if (hasCompleteTripSearch()) {
        isTripSearchCollapsed = true;
      }
      if (resetLineWhenEmpty &&
          selectedFromStation == null &&
          selectedStation == null) {
        selectedLine = "all";
      }
    });
  }

  void collapseTripSearch() {
    if (!hasCompleteTripSearch()) return;
    FocusScope.of(context).unfocus();

    setState(() {
      isTripSearchCollapsed = true;
      showStationSuggestions = false;
      filteredStations.clear();
    });
  }

  void clearTripSearch() {
    FocusScope.of(context).unfocus();

    setState(() {
      selectedFromStation = null;
      selectedStation = null;
      selectedLine = "all";
      selectedTripRoute = [];
      showStationSuggestions = false;
      isTripSearchCollapsed = false;
      filteredStations.clear();
      fromSearchController.clear();
      searchController.clear();
    });
  }

  void clearStationField(String field) {
    FocusScope.of(context).unfocus();
    selectedTripRouteRequestId++;

    setState(() {
      if (field == "from") {
        selectedFromStation = null;
        fromSearchController.clear();
      } else {
        selectedStation = null;
        searchController.clear();
      }

      if (selectedFromStation == null && selectedStation == null) {
        selectedLine = "all";
      }

      selectedTripRoute = [];
      showStationSuggestions = false;
      isTripSearchCollapsed = false;
      filteredStations.clear();
    });

    updateRoute();
  }

  void swapTripStations() {
    if (selectedFromStation == null && selectedStation == null) return;

    final nextFromStation = selectedStation;
    final nextToStation = selectedFromStation;
    if (!_isAllowedTripSelection(
      fromStation: nextFromStation,
      toStation: nextToStation,
    )) {
      return;
    }

    final nextLine =
        _bestTripLineKeyFor(
          nextFromStation,
          nextToStation,
          preferredLine: selectedLine == "all" ? null : selectedLine,
        ) ??
        selectedLine;

    setState(() {
      selectedFromStation = nextFromStation;
      selectedStation = nextToStation;
      selectedLine = nextLine;
      if (nextLine != "all") {
        activeBusLine = nextLine;
      }
      fromSearchController.text = nextFromStation == null
          ? ""
          : cleanStationName(nextFromStation);
      searchController.text = nextToStation == null
          ? ""
          : cleanStationName(nextToStation);
      showStationSuggestions = false;
      isTripSearchCollapsed = nextFromStation != null && nextToStation != null;
      filteredStations.clear();
    });

    if (selectedFromStation != null && selectedStation != null) {
      updateSelectedTripRoute(focusAfterUpdate: true);
    } else {
      selectedTripRouteRequestId++;
      setState(() {
        selectedTripRoute = [];
      });
    }
  }

  Map<String, dynamic>? getNearestBusInfo(
    Map<String, dynamic>? station, {
    String? lineKey,
  }) {
    if (station == null) return null;

    final stationPosition = LatLng(station["lat"], station["lng"]);
    Map<String, dynamic>? nearestBus;
    LatLng? nearestPosition;
    double nearestDistance = double.infinity;

    for (final bus in BusController.instance.busData) {
      if (lineKey != null &&
          busLineKey(Map<String, dynamic>.from(bus)) != lineKey) {
        continue;
      }

      final id = bus["busNumber"].toString();
      final position = BusController.instance.busPositions[id];

      if (position == null) continue;
      if (position.latitude == 0 && position.longitude == 0) continue;

      final distance = distanceBetween(position, stationPosition);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestBus = Map<String, dynamic>.from(bus);
        nearestPosition = position;
      }
    }

    if (nearestBus == null || nearestPosition == null) return null;

    final etaMinutes = (nearestDistance / 5 / 60).ceil();

    return {
      "bus": nearestBus,
      "position": nearestPosition,
      "distance": nearestDistance,
      "eta": etaMinutes < 1 ? 1 : etaMinutes,
    };
  }

  List<Map<String, dynamic>>? getTripLineStations() {
    final lineKey = _bestTripLineKeyFor(
      selectedFromStation,
      selectedStation,
      preferredLine: selectedLine == "all" ? null : selectedLine,
    );
    return lineKey == null ? null : _stationsForLineKey(lineKey);
  }

  double calculateRideDistanceMeters() {
    if (selectedFromStation == null || selectedStation == null) return 0;

    final points = getSelectedTripPoints();
    if (points.length < 2) return 0;
    double distance = 0;
    for (var i = 0; i < points.length - 1; i++) {
      distance += distanceBetween(points[i], points[i + 1]);
    }

    return distance;
  }

  int nearestRoutePointIndex(List<LatLng> routePoints, LatLng target) {
    var nearestIndex = 0;
    var nearestDistance = double.infinity;

    for (var i = 0; i < routePoints.length; i++) {
      final distance = distanceBetween(routePoints[i], target);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  }

  List<int> nearestRoutePointIndexes(
    List<LatLng> routePoints,
    LatLng target, {
    int limit = 12,
  }) {
    final indexedDistances = <MapEntry<int, double>>[];
    for (var i = 0; i < routePoints.length; i++) {
      indexedDistances.add(
        MapEntry(i, distanceBetween(routePoints[i], target)),
      );
    }

    indexedDistances.sort((a, b) => a.value.compareTo(b.value));
    return indexedDistances
        .take(limit.clamp(1, routePoints.length))
        .map((entry) => entry.key)
        .toList();
  }

  List<Map<String, dynamic>> _orderedStationsBetween(
    List<Map<String, dynamic>> line,
    String fromId,
    String toId,
  ) {
    final fromIndex = line.indexWhere(
      (station) => station["id"]?.toString() == fromId,
    );
    final toIndex = line.indexWhere(
      (station) => station["id"]?.toString() == toId,
    );
    if (fromIndex < 0 || toIndex < 0) return [];
    if (fromIndex == toIndex) return [line[fromIndex]];

    final orderedStations = <Map<String, dynamic>>[];
    var currentIndex = fromIndex;

    while (orderedStations.length <= line.length) {
      orderedStations.add(line[currentIndex]);
      if (currentIndex == toIndex) return orderedStations;
      currentIndex = (currentIndex + 1) % line.length;
    }

    return [];
  }

  List<LatLng> _routeSegmentBetween(
    List<LatLng> routePoints,
    LatLng from,
    LatLng to,
  ) {
    if (routePoints.length < 2) return [from, to];

    final fromIndexes = nearestRoutePointIndexes(routePoints, from);
    final toIndexes = nearestRoutePointIndexes(routePoints, to);
    var bestSegment = <LatLng>[from, to];
    var bestDistance = double.infinity;

    for (final fromIndex in fromIndexes) {
      for (final toIndex in toIndexes) {
        if (fromIndex == toIndex) continue;

        final routeSlice = fromIndex < toIndex
            ? routePoints.sublist(fromIndex, toIndex + 1)
            : [
                ...routePoints.sublist(fromIndex),
                ...routePoints.sublist(0, toIndex + 1),
              ];
        final segment = [from, ...routeSlice, to];
        final distance = _pointsDistanceMeters(segment);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestSegment = segment;
        }
      }
    }

    return bestSegment;
  }

  double _pointsDistanceMeters(List<LatLng> points) {
    if (points.length < 2) return double.infinity;

    var distance = 0.0;
    for (var i = 0; i < points.length - 1; i++) {
      distance += distanceBetween(points[i], points[i + 1]);
    }
    return distance;
  }

  LatLng _stationPosition(Map<String, dynamic> station) {
    return LatLng(station["lat"], station["lng"]);
  }

  Future<void> updateSelectedTripRoute({bool focusAfterUpdate = false}) async {
    final fromStation = selectedFromStation;
    final toStation = selectedStation;
    final requestId = ++selectedTripRouteRequestId;

    if (fromStation == null || toStation == null) {
      setState(() {
        selectedTripRoute = [];
      });
      return;
    }

    final fallbackRoute = [
      _stationPosition(fromStation),
      _stationPosition(toStation),
    ];

    final tripLineKey = _routeTripLineKeyFor(
      fromStation,
      toStation,
      preferredLine: selectedLine == "all" ? null : selectedLine,
    );
    final tripLine = tripLineKey == null
        ? null
        : _stationsForLineKey(tripLineKey);
    var lineRoute = tripLineKey == null
        ? <LatLng>[]
        : _routeForLineKey(tripLineKey);
    if (tripLineKey != null && lineRoute.length < 2) {
      setState(() {
        selectedTripRoute = fallbackRoute;
      });

      final assetRoute = await RouteAssetService.loadRouteForLine(tripLineKey);
      if (!mounted || requestId != selectedTripRouteRequestId) return;
      if (assetRoute.length > 1) {
        lineRoute = densifyRoadRoute(assetRoute);
      }
    }

    var nextRoute = tripLine == null
        ? fallbackRoute
        : _buildTripPointsForLine(tripLine, lineRoute, fromStation, toStation);
    if (nextRoute.length < 2) {
      nextRoute = fallbackRoute;
    }

    if (!mounted || requestId != selectedTripRouteRequestId) return;

    final fromPosition = fallbackRoute.first;
    final startsNearFrom = distanceBetween(nextRoute.first, fromPosition);
    final endsNearFrom = distanceBetween(nextRoute.last, fromPosition);
    if (endsNearFrom < startsNearFrom) {
      nextRoute = nextRoute.reversed.toList();
    }

    setState(() {
      selectedTripRoute = [
        fromPosition,
        ...nextRoute.skip(1).take(nextRoute.length - 2),
        fallbackRoute.last,
      ];
    });

    if (focusAfterUpdate) {
      await focusSelectedTrip();
    }
  }

  List<LatLng> _buildTripPointsForLine(
    List<Map<String, dynamic>> tripLine,
    List<LatLng> lineRoute,
    Map<String, dynamic> fromStation,
    Map<String, dynamic> toStation,
  ) {
    final fromId = fromStation["id"]?.toString();
    final toId = toStation["id"]?.toString();
    if (fromId == null || toId == null) return [];

    final orderedStations = _orderedStationsBetween(tripLine, fromId, toId);
    if (orderedStations.length < 2) return [];

    final fallbackPoints = orderedStations
        .map((station) => LatLng(station["lat"], station["lng"]))
        .toList();
    if (lineRoute.length < 2) return fallbackPoints;

    if (fallbackPoints.length == 2) {
      return _routeSegmentBetween(
        lineRoute,
        fallbackPoints.first,
        fallbackPoints.last,
      );
    }

    final points = <LatLng>[];
    for (var i = 0; i < orderedStations.length - 1; i++) {
      final from = LatLng(orderedStations[i]["lat"], orderedStations[i]["lng"]);
      final to = LatLng(
        orderedStations[i + 1]["lat"],
        orderedStations[i + 1]["lng"],
      );
      final segment = _routeSegmentBetween(lineRoute, from, to);

      if (points.isEmpty) {
        points.addAll(segment);
      } else {
        points.addAll(segment.skip(1));
      }
    }

    return points.length > 1 ? points : fallbackPoints;
  }

  List<LatLng> getSelectedTripPoints() {
    if (!hasCompleteTripSearch()) return [];
    if (selectedTripRoute.length > 1) return selectedTripRoute;
    return [];
  }

  bool hasCompleteTripSearch() {
    return selectedFromStation != null &&
        selectedStation != null &&
        fromSearchController.text.trim().isNotEmpty &&
        searchController.text.trim().isNotEmpty;
  }

  int calculateRideMinutes() {
    final distance = calculateRideDistanceMeters();
    if (distance <= 0) return 0;
    final minutes = (distance / 5 / 60).ceil();
    return minutes < 1 ? 1 : minutes;
  }

  Widget buildTrackingPanel() {
    final fromStation = selectedFromStation;
    final toStation = selectedStation;
    final tripLineKey = _bestTripLineKeyFor(
      fromStation,
      toStation,
      preferredLine: selectedLine == "all" ? null : selectedLine,
    );
    final tripCandidates = _tripLineCandidatesFor(fromStation, toStation);
    final tripLineName = tripLineKey != null
        ? lineLabel(tripLineKey)
        : tripCandidates.isNotEmpty
        ? tripCandidates.map(lineLabel).join(" / ")
        : _t(en: "Shuttle line", th: "สายรถ");
    final nearestInfo = getNearestBusInfo(fromStation, lineKey: tripLineKey);
    final fromName = fromStation == null
        ? _t(en: "Choose start station", th: "เลือกสถานีต้นทาง")
        : cleanStationName(fromStation);
    final toName = toStation == null
        ? _t(en: "Choose destination", th: "เลือกสถานีปลายทาง")
        : cleanStationName(toStation);
    final bus = nearestInfo?["bus"] as Map<String, dynamic>?;
    final busNumber = bus?["busNumber"]?.toString() ?? "-";
    final eta = nearestInfo?["eta"]?.toString() ?? "-";
    final rideMinutes = fromStation != null && toStation != null
        ? calculateRideMinutes().toString()
        : "-";
    final totalMinutes =
        fromStation != null && toStation != null && nearestInfo != null
        ? ((nearestInfo["eta"] as int) + calculateRideMinutes()).toString()
        : "-";
    final distance = nearestInfo == null
        ? "-"
        : "${((nearestInfo["distance"] as double) / 1000).toStringAsFixed(1)} km";

    return Positioned(
      left: 16,
      right: 16,
      bottom: 16,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 16,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(
                    color: Color(0xFFD2232A),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.directions_bus,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "$fromName -> $toName",
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.kanit(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        fromStation == null || toStation == null
                            ? _t(
                                en: "Select From and To to calculate your trip",
                                th: "เลือกต้นทางและปลายทางเพื่อคำนวณการเดินทาง",
                              )
                            : nearestInfo == null
                            ? _t(
                                en: "Waiting for bus location at your start station...",
                                th: "กำลังรอตำแหน่งรถที่สถานีต้นทางของคุณ",
                              )
                            : _t(
                                en: "$tripLineName bus reaches your start station in about $eta min",
                                th: "รถ$tripLineName จะถึงสถานีต้นทางประมาณ $eta นาที",
                              ),
                        style: GoogleFonts.kanit(
                          fontSize: 13,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                InkWell(
                  onTap: clearTripSearch,
                  borderRadius: BorderRadius.circular(18),
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: const BoxDecoration(
                      color: Color(0xFFF2F2F2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.close_rounded,
                      size: 20,
                      color: Colors.black87,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _trackingMetric(
                    _t(en: "Wait", th: "รอรถ"),
                    _minuteText(eta),
                  ),
                ),
                Container(width: 1, height: 34, color: Colors.grey.shade200),
                Expanded(
                  child: _trackingMetric(
                    _t(en: "On bus", th: "บนรถ"),
                    _minuteText(rideMinutes),
                  ),
                ),
                Container(width: 1, height: 34, color: Colors.grey.shade200),
                Expanded(
                  child: _trackingMetric(
                    _t(en: "Total", th: "รวม"),
                    _minuteText(totalMinutes),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              nearestInfo == null
                  ? _t(
                      en: "Distance to start station: -",
                      th: "ระยะทางถึงสถานีต้นทาง: -",
                    )
                  : _t(
                      en: "$tripLineName nearest bus: Bus $busNumber, $distance from your start station",
                      th: "$tripLineName คันที่ใกล้ที่สุด: รถ $busNumber ห่างจากสถานีต้นทาง $distance",
                    ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.kanit(
                fontSize: 12,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _trackingMetric(String title, String value) {
    return Column(
      children: [
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.kanit(fontSize: 15, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 2),
        Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.kanit(fontSize: 11, color: Colors.grey.shade600),
        ),
      ],
    );
  }

  Widget _buildLineSelector() {
    return Material(
      color: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE8E8E8)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.16),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _lineSelectorButton(line: "line1"),
            const SizedBox(height: 5),
            _lineSelectorButton(line: "line2"),
          ],
        ),
      ),
    );
  }

  Widget _lineSelectorButton({required String line}) {
    final isSelected = selectedLine == line;
    final color = lineColor(line);

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => selectLine(line),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: 90,
        height: 38,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: isSelected ? color : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? color : const Color(0xFFE4E4E4),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.directions_bus_rounded,
              size: 18,
              color: isSelected ? Colors.white : color,
            ),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                lineLabel(line),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.kanit(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: isSelected ? Colors.white : Colors.black87,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<LatLng> getLineLatLngs(List<Map<String, dynamic>> points) {
    return points.map((p) => LatLng(p["lat"], p["lng"])).toList();
  }

  List<LatLng> densifyRoadRoute(
    List<LatLng> points, {
    int segmentsPerEdge = 10,
  }) {
    if (points.length < 2) return points;

    final result = <LatLng>[];
    for (var i = 0; i < points.length - 1; i++) {
      final start = points[i];
      final end = points[i + 1];

      for (var step = 0; step < segmentsPerEdge; step++) {
        final t = step / segmentsPerEdge;
        result.add(
          LatLng(
            start.latitude + ((end.latitude - start.latitude) * t),
            start.longitude + ((end.longitude - start.longitude) * t),
          ),
        );
      }
    }
    result.add(points.last);
    return result;
  }

  Future<List<LatLng>> fetchRouteForPoints(
    List<Map<String, dynamic>> points,
  ) async {
    if (points.isEmpty) return [];

    String coords = points.map((p) => "${p["lng"]},${p["lat"]}").join(";");

    final url =
        "https://router.project-osrm.org/route/v1/driving/$coords?overview=full&geometries=geojson";

    try {
      final res = await http.get(Uri.parse(url));
      final data = jsonDecode(res.body);

      if (data["routes"] == null || data["routes"].isEmpty) {
        debugPrint("all back route");
        return getLineLatLngs(points);
      }

      final routeCoords = data["routes"][0]["geometry"]["coordinates"];

      return routeCoords.map<LatLng>((c) {
        return LatLng(c[1], c[0]);
      }).toList();
    } catch (e) {
      debugPrint("ROUTE ERROR: $e");
      return getLineLatLngs(points);
    }
  }

  Future<List<LatLng>> fetchRouteForLine(
    String line,
    List<Map<String, dynamic>> points,
  ) async {
    final assetRoute = await RouteAssetService.loadRouteForLine(line);
    if (assetRoute.isNotEmpty) return assetRoute;

    return fetchRouteForPoints(points);
  }

  Future<List<LatLng>> fetchRealRoute() async {
    return fetchRouteForLine(activeBusLine, getActiveBusLine());
  }

  Future<BitmapDescriptor> createStationDensityIcon(
    ui.Image source,
    Color color,
    double logicalSize,
  ) async {
    const canvasSize = 144.0;
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    const center = ui.Offset(canvasSize / 2, canvasSize / 2);

    canvas.drawCircle(
      center,
      68,
      ui.Paint()..color = Colors.white.withValues(alpha: 0.96),
    );
    canvas.drawCircle(
      center,
      65,
      ui.Paint()
        ..color = color
        ..style = ui.PaintingStyle.stroke
        ..strokeWidth = 10,
    );

    final sourceRect = ui.Rect.fromLTWH(
      source.width * 0.125,
      source.height * 0.117,
      source.width * 0.75,
      source.height * 0.75,
    );
    const destinationRect = ui.Rect.fromLTWH(9, 9, 126, 126);
    canvas.drawImageRect(
      source,
      sourceRect,
      destinationRect,
      ui.Paint()..filterQuality = ui.FilterQuality.high,
    );

    final renderedImage = await recorder.endRecording().toImage(
      canvasSize.toInt(),
      canvasSize.toInt(),
    );
    final pngData = await renderedImage.toByteData(
      format: ui.ImageByteFormat.png,
    );
    renderedImage.dispose();

    return BitmapDescriptor.bytes(
      pngData!.buffer.asUint8List(pngData.offsetInBytes, pngData.lengthInBytes),
      width: logicalSize,
      height: logicalSize,
    );
  }

  Future<void> loadStationMarkerIcons() async {
    final assetData = await rootBundle.load("assets/bus_stop_2.png");
    final codec = await ui.instantiateImageCodec(
      assetData.buffer.asUint8List(
        assetData.offsetInBytes,
        assetData.lengthInBytes,
      ),
      targetWidth: 128,
      targetHeight: 128,
    );
    final frame = await codec.getNextFrame();
    final source = frame.image;
    const colors = {
      "LOW": Color(0xFF00A84F),
      "MEDIUM": Color(0xFFFFA800),
      "HIGH": Color(0xFFE32636),
    };
    final normalIcons = <String, BitmapDescriptor>{};
    final selectedIcons = <String, BitmapDescriptor>{};

    for (final entry in colors.entries) {
      normalIcons[entry.key] = await createStationDensityIcon(
        source,
        entry.value,
        41,
      );
      selectedIcons[entry.key] = await createStationDensityIcon(
        source,
        entry.value,
        50,
      );
    }

    source.dispose();
    codec.dispose();

    if (!mounted) return;

    setState(() {
      stationDensityIcons
        ..clear()
        ..addAll(normalIcons);
      selectedStationDensityIcons
        ..clear()
        ..addAll(selectedIcons);
      stationMarkerIcon = normalIcons["LOW"]!;
      selectedStationMarkerIcon = selectedIcons["LOW"]!;
    });
  }

  Future<void> loadBusMarkerIcons() async {
    final icons = <String, BitmapDescriptor>{};

    for (final entry in _busMarkerAssets.entries) {
      icons[entry.key] = await BitmapDescriptor.asset(
        const ImageConfiguration(),
        entry.value,
        width: 53,
        height: 53,
      );
    }

    if (!mounted) return;

    setState(() {
      busMarkerIcons
        ..clear()
        ..addAll(icons);
    });
  }

  @override
  void initState() {
    super.initState();
    currentZoom = widget.initialMapZoom;
    loadStationMarkerIcons();
    loadBusMarkerIcons();
    updateAllRoutes();
    fetchStations();
    fetchBuses();

    BusController.instance.start();

    stationTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => fetchStations(),
    );
    busTimer = Timer.periodic(const Duration(seconds: 10), (_) => fetchBuses());

    moveTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
      moveSmooth();
      updateAllStationETA();
      updateBusETA();
    });
  }

  @override
  void dispose() {
    stationTimer?.cancel();
    busTimer?.cancel();
    moveTimer?.cancel();
    mapController?.dispose();
    fromSearchController.dispose();
    searchController.dispose();
    super.dispose();
  }

  void _showStationDetails({
    required Map<String, dynamic> station,
    required int waiting,
    required String status,
    required int arrivalMinutes,
  }) {
    final stationName = cleanStationName(station);
    final statusColor = _stationStatusColor(status);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        stationName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.kanit(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    IconButton(
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(
                        minWidth: 36,
                        minHeight: 36,
                      ),
                      icon: const Icon(Icons.close_rounded, size: 20),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Column(
                  children: [
                    _stationMetric(
                      icon: Icons.directions_bus_rounded,
                      label: _t(en: "Bus Arrival", th: "รถจะมาถึง"),
                      value: _minuteText(arrivalMinutes.toString()),
                    ),
                    const SizedBox(height: 8),
                    _stationMetric(
                      icon: Icons.people_outline,
                      label: _t(en: "People Waiting", th: "ผู้โดยสารรออยู่"),
                      value: _peopleText(waiting),
                    ),
                    const SizedBox(height: 8),
                    _stationMetric(
                      icon: Icons.location_on_outlined,
                      label: _t(en: "Station Status", th: "สถานะสถานี"),
                      value: _statusLabel(status),
                      valueColor: statusColor,
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _stationMetric({
    required IconData icon,
    required String label,
    required String value,
    Color? valueColor,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: const Color(0xFFD2232A).withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 18, color: const Color(0xFFD2232A)),
        ),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.kanit(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: Colors.black87,
            ),
          ),
        ),
        const SizedBox(width: 10),
        _stationMetricValue(value, valueColor),
      ],
    );
  }

  Widget _stationMetricValue(String value, Color? valueColor) {
    final textStyle = GoogleFonts.kanit(
      fontSize: 14,
      fontWeight: valueColor == null ? FontWeight.w500 : FontWeight.w700,
      color: valueColor ?? Colors.black54,
    );

    if (valueColor == null) {
      return Text(
        value,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.right,
        style: textStyle,
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: valueColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        value,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: textStyle,
      ),
    );
  }

  Color _stationStatusColor(String status) {
    switch (status.toUpperCase()) {
      case "HIGH":
        return const Color(0xFFD2232A);
      case "MEDIUM":
        return const Color(0xFFBC9945);
      default:
        return Colors.green.shade700;
    }
  }

  Widget _searchActionButton({
    required IconData icon,
    required VoidCallback? onTap,
  }) {
    final enabled = onTap != null;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: enabled ? const Color(0xFFF2F2F2) : const Color(0xFFF8F8F8),
          shape: BoxShape.circle,
        ),
        child: Icon(
          icon,
          size: 21,
          color: enabled ? Colors.black87 : Colors.black26,
        ),
      ),
    );
  }

  Widget _stationSearchField({
    required TextEditingController controller,
    required String hintText,
    required VoidCallback onTap,
    required ValueChanged<String> onChanged,
    required VoidCallback onClear,
    required TextInputAction textInputAction,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF8F8F8),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE9E9E9)),
      ),
      child: TextField(
        controller: controller,
        onTap: onTap,
        onChanged: onChanged,
        decoration: InputDecoration(
          hintText: hintText,
          hintStyle: GoogleFonts.kanit(fontSize: 14, color: Colors.black45),
          border: InputBorder.none,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(
            vertical: 11,
            horizontal: 12,
          ),
          suffixIcon: controller.text.isEmpty
              ? null
              : IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18),
                  color: Colors.black45,
                  onPressed: onClear,
                ),
        ),
        style: GoogleFonts.kanit(fontSize: 13, fontWeight: FontWeight.w500),
        textInputAction: textInputAction,
      ),
    );
  }

  Widget _buildCollapsedTripSearchCard() {
    final fromName = selectedFromStation == null
        ? _t(en: "From", th: "à¸•à¹‰à¸™à¸—à¸²à¸‡")
        : cleanStationName(selectedFromStation);
    final toName = selectedStation == null
        ? _t(en: "To", th: "à¸›à¸¥à¸²à¸¢à¸—à¸²à¸‡")
        : cleanStationName(selectedStation);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          setState(() {
            isTripSearchCollapsed = false;
            showStationSuggestions = false;
            filteredStations.clear();
          });
        },
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 12, 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFECECEC)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              const Icon(
                Icons.route_rounded,
                size: 20,
                color: Color(0xFFD2232A),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  "$fromName -> $toName",
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.kanit(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.black87,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.keyboard_arrow_down_rounded,
                size: 22,
                color: Colors.black54,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildExpandedTripSearchCard(bool hasTripSearchValues) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFECECEC)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFFD2232A), width: 3),
                ),
              ),
              Container(
                width: 2,
                height: 38,
                margin: const EdgeInsets.symmetric(vertical: 4),
                color: const Color(0xFFE0E0E0),
              ),
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: Colors.grey.shade700,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _stationSearchField(
                  controller: fromSearchController,
                  hintText: _t(
                    en: "From station",
                    th: "à¸ªà¸–à¸²à¸™à¸µà¸•à¹‰à¸™à¸—à¸²à¸‡",
                  ),
                  onTap: () =>
                      searchStations(fromSearchController.text, "from"),
                  onChanged: (value) => searchStations(value, "from"),
                  onClear: () => clearStationField("from"),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 8),
                _stationSearchField(
                  controller: searchController,
                  hintText: _t(
                    en: "To station",
                    th: "à¸ªà¸–à¸²à¸™à¸µà¸›à¸¥à¸²à¸¢à¸—à¸²à¸‡",
                  ),
                  onTap: () => searchStations(searchController.text, "to"),
                  onChanged: (value) => searchStations(value, "to"),
                  onClear: () => clearStationField("to"),
                  textInputAction: TextInputAction.search,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (hasCompleteTripSearch()) ...[
                _searchActionButton(
                  icon: Icons.keyboard_arrow_up_rounded,
                  onTap: collapseTripSearch,
                ),
                const SizedBox(height: 8),
              ],
              _searchActionButton(
                icon: Icons.import_export_rounded,
                onTap: hasTripSearchValues ? swapTripStations : null,
              ),
            ],
          ),
        ],
      ),
    );
  }

  //fetch bus
  Future<void> fetchBuses() async {
    try {
      final data = await ApiService.getBuses();

      setState(() {
        busData = data;
      });

      BusController.instance.updateBuses(data);
    } catch (e) {
      debugPrint("BUS ERROR: $e");
    }
  }

  // Calculate ETA to station
  double calculateETA(LatLng stationLatLng) {
    double minMinutes = double.infinity;

    for (var bus in BusController.instance.busData) {
      final id = bus["busNumber"].toString();

      final pos = BusController.instance.busPositions[id];
      if (pos == null) continue;

      double distMeters = distanceBetween(pos, stationLatLng);

      double speedMeterPerSec = 10;

      double timeSec = distMeters / speedMeterPerSec;
      double timeMin = timeSec / 60;

      if (timeMin < minMinutes) {
        minMinutes = timeMin;
      }
    }

    if (minMinutes == double.infinity) return 0;
    return minMinutes;
  }

  //updates ETA station
  void updateAllStationETA() {
    for (var station in getActiveBusLine()) {
      final stationId = station["id"];

      double minMinutes = double.infinity;

      for (var bus in BusController.instance.busData) {
        final id = bus["busNumber"].toString();
        final pos = BusController.instance.busPositions[id];

        if (pos == null) continue;

        double dist = distanceBetween(
          pos,
          LatLng(station["lat"], station["lng"]),
        );

        double timeMin = (dist / 5) / 60;

        if (timeMin < minMinutes) {
          minMinutes = timeMin;
        }
      }

      BusController.instance.stationETA[stationId] = minMinutes.isFinite
          ? minMinutes.toInt()
          : 0;
    }
  }

  // Bus movement logic
  void moveSmooth() {
    final buses = BusController.instance.busData;

    if (route.isEmpty || buses.isEmpty) return;

    setState(() {
      double spacing = route.length / buses.length;
      double safeGap = route.length / 50;

      for (int i = 0; i < buses.length; i++) {
        final id = buses[i]["busNumber"].toString();
        final now = DateTime.now();

        if (BusController.instance.busWaitUntil[id] != null &&
            now.isBefore(BusController.instance.busWaitUntil[id]!)) {
          continue;
        }

        double currentProgress =
            BusController.instance.busProgress[id] ?? (i * spacing);

        double nextProgress = currentProgress + speed;

        bool blocked = false;
        for (var otherBus in buses) {
          final otherId = otherBus["busNumber"].toString();
          if (id == otherId) continue;

          double otherProgress =
              BusController.instance.busProgress[otherId] ?? 0;

          double gap = otherProgress - currentProgress;

          if (gap > 0 && gap < safeGap) {
            blocked = true;
            break;
          }
        }

        if (blocked) continue;

        int idx = nextProgress.floor();

        if (idx >= route.length - 1) {
          BusController.instance.busProgress[id] = 0;
          BusController.instance.busPositions[id] = route[0];
          BusController.instance.updateBusVisualState(id, route, 0);
          continue;
        }

        BusController.instance.busProgress[id] = nextProgress;

        double t = nextProgress - idx;

        LatLng p1 = route[idx];
        LatLng p2 = route[idx + 1];

        LatLng newPos = LatLng(
          p1.latitude + (p2.latitude - p1.latitude) * t,
          p1.longitude + (p2.longitude - p1.longitude) * t,
        );

        BusController.instance.busPositions[id] = newPos;
        BusController.instance.updateBusVisualState(id, route, idx);

        for (var station in getActiveBusLine()) {
          LatLng stationLatLng = LatLng(station["lat"], station["lng"]);

          double dist = distanceBetween(newPos, stationLatLng);

          if (dist < 15 &&
              BusController.instance.lastStationId[id] != station["id"]) {
            BusController.instance.busWaitUntil[id] = now.add(
              const Duration(seconds: 2),
            );

            BusController.instance.lastStationId[id] = station["id"];
            break;
          } else if (dist > 50 &&
              BusController.instance.lastStationId[id] == station["id"]) {
            BusController.instance.lastStationId[id] = null;
          }
        }
      }
    });
  }

  Future<void> updateAllRoutes() async {
    final newRoute1 = await fetchRouteForLine("line1", line1);
    final newRoute2 = await fetchRouteForLine("line2", line2);

    if (!mounted) return;

    setState(() {
      route1 = newRoute1.isNotEmpty
          ? densifyRoadRoute(newRoute1)
          : getLineLatLngs(line1);
      route2 = newRoute2.isNotEmpty
          ? densifyRoadRoute(newRoute2)
          : getLineLatLngs(line2);
    });

    updateRoute();
    if (hasCompleteTripSearch()) {
      updateSelectedTripRoute(focusAfterUpdate: false);
    }
  }

  Future<void> updateRoute() async {
    final newRoute = await fetchRealRoute();

    if (!mounted) return;

    setState(() {
      route = densifyRoadRoute(newRoute);
    });
  }

  void updateBusETA() {
    for (var bus in BusController.instance.busData) {
      final id = bus["busNumber"].toString();
      final pos = BusController.instance.busPositions[id];

      if (pos == null) continue;

      double minMinutes = double.infinity;

      for (var station in getActiveBusLine()) {
        double dist = distanceBetween(
          pos,
          LatLng(station["lat"], station["lng"]),
        );

        double timeMin = (dist / 5) / 60;

        if (timeMin < minMinutes) {
          minMinutes = timeMin;
        }
      }

      BusController.instance.busETA[id] = minMinutes.isFinite
          ? minMinutes.ceil()
          : 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: LanguageService.notifier,
      builder: (context, _, child) {
        final selectedTripPoints = getSelectedTripPoints();
        final selectedLinePoints = getSelectedLinePoints();
        final activeLineColor = lineColor(selectedLine);
        final showAllLines = selectedLine == "all";
        final hasTrackingPanel = hasCompleteTripSearch();
        final hasTripSearchValues =
            selectedFromStation != null ||
            selectedStation != null ||
            fromSearchController.text.isNotEmpty ||
            searchController.text.isNotEmpty;
        final shouldShowLineSelector =
            !showStationSuggestions &&
            !hasTrackingPanel &&
            fromSearchController.text.isEmpty &&
            searchController.text.isEmpty;

        return Scaffold(
          body: Stack(
            children: [
              GoogleMap(
                initialCameraPosition: CameraPosition(
                  target: widget.initialMapTarget ?? _mSquareStationCenter,
                  zoom: currentZoom,
                  tilt: 0,
                  bearing: 0,
                ),
                onMapCreated: (controller) {
                  mapController = controller;
                  focusInitialMapTarget();
                },
                onCameraMove: handleCameraMove,
                onTap: (_) => hideSearchOverlay(resetLineWhenEmpty: true),
                zoomControlsEnabled: false,
                minMaxZoomPreference: const MinMaxZoomPreference(
                  _minMapZoom,
                  _maxMapZoom,
                ),
                cameraTargetBounds: CameraTargetBounds(_mfuCampusBounds),
                mapToolbarEnabled: false,
                myLocationButtonEnabled: false,
                buildingsEnabled: false,
                rotateGesturesEnabled: false,
                tiltGesturesEnabled: false,
                polylines: {
                  if (selectedTripPoints.length > 1)
                    Polyline(
                      polylineId: const PolylineId("selected-station-route"),
                      points: selectedTripPoints,
                      color: const Color(0xFF1A73E8),
                      width: 6,
                      zIndex: 4,
                    )
                  else if (showAllLines) ...{
                    Polyline(
                      polylineId: const PolylineId("line2"),
                      points: route2.isNotEmpty
                          ? route2
                          : getLineLatLngs(line2),
                      color: lineColor("line2"),
                      width: 4,
                      zIndex: 1,
                    ),
                    Polyline(
                      polylineId: const PolylineId("line1"),
                      points: route1.isNotEmpty
                          ? route1
                          : getLineLatLngs(line1),
                      color: lineColor("line1"),
                      width: 4,
                      zIndex: 2,
                    ),
                  } else if (selectedLinePoints.length > 1)
                    Polyline(
                      polylineId: PolylineId(selectedLine),
                      points: selectedLinePoints,
                      color: activeLineColor,
                      width: 5,
                      zIndex: 3,
                    ),
                },
                markers: {
                  ...visibleStationMarkers().map((station) {
                    Map<String, dynamic>? stationMatch;

                    try {
                      stationMatch = stationData.firstWhere(
                        (s) => s["id"] == station["id"],
                      );
                    } catch (e) {
                      stationMatch = null;
                    }

                    int waiting = stationMatch?["waiting"] ?? 0;
                    String status = stationMatch?["status"] ?? "LOW";
                    final isSelected =
                        selectedStation?["id"]?.toString() ==
                            station["id"]?.toString() ||
                        selectedFromStation?["id"]?.toString() ==
                            station["id"]?.toString();

                    return Marker(
                      markerId: MarkerId("station-${station["id"]}"),
                      position: LatLng(station["lat"], station["lng"]),
                      anchor: const Offset(0.5, 0.5),
                      zIndexInt: 2,
                      icon: stationIconFor(waiting, status, isSelected),
                      infoWindow: InfoWindow(
                        title: cleanStationName(station),
                        snippet:
                            "${_peopleText(waiting)} - ${_statusLabel(status)}",
                      ),
                      onTap: () {
                        final eta = calculateETA(
                          LatLng(station["lat"], station["lng"]),
                        );

                        _showStationDetails(
                          station: station,
                          waiting: waiting,
                          status: status,
                          arrivalMinutes: eta.ceil(),
                        );
                      },
                    );
                  }),
                  ...BusController.instance.busData
                      .where((bus) {
                        final id = bus["busNumber"].toString();
                        return BusController.instance.busPositions[id] != null;
                      })
                      .map((bus) {
                        final id = bus["busNumber"].toString();
                        final pos = BusController.instance.busPositions[id]!;

                        return Marker(
                          markerId: MarkerId("bus-$id"),
                          position: pos,
                          anchor: const Offset(0.5, 0.5),
                          zIndexInt: 10,
                          icon: busIconFor(id),
                          infoWindow: InfoWindow(title: _busText(id)),
                        );
                      }),
                },
              ),

              if (hasTrackingPanel) buildTrackingPanel(),

              // Search station tab below app bar
              Positioned(
                top: 92,
                left: 16,
                right: 16,
                child: Column(
                  children: [
                    if (isTripSearchCollapsed && hasCompleteTripSearch())
                      _buildCollapsedTripSearchCard()
                    else
                      Container(
                        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: const Color(0xFFECECEC)),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.12),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 12,
                                  height: 12,
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: const Color(0xFFD2232A),
                                      width: 3,
                                    ),
                                  ),
                                ),
                                Container(
                                  width: 2,
                                  height: 38,
                                  margin: const EdgeInsets.symmetric(
                                    vertical: 4,
                                  ),
                                  color: const Color(0xFFE0E0E0),
                                ),
                                Container(
                                  width: 12,
                                  height: 12,
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade700,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  _stationSearchField(
                                    controller: fromSearchController,
                                    hintText: _t(
                                      en: "From station",
                                      th: "สถานีต้นทาง",
                                    ),
                                    onTap: () => searchStations(
                                      fromSearchController.text,
                                      "from",
                                    ),
                                    onChanged: (value) =>
                                        searchStations(value, "from"),
                                    onClear: () => clearStationField("from"),
                                    textInputAction: TextInputAction.next,
                                  ),
                                  const SizedBox(height: 8),
                                  _stationSearchField(
                                    controller: searchController,
                                    hintText: _t(
                                      en: "To station",
                                      th: "สถานีปลายทาง",
                                    ),
                                    onTap: () => searchStations(
                                      searchController.text,
                                      "to",
                                    ),
                                    onChanged: (value) =>
                                        searchStations(value, "to"),
                                    onClear: () => clearStationField("to"),
                                    textInputAction: TextInputAction.search,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (hasCompleteTripSearch()) ...[
                                  _searchActionButton(
                                    icon: Icons.keyboard_arrow_up_rounded,
                                    onTap: collapseTripSearch,
                                  ),
                                  const SizedBox(height: 8),
                                ],
                                _searchActionButton(
                                  icon: Icons.import_export_rounded,
                                  onTap: hasTripSearchValues
                                      ? swapTripStations
                                      : null,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    if (showStationSuggestions)
                      Container(
                        margin: const EdgeInsets.only(top: 8),
                        constraints: const BoxConstraints(maxHeight: 188),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.14),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Scrollbar(
                          child: ListView.separated(
                            padding: EdgeInsets.zero,
                            shrinkWrap: true,
                            itemCount: filteredStations.length,
                            separatorBuilder: (context, index) =>
                                Divider(height: 1, color: Colors.grey.shade200),
                            itemBuilder: (context, index) {
                              final station = filteredStations[index];
                              final name = cleanStationName(station);
                              final shouldShowLineBadge = selectedLine == "all";
                              final lineSummary = stationLineSummary(station);
                              final isFavorite = favoriteStationIds.contains(
                                station["id"]?.toString(),
                              );

                              return InkWell(
                                onTap: () => selectStation(station),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 9,
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(
                                        isFavorite
                                            ? Icons.favorite
                                            : Icons.directions_bus,
                                        size: 16,
                                        color: isFavorite
                                            ? const Color(0xFFD2232A)
                                            : Colors.grey,
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          name,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: GoogleFonts.kanit(
                                            fontSize: 12,
                                          ),
                                        ),
                                      ),
                                      if (shouldShowLineBadge) ...[
                                        const SizedBox(width: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 8,
                                            vertical: 4,
                                          ),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFF2F2F2),
                                            borderRadius: BorderRadius.circular(
                                              999,
                                            ),
                                          ),
                                          child: Text(
                                            lineSummary,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: GoogleFonts.kanit(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w600,
                                              color: Colors.black54,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              if (shouldShowLineSelector)
                Positioned(right: 16, bottom: 24, child: _buildLineSelector()),

              // App bar
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Container(
                  height: 88,
                  padding: EdgeInsets.only(
                    top: MediaQuery.of(context).padding.top,
                    left: 16,
                    right: 16,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.2),
                        blurRadius: 8,
                      ),
                    ],
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Positioned(
                        left: 0,
                        child: SizedBox(
                          width: 44,
                          height: 44,
                          child: IconButton(
                            padding: EdgeInsets.zero,
                            icon: const Icon(
                              Icons.menu,
                              color: Color(0xFFD2232A),
                              size: 30,
                            ),
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => const UserSetting(),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                      Positioned.fill(
                        left: 58,
                        right: 58,
                        child: Center(
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            child: RichText(
                              maxLines: 1,
                              text: TextSpan(
                                children: [
                                  TextSpan(
                                    text: 'MFU ',
                                    style: GoogleFonts.kanit(
                                      fontSize: 17,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFFD2232A),
                                    ),
                                  ),
                                  TextSpan(
                                    text: 'SHUTTLE BUS',
                                    style: GoogleFonts.kanit(
                                      fontSize: 17,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFFBC9945),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(right: 0, child: _buildLanguageToggleButton()),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
