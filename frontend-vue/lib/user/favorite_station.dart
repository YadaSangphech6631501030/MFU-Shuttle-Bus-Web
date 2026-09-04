import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shuttle_bus_fronted/services/api_service.dart';
import 'package:shuttle_bus_fronted/services/language_service.dart';
import 'homepages.dart';

class FavoriteStationPage extends StatefulWidget {
  const FavoriteStationPage({super.key});

  @override
  State<FavoriteStationPage> createState() => _FavoriteStationPageState();
}

class _FavoriteStationPageState extends State<FavoriteStationPage> {
  static const String _favoriteStationsKey = 'favorite_stations';

  List<_StationOption> _stations = [];
  Set<String> _favoriteStationIds = {};
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadStations();
  }

  Future<void> _loadStations() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final results = await Future.wait([
        ApiService.getStations('line1'),
        ApiService.getStations('line2'),
      ]);
      final prefs = await SharedPreferences.getInstance();
      final stationById = <String, _StationOption>{};

      for (final station in [...results[0], ...results[1]]) {
        final id = station['id']?.toString() ?? '';
        final name = LanguageService.stationName(station);
        if (id.isEmpty || name.isEmpty) continue;

        final lineNames =
            (station['lines'] as List<dynamic>?)
                ?.map((line) => line.toString())
                .toSet() ??
            <String>{};

        stationById.update(
          id,
          (existing) =>
              existing.copyWith(lines: {...existing.lines, ...lineNames}),
          ifAbsent: () => _StationOption(id: id, name: name, lines: lineNames),
        );
      }

      final stations = stationById.values.toList()
        ..sort((a, b) => _stationNumber(a.id).compareTo(_stationNumber(b.id)));

      if (!mounted) return;

      setState(() {
        _stations = stations;
        _favoriteStationIds = (prefs.getStringList(_favoriteStationsKey) ?? [])
            .toSet();
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _isLoading = false;
        _error = 'Failed to load stations';
      });
    }
  }

  int _stationNumber(String id) {
    final number = RegExp(r'\d+').firstMatch(id)?.group(0);
    return int.tryParse(number ?? '') ?? 9999;
  }

  String _t({required String en, required String th}) {
    return LanguageService.text(en: en, th: th);
  }

  Future<void> _toggleFavorite(String stationId) async {
    final nextFavorites = Set<String>.from(_favoriteStationIds);

    if (nextFavorites.contains(stationId)) {
      nextFavorites.remove(stationId);
    } else {
      nextFavorites.add(stationId);
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_favoriteStationsKey, nextFavorites.toList());

    if (!mounted) return;

    setState(() {
      _favoriteStationIds = nextFavorites;
    });
  }

  Future<void> _addFavorite(String stationId) async {
    if (_favoriteStationIds.contains(stationId)) return;
    await _toggleFavorite(stationId);
  }

  List<_StationOption> get _favoriteStations {
    return _stations
        .where((station) => _favoriteStationIds.contains(station.id))
        .toList();
  }

  Future<void> _confirmRemoveFavorite(_StationOption station) async {
    final shouldRemove = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: Colors.white,
          title: Text(
            _t(en: 'Remove "${station.name}"?', th: 'ลบ "${station.name}"?'),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          content: Text(
            _t(
              en: 'This station will be permanently removed from your saved favorite stations. Are you sure?',
              th: 'สถานีนี้จะถูกลบออกจากรายการโปรดของคุณ ต้องการลบใช่ไหม?',
            ),
          ),
          actions: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.black,
                    side: const BorderSide(color: Colors.black, width: 0.8),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  onPressed: () => Navigator.pop(context, false),
                  child: Text(_t(en: 'Cancel', th: 'ยกเลิก')),
                ),
                const SizedBox(width: 12),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFD2232A),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  onPressed: () => Navigator.pop(context, true),
                  child: Text(_t(en: 'Delete', th: 'ลบ')),
                ),
              ],
            ),
          ],
        );
      },
    );

    if (shouldRemove == true) {
      await _toggleFavorite(station.id);
    }
  }

  void _showStationPicker() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => _StationSearchPage(
          stations: _stations,
          favoriteStationIds: _favoriteStationIds,
          onSelect: _addFavorite,
        ),
      ),
    );
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
                        _t(en: 'Favorite Stations', th: 'สถานีโปรด'),
                        style: const TextStyle(
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
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFFD2232A)),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _t(en: _error!, th: 'โหลดข้อมูลสถานีไม่สำเร็จ'),
              style: const TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: _loadStations,
              child: Text(
                _t(en: 'Try again', th: 'ลองอีกครั้ง'),
                style: const TextStyle(color: Color(0xFFD2232A)),
              ),
            ),
          ],
        ),
      );
    }

    final favoriteStations = _favoriteStations;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 10),
          child: InkWell(
            onTap: _showStationPicker,
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: Colors.grey.shade200,
                    child: const Icon(
                      Icons.add,
                      color: Colors.black87,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _t(en: 'Add new', th: 'เพิ่มสถานี'),
                          style: const TextStyle(
                            color: Color(0xFFD2232A),
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _t(
                            en: 'Save your favorite station',
                            th: 'บันทึกสถานีที่คุณใช้บ่อย',
                          ),
                          style: const TextStyle(
                            color: Colors.black54,
                            fontSize: 13,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: favoriteStations.isEmpty
              ? Center(
                  child: Text(
                    _t(
                      en: 'No favorite stations yet',
                      th: 'ยังไม่มีสถานีโปรด',
                    ),
                    style: const TextStyle(color: Colors.black54),
                  ),
                )
              : ListView.separated(
                  itemCount: favoriteStations.length,
                  separatorBuilder: (context, index) =>
                      const Divider(height: 1, color: Color(0xFFEDEDED)),
                  itemBuilder: (context, index) {
                    final station = favoriteStations[index];

                    return ListTile(
                      leading: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.favorite,
                          color: Color(0xFFD2232A),
                          size: 20,
                        ),
                      ),
                      title: Text(
                        station.name,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      trailing: IconButton(
                        icon: const Icon(
                          Icons.delete_outline,
                          color: Colors.grey,
                        ),
                        onPressed: () => _confirmRemoveFavorite(station),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _StationOption {
  final String id;
  final String name;
  final Set<String> lines;

  const _StationOption({
    required this.id,
    required this.name,
    required this.lines,
  });

  _StationOption copyWith({Set<String>? lines}) {
    return _StationOption(id: id, name: name, lines: lines ?? this.lines);
  }
}

class _StationSearchPage extends StatefulWidget {
  final List<_StationOption> stations;
  final Set<String> favoriteStationIds;
  final Future<void> Function(String stationId) onSelect;

  const _StationSearchPage({
    required this.stations,
    required this.favoriteStationIds,
    required this.onSelect,
  });

  @override
  State<_StationSearchPage> createState() => _StationSearchPageState();
}

class _StationSearchPageState extends State<_StationSearchPage> {
  final TextEditingController _searchController = TextEditingController();
  String _query = '';

  String _t({required String en, required String th}) {
    return LanguageService.text(en: en, th: th);
  }

  List<_StationOption> get _filteredStations {
    final query = _query.trim().toLowerCase();
    final stations = query.isEmpty
        ? List<_StationOption>.from(widget.stations)
        : widget.stations.where((station) {
            return station.name.toLowerCase().contains(query) ||
                station.id.toLowerCase().contains(query);
          }).toList();

    stations.sort(_compareStations);
    return stations;
  }

  int _compareStations(_StationOption a, _StationOption b) {
    final aFavorite = widget.favoriteStationIds.contains(a.id);
    final bFavorite = widget.favoriteStationIds.contains(b.id);
    if (aFavorite != bFavorite) return aFavorite ? -1 : 1;

    final nameCompare = a.name.toLowerCase().compareTo(b.name.toLowerCase());
    if (nameCompare != 0) return nameCompare;

    return a.id.compareTo(b.id);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    const homeAppBarHeight = 88.0;
    const backButtonSize = 44.0;
    final backButtonTop =
        (topPadding + ((homeAppBarHeight - topPadding - backButtonSize) / 2))
            .clamp(0.0, homeAppBarHeight - backButtonSize);
    final stations = _filteredStations;

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
                      _t(en: 'Search station', th: 'ค้นหาสถานี'),
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
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
            child: TextField(
              controller: _searchController,
              autofocus: true,
              onChanged: (value) {
                setState(() {
                  _query = value;
                });
              },
              decoration: InputDecoration(
                hintText: _t(en: 'Type station name', th: 'พิมพ์ชื่อสถานี'),
                prefixIcon: const Icon(Icons.search, color: Colors.black45),
                filled: true,
                fillColor: Colors.grey.shade100,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide.none,
                ),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          Expanded(
            child: stations.isEmpty
                ? Center(
                    child: Text(
                      _query.trim().isEmpty
                          ? _t(
                              en: 'No stations available',
                              th: 'ไม่มีข้อมูลสถานี',
                            )
                          : _t(en: 'No stations found', th: 'ไม่พบสถานี'),
                      style: const TextStyle(color: Colors.black54),
                    ),
                  )
                : ListView.separated(
                    padding: EdgeInsets.zero,
                    itemCount: stations.length,
                    separatorBuilder: (context, index) =>
                        const Divider(height: 1, color: Color(0xFFEDEDED)),
                    itemBuilder: (context, index) {
                      final station = stations[index];
                      final isFavorite = widget.favoriteStationIds.contains(
                        station.id,
                      );

                      return ListTile(
                        title: Text(
                          station.name,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        trailing: Icon(
                          isFavorite ? Icons.favorite : Icons.add_circle,
                          color: const Color(0xFFD2232A),
                        ),
                        onTap: () async {
                          if (isFavorite) {
                            Navigator.pop(context);
                            return;
                          }

                          await widget.onSelect(station.id);
                          if (!context.mounted) return;
                          Navigator.pop(context);
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
