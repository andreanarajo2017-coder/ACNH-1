import '../data/task_models.dart';

/// F06 views: Hoy / Próximas / Sin fecha / Vencidas / Completadas. The API
/// has no "view" concept — this classifies a flat task list client-side,
/// including the postponed_until semantics from AC-F06-02 ("a task
/// postponed to tomorrow doesn't show in Hoy/Ahora today, and reappears
/// tomorrow").
enum TaskView { today, upcoming, noDate, overdue, completed }

class TaskViews {
  TaskViews._();

  static List<Task> filter(List<Task> tasks, TaskView view, DateTime now) {
    final today = DateTime(now.year, now.month, now.day);
    final filtered = tasks.where((t) => _matches(t, view, today)).toList()
      ..sort((a, b) => _sortKey(a).compareTo(_sortKey(b)));
    return filtered;
  }

  static bool _isActive(Task t) => t.status == TaskStatus.pending || t.status == TaskStatus.inProgress;

  static DateTime? _postponedUntilDay(Task t) {
    if (t.status != TaskStatus.postponed || t.postponedUntil == null) return null;
    final u = t.postponedUntil!;
    return DateTime(u.year, u.month, u.day);
  }

  static bool _matches(Task t, TaskView view, DateTime today) {
    switch (view) {
      case TaskView.completed:
        return t.status == TaskStatus.completed;
      case TaskView.today:
        final postponedDay = _postponedUntilDay(t);
        if (postponedDay != null) return postponedDay.isAtSameMomentAs(today);
        if (!_isActive(t)) return false;
        final day = t.dueDay;
        return day != null && day.isAtSameMomentAs(today);
      case TaskView.upcoming:
        if (t.status == TaskStatus.postponed) return false; // hidden until postponed_until
        if (!_isActive(t)) return false;
        final day = t.dueDay;
        return day != null && day.isAfter(today);
      case TaskView.noDate:
        return _isActive(t) && t.status != TaskStatus.postponed && t.dueDay == null;
      case TaskView.overdue:
        final postponedDay = _postponedUntilDay(t);
        if (postponedDay != null) return postponedDay.isBefore(today);
        if (!_isActive(t)) return false;
        final day = t.dueDay;
        return day != null && day.isBefore(today);
    }
  }

  static DateTime _sortKey(Task t) => t.dueAt ?? t.dueDay ?? t.postponedUntil ?? DateTime(9999);
}
