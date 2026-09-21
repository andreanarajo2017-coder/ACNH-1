class Me {
  const Me({
    required this.id,
    required this.email,
    required this.displayName,
    required this.timezone,
    required this.locale,
    required this.onboardingCompletedAt,
  });

  final String id;
  final String? email;
  final String? displayName;
  final String timezone;
  final String? locale;
  final DateTime? onboardingCompletedAt;

  bool get onboardingCompleted => onboardingCompletedAt != null;

  factory Me.fromJson(Map<String, dynamic> json) => Me(
    id: json['id'] as String,
    email: json['email'] as String?,
    displayName: json['display_name'] as String?,
    timezone: json['timezone'] as String,
    locale: json['locale'] as String?,
    onboardingCompletedAt: json['onboarding_completed_at'] != null
        ? DateTime.parse(json['onboarding_completed_at'] as String)
        : null,
  );
}

class UserSettings {
  const UserSettings({
    required this.dailySummaryEnabled,
    required this.dailySummaryTime,
    required this.quietHoursStart,
    required this.quietHoursEnd,
    required this.maxPushPerDay,
    required this.defaultEventReminderMin,
    required this.defaultTaskReminderTime,
  });

  final bool dailySummaryEnabled;
  final String dailySummaryTime;
  final String quietHoursStart;
  final String quietHoursEnd;
  final int maxPushPerDay;
  final int defaultEventReminderMin;
  final String defaultTaskReminderTime;

  factory UserSettings.fromJson(Map<String, dynamic> json) => UserSettings(
    dailySummaryEnabled: json['daily_summary_enabled'] as bool,
    dailySummaryTime: json['daily_summary_time'] as String,
    quietHoursStart: json['quiet_hours_start'] as String,
    quietHoursEnd: json['quiet_hours_end'] as String,
    maxPushPerDay: json['max_push_per_day'] as int,
    defaultEventReminderMin: json['default_event_reminder_min'] as int,
    defaultTaskReminderTime: json['default_task_reminder_time'] as String,
  );
}
