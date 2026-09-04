import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shuttle_bus_fronted/services/api_service.dart';
import 'package:shuttle_bus_fronted/services/language_service.dart';
import 'homepages.dart';

class BusStationPage extends StatefulWidget {
  const BusStationPage({super.key});

  @override
  State<BusStationPage> createState() => _BusStationPageState();
}

class _BusStationPageState extends State<BusStationPage> {
  List<_StationInfo> line1Stations = [];
  List<_StationInfo> line2Stations = [];
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadStations();
  }

  Future<void> _loadStations() async {
    try {
      final results = await Future.wait([
        ApiService.getStations("line1"),
        ApiService.getStations("line2"),
      ]);

      if (!mounted) return;

      setState(() {
        line1Stations = _stationOptions(results[0]);
        line2Stations = _stationOptions(results[1]);
        isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        isLoading = false;
      });

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("Failed to load stations")));
    }
  }

  List<_StationInfo> _stationOptions(List<dynamic> stations) {
    final sortedStations = List<dynamic>.from(stations);
    sortedStations.sort(
      (a, b) => _stationNumber(a["id"]).compareTo(_stationNumber(b["id"])),
    );

    return sortedStations
        .map<_StationInfo?>((station) {
          final name = _cleanStationName(station);
          final lat = _coordinate(station["lat"]);
          final lng = _coordinate(station["lng"]);

          if (name.isEmpty || lat == null || lng == null) return null;

          return _StationInfo(name: name, lat: lat, lng: lng);
        })
        .whereType<_StationInfo>()
        .toList();
  }

  double? _coordinate(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? "");
  }

  int _stationNumber(dynamic id) {
    final number = RegExp(r'\d+').firstMatch(id?.toString() ?? "")?.group(0);
    return int.tryParse(number ?? "") ?? 9999;
  }

  String _cleanStationName(dynamic station) {
    final raw = LanguageService.stationName(station);
    return raw
        .replaceFirst(
          RegExp(r'^station\s*0*\d+\s*[:\-.]?\s*', caseSensitive: false),
          '',
        )
        .trim();
  }

  String _t({required String en, required String th}) {
    return LanguageService.text(en: en, th: th);
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    const homeAppBarHeight = 88.0;
    const backButtonSize = 44.0;
    final backButtonTop =
        (topPadding + ((homeAppBarHeight - topPadding - backButtonSize) / 2))
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
                  child: Transform.translate(
                    offset: const Offset(0, -6),
                    child: Center(
                      child: Text(
                        _t(en: 'MFU Transit', th: 'สถานีรถรับส่ง'),
                        style: GoogleFonts.kanit(
                          color: Colors.black,
                          fontSize: 18,
                          fontWeight: FontWeight.w500,
                        ),
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
                Positioned(
                  right: 24,
                  top: backButtonTop,
                  child: SizedBox(
                    width: backButtonSize,
                    height: backButtonSize,
                    child: IconButton(
                      padding: EdgeInsets.zero,
                      icon: const Icon(
                        Icons.home_rounded,
                        color: Color(0xFF757575),
                        size: 25,
                      ),
                      onPressed: () {
                        Navigator.pushAndRemoveUntil(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const Homepages(),
                          ),
                          (route) => false,
                        );
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFFD2232A)),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
              children: [
                _LineSection(
                  title: _t(en: "Line 1", th: "สาย 1"),
                  subtitle: _t(
                    en: "Main campus route",
                    th: "เส้นทางในมหาวิทยาลัย",
                  ),
                  stations: line1Stations,
                  color: const Color(0xFFBC9945),
                ),
                const SizedBox(height: 14),
                _LineSection(
                  title: _t(en: "Line 2", th: "สาย 2"),
                  subtitle: _t(
                    en: "MFU Medical Center route",
                    th: "เส้นทางศูนย์การแพทย์ มฟล.",
                  ),
                  stations: line2Stations,
                  color: Colors.grey.shade700,
                ),
              ],
            ),
    );
  }
}

class _LineSection extends StatefulWidget {
  final String title;
  final String subtitle;
  final List<_StationInfo> stations;
  final Color color;

  const _LineSection({
    required this.title,
    required this.subtitle,
    required this.stations,
    required this.color,
  });

  @override
  State<_LineSection> createState() => _LineSectionState();
}

class _LineSectionState extends State<_LineSection> {
  String search = "";
  bool isOpen = false;

  String _t({required String en, required String th}) {
    return LanguageService.text(en: en, th: th);
  }

  @override
  Widget build(BuildContext context) {
    final filtered = widget.stations
        .where(
          (station) =>
              station.name.toLowerCase().contains(search.toLowerCase()),
        )
        .toList();

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE8E8E8)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () {
              setState(() {
                isOpen = !isOpen;
              });
            },
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 15, 14, 15),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: widget.color.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.directions_bus_rounded,
                      color: widget.color,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.title,
                          style: GoogleFonts.kanit(
                            color: Colors.black,
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          "${widget.subtitle} • ${widget.stations.length} ${_t(en: "stations", th: "สถานี")}",
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.kanit(
                            color: Colors.black54,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    isOpen
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    color: Colors.black54,
                    size: 26,
                  ),
                ],
              ),
            ),
          ),
          AnimatedCrossFade(
            duration: const Duration(milliseconds: 200),
            crossFadeState: isOpen
                ? CrossFadeState.showFirst
                : CrossFadeState.showSecond,
            firstChild: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                children: [
                  Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8F8F8),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFE9E9E9)),
                    ),
                    child: TextField(
                      onChanged: (value) {
                        setState(() {
                          search = value;
                        });
                      },
                      decoration: InputDecoration(
                        hintText: _t(en: "Find station", th: "ค้นหาสถานี"),
                        hintStyle: GoogleFonts.kanit(
                          fontSize: 14,
                          color: Colors.black45,
                        ),
                        prefixIcon: const Icon(
                          Icons.search_rounded,
                          color: Colors.black54,
                          size: 20,
                        ),
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 13,
                        ),
                      ),
                      style: GoogleFonts.kanit(fontSize: 14),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (filtered.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: Text(
                        _t(en: "No stations found", th: "ไม่พบสถานี"),
                        style: GoogleFonts.kanit(
                          color: Colors.black45,
                          fontSize: 14,
                        ),
                      ),
                    )
                  else
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 218),
                      child: RawScrollbar(
                        thumbVisibility: filtered.length > 5,
                        thickness: 3,
                        radius: const Radius.circular(999),
                        thumbColor: widget.color.withValues(alpha: 0.55),
                        child: ListView.separated(
                          padding: const EdgeInsets.only(right: 10),
                          shrinkWrap: true,
                          physics: const ClampingScrollPhysics(),
                          itemCount: filtered.length,
                          separatorBuilder: (context, index) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final station = filtered[index];

                            return Row(
                              children: [
                                Container(
                                  width: 32,
                                  height: 32,
                                  decoration: BoxDecoration(
                                    color: widget.color.withValues(alpha: 0.1),
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    Icons.location_on_outlined,
                                    color: widget.color,
                                    size: 18,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    station.name,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: GoogleFonts.kanit(
                                      color: Colors.black87,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                IconButton(
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints(
                                    minWidth: 32,
                                    minHeight: 32,
                                  ),
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (context) => Homepages(
                                          initialMapTarget: LatLng(
                                            station.lat,
                                            station.lng,
                                          ),
                                          initialMapZoom: 18,
                                        ),
                                      ),
                                    );
                                  },
                                  icon: const Icon(
                                    Icons.arrow_forward_ios_rounded,
                                    color: Colors.black54,
                                    size: 16,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ),
                    ),
                ],
              ),
            ),
            secondChild: const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _StationInfo {
  final String name;
  final double lat;
  final double lng;

  const _StationInfo({
    required this.name,
    required this.lat,
    required this.lng,
  });
}
