class Event {
  const Event({
    required this.id,
    required this.title,
    required this.startAt,
    required this.endAt,
    required this.allDay,
    required this.startDate,
    required this.locationText,
    required this.personId,
    required this.categoryId,
    required this.source,
  });

  final String id;
  final String title;
  final DateTime? startAt;
  final DateTime? endAt;
  final bool allDay;
  final String? startDate;
  final String? locationText;
  final String? personId;
  final String? categoryId;
  final String source;

  bool get isExternal => source != 'app';

  factory Event.fromJson(Map<String, dynamic> json) => Event(
    id: json['id'] as String,
    title: json['title'] as String,
    startAt: json['start_at'] != null ? DateTime.parse(json['start_at'] as String) : null,
    endAt: json['end_at'] != null ? DateTime.parse(json['end_at'] as String) : null,
    allDay: json['all_day'] as bool,
    startDate: json['start_date'] as String?,
    locationText: json['location_text'] as String?,
    personId: json['person_id'] as String?,
    categoryId: json['category_id'] as String?,
    source: json['source'] as String,
  );
}

/// A row from `GET /v1/calendar` — an event or a task with a due time,
/// unified (F07).
class CalendarItem {
  const CalendarItem({
    required this.type,
    required this.id,
    required this.title,
    required this.startAt,
    required this.endAt,
    required this.allDay,
    required this.locationText,
    required this.personId,
    required this.categoryId,
  });

  final String type; // 'event' | 'task'
  final String id;
  final String title;
  final DateTime startAt;
  final DateTime? endAt;
  final bool allDay;
  final String? locationText;
  final String? personId;
  final String? categoryId;

  factory CalendarItem.fromJson(Map<String, dynamic> json) => CalendarItem(
    type: json['type'] as String,
    id: json['id'] as String,
    title: json['title'] as String,
    startAt: DateTime.parse(json['start_at'] as String),
    endAt: json['end_at'] != null ? DateTime.parse(json['end_at'] as String) : null,
    allDay: json['all_day'] as bool,
    locationText: json['location_text'] as String?,
    personId: json['person_id'] as String?,
    categoryId: json['category_id'] as String?,
  );
}
