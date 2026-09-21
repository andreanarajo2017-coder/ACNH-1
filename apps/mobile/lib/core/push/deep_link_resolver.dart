/// F16: "cada notificación abre la pantalla correspondiente". Maps a push
/// notification's `data` payload — set by the API's NotificationService
/// (see apps/api/src/modules/notifications/notification.service.ts) — to a
/// go_router path. Pure and Firebase-free so it's unit-testable on its own.
String resolveDeepLinkRoute(Map<String, dynamic> data) {
  switch (data['type']) {
    case 'task':
      final id = data['id'] as String?;
      return id != null ? '/tasks/$id' : '/tasks';
    case 'event':
      // No `GET /events/:id` yet (see EventFormScreen) — the calendar
      // screen is the closest "pantalla correspondiente" until that lands.
      return '/calendar';
    case 'tasks_overdue':
      return '/tasks';
    case 'daily_summary':
      return '/';
    default:
      return '/';
  }
}
