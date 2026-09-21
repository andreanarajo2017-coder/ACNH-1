/// F16: one row of `GET/PATCH /v1/me/notification-settings` — mirrors the
/// backend's `notification_type` enum
/// (apps/api/src/modules/notifications/notification-types.ts).
enum NotificationType {
  reminder,
  upcomingEvent,
  overdueTask,
  dailySummary,
  conflictAlert,
  contextualRecommendation;

  static NotificationType fromWire(String value) => switch (value) {
    'reminder' => NotificationType.reminder,
    'upcoming_event' => NotificationType.upcomingEvent,
    'overdue_task' => NotificationType.overdueTask,
    'daily_summary' => NotificationType.dailySummary,
    'conflict_alert' => NotificationType.conflictAlert,
    'contextual_recommendation' => NotificationType.contextualRecommendation,
    _ => throw ArgumentError('Unknown notification type: $value'),
  };

  String get wire => switch (this) {
    NotificationType.reminder => 'reminder',
    NotificationType.upcomingEvent => 'upcoming_event',
    NotificationType.overdueTask => 'overdue_task',
    NotificationType.dailySummary => 'daily_summary',
    NotificationType.conflictAlert => 'conflict_alert',
    NotificationType.contextualRecommendation => 'contextual_recommendation',
  };
}

class NotificationTypeSetting {
  const NotificationTypeSetting({required this.type, required this.enabled});

  factory NotificationTypeSetting.fromJson(Map<String, dynamic> json) => NotificationTypeSetting(
    type: NotificationType.fromWire(json['type'] as String),
    enabled: json['enabled'] as bool,
  );

  final NotificationType type;
  final bool enabled;

  Map<String, dynamic> toJson() => {'type': type.wire, 'enabled': enabled};

  NotificationTypeSetting copyWith({bool? enabled}) =>
      NotificationTypeSetting(type: type, enabled: enabled ?? this.enabled);
}
