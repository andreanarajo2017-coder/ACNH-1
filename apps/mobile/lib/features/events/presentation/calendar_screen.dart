import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../../core/widgets/async_state_views.dart';
import '../../../l10n/app_localizations.dart';
import '../application/calendar_providers.dart';
import '../data/event_models.dart';

const _weekdayNames = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const _monthNames = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

String _dayHeader(DateTime d) => '${_weekdayNames[d.weekday - 1]} ${d.day} de ${_monthNames[d.month - 1]}';

String _monthYearHeader(DateTime d) {
  final month = _monthNames[d.month - 1];
  return '${month[0].toUpperCase()}${month.substring(1)} ${d.year}';
}

bool _isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// F07 (P0): day/week/month views of tasks + events, unified via
/// `GET /calendar`. Day and week are agenda-style lists (pragmatic
/// simplification — no time-grid widget); month uses `table_calendar` for a
/// real grid. AC-F07-01: an event created here shows up on the right day in
/// all three views, since they all read the same `calendarRangeProvider`.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  CalendarViewMode _mode = CalendarViewMode.day;
  late DateTime _focusedDay;
  late DateTime _selectedDay;

  @override
  void initState() {
    super.initState();
    final today = dateOnly(DateTime.now());
    _focusedDay = today;
    _selectedDay = today;
  }

  void _goToday() {
    setState(() {
      _focusedDay = dateOnly(DateTime.now());
      _selectedDay = _focusedDay;
    });
  }

  void _shift(int amount) {
    setState(() {
      switch (_mode) {
        case CalendarViewMode.day:
          _focusedDay = _focusedDay.add(Duration(days: amount));
          _selectedDay = _focusedDay;
        case CalendarViewMode.week:
          _focusedDay = _focusedDay.add(Duration(days: 7 * amount));
          _selectedDay = _focusedDay;
        case CalendarViewMode.month:
          _focusedDay = DateTime(_focusedDay.year, _focusedDay.month + amount);
      }
    });
  }

  void _onTapItem(CalendarItem item) {
    if (item.type == 'task') {
      context.push('/tasks/${item.id}');
    } else {
      context.push('/calendar/${item.id}/edit', extra: item);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final range = calendarRangeFor(_mode, _focusedDay);
    final itemsAsync = ref.watch(calendarRangeProvider((from: range.from, to: range.to)));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.navCalendar),
        actions: [IconButton(tooltip: l10n.calendarToday, icon: const Icon(Icons.today_outlined), onPressed: _goToday)],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: SegmentedButton<CalendarViewMode>(
                segments: [
                  ButtonSegment(value: CalendarViewMode.day, label: Text(l10n.calendarViewDay)),
                  ButtonSegment(value: CalendarViewMode.week, label: Text(l10n.calendarViewWeek)),
                  ButtonSegment(value: CalendarViewMode.month, label: Text(l10n.calendarViewMonth)),
                ],
                selected: {_mode},
                onSelectionChanged: (selection) => setState(() => _mode = selection.first),
              ),
            ),
            if (_mode != CalendarViewMode.month)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Row(
                  children: [
                    IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _shift(-1)),
                    Expanded(
                      child: Text(
                        _mode == CalendarViewMode.day ? _dayHeader(_focusedDay) : _monthYearHeader(_focusedDay),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _shift(1)),
                  ],
                ),
              ),
            Expanded(child: _buildBody(l10n, itemsAsync)),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        tooltip: l10n.eventsNewEvent,
        onPressed: () => context.push('/calendar/new', extra: _selectedDay),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildBody(AppLocalizations l10n, AsyncValue<List<CalendarItem>> itemsAsync) {
    switch (_mode) {
      case CalendarViewMode.day:
        return AsyncListView<CalendarItem>(
          value: itemsAsync,
          emptyMessage: l10n.calendarEmptyDay,
          emptyIcon: Icons.event_available_outlined,
          onRetry: () => ref.invalidate(calendarRangeProvider),
          itemBuilder: (context, item) => _CalendarItemTile(item: item, onTap: () => _onTapItem(item)),
        );
      case CalendarViewMode.week:
        return itemsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stackTrace) =>
              ErrorStateView(message: error.toString(), onRetry: () => ref.invalidate(calendarRangeProvider)),
          data: (items) {
            final weekStart = startOfWeek(_focusedDay);
            return ListView(
              children: [
                for (var i = 0; i < 7; i++) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Text(
                      _dayHeader(weekStart.add(Duration(days: i))),
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ),
                  ..._itemsForDay(items, weekStart.add(Duration(days: i))).map(
                    (item) => _CalendarItemTile(item: item, onTap: () => _onTapItem(item)),
                  ),
                  if (_itemsForDay(items, weekStart.add(Duration(days: i))).isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        l10n.calendarNoItems,
                        style: TextStyle(color: Theme.of(context).colorScheme.outline),
                      ),
                    ),
                ],
              ],
            );
          },
        );
      case CalendarViewMode.month:
        return itemsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stackTrace) =>
              ErrorStateView(message: error.toString(), onRetry: () => ref.invalidate(calendarRangeProvider)),
          data: (items) => Column(
            children: [
              TableCalendar<CalendarItem>(
                locale: 'es',
                firstDay: DateTime(2020),
                lastDay: DateTime(2035),
                focusedDay: _focusedDay,
                currentDay: DateTime.now(),
                selectedDayPredicate: (day) => _isSameDay(_selectedDay, day),
                calendarFormat: CalendarFormat.month,
                availableCalendarFormats: const {CalendarFormat.month: 'Mes'},
                eventLoader: (day) => _itemsForDay(items, day),
                onDaySelected: (selected, focused) {
                  setState(() {
                    _selectedDay = dateOnly(selected);
                    _focusedDay = dateOnly(focused);
                  });
                },
                onPageChanged: (focused) => setState(() => _focusedDay = dateOnly(focused)),
              ),
              const Divider(height: 1),
              Expanded(
                child: _itemsForDay(items, _selectedDay).isEmpty
                    ? EmptyStateView(message: l10n.calendarEmptyDay, icon: Icons.event_available_outlined)
                    : ListView(
                        children: _itemsForDay(items, _selectedDay)
                            .map((item) => _CalendarItemTile(item: item, onTap: () => _onTapItem(item)))
                            .toList(),
                      ),
              ),
            ],
          ),
        );
    }
  }

  List<CalendarItem> _itemsForDay(List<CalendarItem> items, DateTime day) =>
      items.where((item) => _isSameDay(item.startAt, day)).toList();
}

class _CalendarItemTile extends StatelessWidget {
  const _CalendarItemTile({required this.item, required this.onTap});

  final CalendarItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final subtitle = item.allDay ? l10n.eventsAllDay : TimeOfDay.fromDateTime(item.startAt).format(context);
    return ListTile(
      leading: Icon(item.type == 'task' ? Icons.check_circle_outline : Icons.event_outlined),
      title: Text(item.title),
      subtitle: Text(item.locationText != null ? '$subtitle · ${item.locationText}' : subtitle),
      onTap: onTap,
    );
  }
}
