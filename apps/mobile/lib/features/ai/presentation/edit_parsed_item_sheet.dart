import 'package:flutter/material.dart';

import '../../../l10n/app_localizations.dart';
import '../../categories/data/category_model.dart';
import '../../people/data/people_models.dart';
import '../../tasks/data/task_models.dart';
import '../data/ai_models.dart';

/// F04's "editar ítem": a condensed form covering whatever fields matter
/// for this item's `kind`. Saving always clears `missing_fields` — editing
/// *is* the user manually resolving whatever was missing (the spec's "se
/// ofrece completar a mano" after 3 clarification rounds, but available
/// any time here since there's no reason to gate it).
Future<ParsedItem?> showEditParsedItemSheet(
  BuildContext context, {
  required ParsedItem item,
  required List<Category> categories,
  required List<Person> people,
}) {
  return showModalBottomSheet<ParsedItem>(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(sheetContext).viewInsets.bottom),
      child: _EditParsedItemSheet(item: item, categories: categories, people: people),
    ),
  );
}

class _EditParsedItemSheet extends StatefulWidget {
  const _EditParsedItemSheet({required this.item, required this.categories, required this.people});

  final ParsedItem item;
  final List<Category> categories;
  final List<Person> people;

  @override
  State<_EditParsedItemSheet> createState() => _EditParsedItemSheetState();
}

class _EditParsedItemSheetState extends State<_EditParsedItemSheet> {
  final _formKey = GlobalKey<FormState>();
  late final _titleController = TextEditingController(text: widget.item.title);
  late final _locationController = TextEditingController(text: widget.item.locationText ?? '');
  late bool _allDay = widget.item.allDay ?? false;
  late String? _categoryId = widget.item.categoryId;
  late String? _personId = widget.item.personId;
  late TaskPriority _priority = widget.item.priority ?? TaskPriority.medium;
  DateTime? _date;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;
  String? _errorMessage;

