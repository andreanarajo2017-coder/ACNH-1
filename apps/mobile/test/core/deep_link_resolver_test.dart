import 'package:copiloto/core/push/deep_link_resolver.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('resolveDeepLinkRoute (F16 deep links)', () {
    test('a task notification opens that task', () {
      expect(resolveDeepLinkRoute({'type': 'task', 'id': 'abc-123'}), '/tasks/abc-123');
    });

    test('a task notification without an id falls back to the list', () {
      expect(resolveDeepLinkRoute({'type': 'task'}), '/tasks');
    });

    test('an upcoming_event notification opens the calendar', () {
      expect(resolveDeepLinkRoute({'type': 'event', 'id': 'evt-1'}), '/calendar');
    });

    test('an overdue_task notification opens the tasks list', () {
      expect(resolveDeepLinkRoute({'type': 'tasks_overdue'}), '/tasks');
    });

    test('a daily_summary notification opens home', () {
      expect(resolveDeepLinkRoute({'type': 'daily_summary'}), '/');
    });

    test('an unknown type falls back to home instead of crashing', () {
      expect(resolveDeepLinkRoute({'type': 'something_new'}), '/');
      expect(resolveDeepLinkRoute({}), '/');
    });
  });
}
