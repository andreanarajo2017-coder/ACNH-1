import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/api_providers.dart';
import '../../../l10n/app_localizations.dart';
import '../../categories/application/categories_providers.dart';
import '../../people/application/people_providers.dart';
import '../application/calendar_providers.dart';
import '../data/event_models.dart';

/// Create/edit an event manually (F07 P0, AC-F07-01). [event] comes straight
/// from the `GET /calendar` row that was tapped — there is no `GET
/// /events/:id`, and a `CalendarItem` already carries every field this form
/// needs.
class EventFormScreen extends ConsumerStatefulWidget {
  const EventFormScreen({super.key, this.event, this.initialDate});

  final CalendarItem? event;
  final DateTime? initialDate;

  @override
  ConsumerState<EventFormScreen> createState() => _EventFormScreenState();
}

class _EventFormScreenState extends ConsumerState<EventFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _titleController = TextEditingController(text: widget.event?.title ?? '');
  late final _locationController = TextEditingController(text: widget.event?.locationText ?? '');
  late bool _allDay = widget.event?.allDay ?? false;
  late String? _categoryId = widget.event?.categoryId;
  late String? _personId = widget.event?.personId;
  DateTime? _startDate;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;
  bool _submitting = false;
  String? _errorMessage;

  bool get _isEditing => widget.event != null;

  @override
  void initState() {
    super.initState();
    final event = widget.event;
    if (event != null) {
      _startDate = dateOnly(event.startAt);
      if (!event.allDay) {
        _startTime = TimeOfDay.fromDateTime(event.startAt);
        if (event.endAt != null) _endTime = TimeOfDay.fromDateTime(event.endAt!);
      }
    } else {
      _startDate = dateOnly(widget.initialDate ?? DateTime.now());
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _startDate ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (picked != null) setState(() => _startDate = picked);
  }

  Future<void> _pickStartTime() async {
    final picked = await showTimePicker(context: context, initialTime: _startTime ?? TimeOfDay.now());
    if (picked != null) setState(() => _startTime = picked);
  }

  Future<void> _pickEndTime() async {
    final picked = await showTimePicker(context: context, initialTime: _endTime ?? _startTime ?? TimeOfDay.now());
    if (picked != null) setState(() => _endTime = picked);
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    if (!_formKey.currentState!.validate()) return;
    if (_startDate == null) {
      setState(() => _errorMessage = l10n.eventsStartDateRequired);
      return;
    }
    if (!_allDay && _startTime == null) {
      setState(() => _errorMessage = l10n.eventsStartTimeRequired);
      return;
    }

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    final title = _titleController.text.trim();
    final locationText = _locationController.text.trim().isEmpty ? null : _locationController.text.trim();
    DateTime? startAt;
    DateTime? endAt;
    String? startDateStr;
    if (_allDay) {
      startDateStr =
          '${_startDate!.year.toString().padLeft(4, '0')}-${_startDate!.month.toString().padLeft(2, '0')}-${_startDate!.day.toString().padLeft(2, '0')}';
    } else {
      startAt = DateTime(_startDate!.year, _startDate!.month, _startDate!.day, _startTime!.hour, _startTime!.minute);
      if (_endTime != null) {
        endAt = DateTime(_startDate!.year, _startDate!.month, _startDate!.day, _endTime!.hour, _endTime!.minute);
      }
    }

    try {
      if (_isEditing) {
        await ref
            .read(eventsApiProvider)
            .update(
              widget.event!.id,
              title: title,
              startAt: startAt,
              endAt: endAt,
              locationText: locationText,
              personId: _personId,
              categoryId: _categoryId,
            );
      } else {
        await ref
            .read(eventsApiProvider)
            .create(
              title: title,
              allDay: _allDay,
              startAt: startAt,
              endAt: endAt,
              startDate: startDateStr,
              locationText: locationText,
              personId: _personId,
              categoryId: _categoryId,
            );
      }
      ref.invalidate(calendarRangeProvider);
      if (mounted) context.pop();
    } on ApiException {
      if (mounted) setState(() => _errorMessage = l10n.genericError);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _delete() async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.eventsDeleteTitle),
        content: Text(l10n.eventsDeleteConfirm),
        actions: [
          TextButton(onPressed: () => context.pop(false), child: Text(l10n.cancel)),
          TextButton(onPressed: () => context.pop(true), child: Text(l10n.delete)),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(eventsApiProvider).delete(widget.event!.id);
      ref.invalidate(calendarRangeProvider);
      if (mounted) context.pop();
    } on ApiException {
      if (mounted) setState(() => _errorMessage = l10n.genericError);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final categoriesAsync = ref.watch(categoriesListProvider);
    final peopleAsync = ref.watch(peopleListProvider);
    final editingAllDay = _isEditing && widget.event!.allDay;

    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? l10n.eventsEditEvent : l10n.eventsNewEvent),
        actions: [if (_isEditing) IconButton(icon: const Icon(Icons.delete_outline), onPressed: _delete)],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _titleController,
                  autofocus: !_isEditing,
                  decoration: InputDecoration(labelText: l10n.eventsTitleLabel),
                  validator: (value) => (value == null || value.trim().isEmpty) ? l10n.eventsTitleRequired : null,
                ),
                const SizedBox(height: 16),
                if (editingAllDay) ...[
                  Text(l10n.eventsAllDayCantReschedule, style: Theme.of(context).textTheme.bodySmall),
                ] else ...[
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(l10n.eventsAllDay),
                    value: _allDay,
                    onChanged: _isEditing ? null : (value) => setState(() => _allDay = value),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.calendar_today_outlined),
                          onPressed: _pickDate,
                          label: Text(
                            _startDate == null
                                ? l10n.tasksPickDate
                                : '${_startDate!.day}/${_startDate!.month}/${_startDate!.year}',
                          ),
                        ),
                      ),
                      if (!_allDay) ...[
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.access_time),
                            onPressed: _pickStartTime,
                            label: Text(_startTime == null ? l10n.tasksPickTime : _startTime!.format(context)),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (!_allDay) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.access_time),
                      onPressed: _pickEndTime,
                      label: Text(_endTime == null ? l10n.tasksPickTime : _endTime!.format(context)),
                    ),
                  ],
                ],
                const SizedBox(height: 16),
                TextFormField(
                  controller: _locationController,
                  decoration: InputDecoration(labelText: l10n.eventsLocationLabel),
                ),
                const SizedBox(height: 16),
                categoriesAsync.when(
                  data: (categories) => DropdownButtonFormField<String?>(
                    initialValue: _categoryId,
                    decoration: InputDecoration(labelText: l10n.tasksCategoryLabel),
                    items: [
                      DropdownMenuItem<String?>(value: null, child: Text(l10n.none)),
                      for (final c in categories) DropdownMenuItem<String?>(value: c.id, child: Text(c.name)),
                    ],
                    onChanged: (value) => setState(() => _categoryId = value),
                  ),
                  loading: () => const SizedBox.shrink(),
                  error: (error, stackTrace) => const SizedBox.shrink(),
                ),
                const SizedBox(height: 16),
                peopleAsync.when(
                  data: (people) => DropdownButtonFormField<String?>(
                    initialValue: _personId,
                    decoration: InputDecoration(labelText: l10n.tasksPersonLabel),
                    items: [
                      DropdownMenuItem<String?>(value: null, child: Text(l10n.none)),
                      for (final p in people) DropdownMenuItem<String?>(value: p.id, child: Text(p.name)),
                    ],
                    onChanged: (value) => setState(() => _personId = value),
                  ),
                  loading: () => const SizedBox.shrink(),
                  error: (error, stackTrace) => const SizedBox.shrink(),
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 16),
                  Text(_errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(l10n.save),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
