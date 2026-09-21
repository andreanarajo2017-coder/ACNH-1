import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../data/event_models.dart';

enum CalendarViewMode { day, week, month }

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// Monday of the week containing [day] (ISO-8601 week, matches AR locale).
DateTime startOfWeek(DateTime day) => dateOnly(day).subtract(Duration(days: day.weekday - DateTime.monday));

DateTime startOfMonth(DateTime day) => DateTime(day.year, day.month);

DateTime endOfMonthExclusive(DateTime day) => DateTime(day.year, day.month + 1);

/// [from, to) bounds for `GET /calendar` given the view mode and the
/// currently focused day.
({DateTime from, DateTime to}) calendarRangeFor(CalendarViewMode mode, DateTime focusedDay) {
  switch (mode) {
    case CalendarViewMode.day:
      final start = dateOnly(focusedDay);
      return (from: start, to: start.add(const Duration(days: 1)));
    case CalendarViewMode.week:
      final start = startOfWeek(focusedDay);
      return (from: start, to: start.add(const Duration(days: 7)));
    case CalendarViewMode.month:
      // Pad to the visible leading/trailing weeks so the month grid's edge
      // days show their events too.
      final monthStart = startOfMonth(focusedDay);
      final monthEndExclusive = endOfMonthExclusive(focusedDay);
      return (from: startOfWeek(monthStart), to: startOfWeek(monthEndExclusive).add(const Duration(days: 7)));
  }
}

typedef CalendarRange = ({DateTime from, DateTime to});

final calendarRangeProvider = FutureProvider.autoDispose.family<List<CalendarItem>, CalendarRange>((
  ref,
  range,
) async {
  return ref.watch(calendarApiProvider).range(from: range.from, to: range.to);
});
