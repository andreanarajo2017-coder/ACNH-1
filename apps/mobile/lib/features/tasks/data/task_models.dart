enum TaskStatus {
  pending('pending'),
  inProgress('in_progress'),
  completed('completed'),
  postponed('postponed'),
  cancelled('cancelled');

  const TaskStatus(this.value);
  final String value;

  static TaskStatus fromJson(String value) =>
      TaskStatus.values.firstWhere((s) => s.value == value, orElse: () => TaskStatus.pending);
}

enum TaskPriority {
  low('low'),
  medium('medium'),
  high('high');

  const TaskPriority(this.value);
  final String value;

  static TaskPriority fromJson(String value) =>
      TaskPriority.values.firstWhere((p) => p.value == value, orElse: () => TaskPriority.medium);
}

class Task {
  const Task({
    required this.id,
    required this.title,
    required this.description,
    required this.status,
    required this.priority,
    required this.categoryId,
    required this.personId,
    required this.locationText,
    required this.dueDate,
    required this.dueAt,
    required this.estimatedMinutes,
    required this.postponedUntil,
    required this.completedAt,
  });

  final String id;
  final String title;
  final String? description;
  final TaskStatus status;
  final TaskPriority priority;
  final String? categoryId;
  final String? personId;
  final String? locationText;
  final String? dueDate;
  final DateTime? dueAt;
  final int? estimatedMinutes;
  final DateTime? postponedUntil;
  final DateTime? completedAt;

  /// Whichever of due_date/due_at is set (section 6: they're mutually
  /// exclusive), as a date, for grouping into Hoy/Próximas/Vencidas.
  DateTime? get dueDay {
    if (dueAt != null) return DateTime(dueAt!.year, dueAt!.month, dueAt!.day);
    if (dueDate != null) {
      final parts = dueDate!.split('-').map(int.parse).toList();
      return DateTime(parts[0], parts[1], parts[2]);
    }
    return null;
  }

  factory Task.fromJson(Map<String, dynamic> json) => Task(
    id: json['id'] as String,
    title: json['title'] as String,
    description: json['description'] as String?,
    status: TaskStatus.fromJson(json['status'] as String),
    priority: TaskPriority.fromJson(json['priority'] as String),
    categoryId: json['category_id'] as String?,
    personId: json['person_id'] as String?,
    locationText: json['location_text'] as String?,
    dueDate: json['due_date'] as String?,
    dueAt: json['due_at'] != null ? DateTime.parse(json['due_at'] as String) : null,
    estimatedMinutes: json['estimated_minutes'] as int?,
    postponedUntil: json['postponed_until'] != null
        ? DateTime.parse(json['postponed_until'] as String)
        : null,
    completedAt: json['completed_at'] != null ? DateTime.parse(json['completed_at'] as String) : null,
  );
}