  bool get _isEvent => widget.item.kind == ItemKind.event;
  bool get _isTask => widget.item.kind == ItemKind.task;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    final knownDate = item.startAt ?? item.dueAt;
    if (knownDate != null) {
      _date = DateTime(knownDate.year, knownDate.month, knownDate.day);
      _startTime = TimeOfDay.fromDateTime(knownDate);
      if (item.endAt != null) _endTime = TimeOfDay.fromDateTime(item.endAt!);
    } else {
      final dateOnly = item.startDate ?? item.dueDate;
      if (dateOnly != null) {
        final parts = dateOnly.split('-').map(int.parse).toList();
        _date = DateTime(parts[0], parts[1], parts[2]);
      }
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
      initialDate: _date ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickStartTime() async {
    final picked = await showTimePicker(context: context, initialTime: _startTime ?? TimeOfDay.now());
    if (picked != null) setState(() => _startTime = picked);
  }

  Future<void> _pickEndTime() async {
    final picked = await showTimePicker(context: context, initialTime: _endTime ?? _startTime ?? TimeOfDay.now());
    if (picked != null) setState(() => _endTime = picked);
  }

  void _save() {
    final l10n = AppLocalizations.of(context)!;
    if (!_formKey.currentState!.validate()) return;

    if (_isEvent && _date == null) {
      setState(() => _errorMessage = l10n.aiEditDateRequired);
      return;
    }
    if (_isEvent && !_allDay && _startTime == null) {
      setState(() => _errorMessage = l10n.aiEditTimeRequired);
      return;
    }

    DateTime? startAt;
    DateTime? endAt;
    DateTime? dueAt;
    String? startDate;
    String? dueDate;
    final dateStr = _date == null
        ? null
        : '${_date!.year.toString().padLeft(4, '0')}-${_date!.month.toString().padLeft(2, '0')}-${_date!.day.toString().padLeft(2, '0')}';

    if (_isEvent) {
      if (_allDay) {
        startDate = dateStr;
      } else {
        startAt = DateTime(_date!.year, _date!.month, _date!.day, _startTime!.hour, _startTime!.minute);
        if (_endTime != null) {
          endAt = DateTime(_date!.year, _date!.month, _date!.day, _endTime!.hour, _endTime!.minute);
        }
      }
    } else if (_isTask) {
      if (_date != null && _startTime != null) {
        dueAt = DateTime(_date!.year, _date!.month, _date!.day, _startTime!.hour, _startTime!.minute);
      } else {
        dueDate = dateStr;
      }
    }

    final edited = widget.item.copyWith(
      title: _titleController.text.trim(),
      startAt: startAt,
      clearStartAt: startAt == null,
      endAt: endAt,
      clearEndAt: endAt == null,
      allDay: _isEvent ? _allDay : null,
      startDate: startDate,
      clearStartDate: startDate == null,
      dueDate: dueDate,
      clearDueDate: dueDate == null,
      dueAt: dueAt,
      clearDueAt: dueAt == null,
      categoryId: _categoryId,
      clearCategoryId: _categoryId == null,
      personId: _personId,
      clearPersonId: _personId == null,
      clearPersonNameUnresolved: _personId != null,
      locationText: _locationController.text.trim().isEmpty ? null : _locationController.text.trim(),
      priority: _isTask ? _priority : null,
      missingFields: const [],
    );
    Navigator.of(context).pop(edited);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(l10n.aiEditItem, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _titleController,
                  autofocus: true,
                  decoration: InputDecoration(labelText: l10n.tasksTitleLabel),
                  validator: (value) => (value == null || value.trim().isEmpty) ? l10n.tasksTitleRequired : null,
                ),
                const SizedBox(height: 16),
                if (_isEvent)
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(l10n.eventsAllDay),
                    value: _allDay,
                    onChanged: (value) => setState(() => _allDay = value),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.calendar_today_outlined),
                        onPressed: _pickDate,
                        label: Text(
                          _date == null ? l10n.tasksPickDate : '${_date!.day}/${_date!.month}/${_date!.year}',
                        ),
                      ),
                    ),
                    if (!(_isEvent && _allDay)) ...[
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
                if (_isEvent && !_allDay) ...[
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.access_time),
                    onPressed: _pickEndTime,
                    label: Text(_endTime == null ? l10n.tasksPickTime : _endTime!.format(context)),
                  ),
                ],
                if (_date != null)
                  TextButton(
                    onPressed: () => setState(() {
                      _date = null;
                      _startTime = null;
                      _endTime = null;
                    }),
                    child: Text(l10n.tasksClearDate),
                  ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _locationController,
                  decoration: InputDecoration(labelText: l10n.eventsLocationLabel),
                ),
                const SizedBox(height: 16),
                if (_isTask)
                  DropdownButtonFormField<TaskPriority>(
                    initialValue: _priority,
                    decoration: InputDecoration(labelText: l10n.tasksPriorityLabel),
                    items: [
                      DropdownMenuItem(value: TaskPriority.low, child: Text(l10n.priorityLow)),
                      DropdownMenuItem(value: TaskPriority.medium, child: Text(l10n.priorityMedium)),
                      DropdownMenuItem(value: TaskPriority.high, child: Text(l10n.priorityHigh)),
                    ],
                    onChanged: (value) => setState(() => _priority = value ?? _priority),
                  ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String?>(
                  initialValue: _categoryId,
                  decoration: InputDecoration(labelText: l10n.tasksCategoryLabel),
                  items: [
                    DropdownMenuItem<String?>(value: null, child: Text(l10n.none)),
                    for (final c in widget.categories) DropdownMenuItem<String?>(value: c.id, child: Text(c.name)),
                  ],
                  onChanged: (value) => setState(() => _categoryId = value),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String?>(
                  initialValue: _personId,
                  decoration: InputDecoration(labelText: l10n.tasksPersonLabel),
                  items: [
                    DropdownMenuItem<String?>(value: null, child: Text(l10n.none)),
                    for (final p in widget.people) DropdownMenuItem<String?>(value: p.id, child: Text(p.name)),
                  ],
                  onChanged: (value) => setState(() => _personId = value),
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 16),
                  Text(_errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 24),
                FilledButton(onPressed: _save, child: Text(l10n.save)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
