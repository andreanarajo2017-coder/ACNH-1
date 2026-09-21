import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/api_providers.dart';
import '../../../l10n/app_localizations.dart';
import '../../categories/application/categories_providers.dart';
import '../../people/application/people_providers.dart';
import '../application/tasks_providers.dart';
import '../data/task_models.dart';

class TaskFormScreen extends ConsumerStatefulWidget {
  const TaskFormScreen({super.key, this.task});

  final Task? task;

  @override
  ConsumerState<TaskFormScreen> createState() => _TaskFormScreenState();
}

class _TaskFormScreenState extends ConsumerState<TaskFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _titleController = TextEditingController(text: widget.task?.title ?? '');
  late final _descriptionController = TextEditingController(text: widget.task?.description ?? '');
  late TaskPriority _priority = widget.task?.priority ?? TaskPriority.medium;
  late String? _categoryId = widget.task?.categoryId;
  late String? _personId = widget.task?.personId;
  DateTime? _dueDate;
  TimeOfDay? _dueTime;
  bool _submitting = false;
  String? _errorMessage;

  bool get _isEditing => widget.task != null;

  @override
  void initState() {
    super.initState();
    final task = widget.task;
    if (task?.dueAt != null) {
      _dueDate = task!.dueAt!;
      _dueTime = TimeOfDay.fromDateTime(task.dueAt!);
    } else if (task?.dueDay != null) {
      _dueDate = task!.dueDay;
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (picked != null) setState(() => _dueDate = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _dueTime ?? TimeOfDay.now());
    if (picked != null) setState(() => _dueTime = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    String? dueDateStr;
    DateTime? dueAt;
    if (_dueDate != null) {
      if (_dueTime != null) {
        dueAt = DateTime(_dueDate!.year, _dueDate!.month, _dueDate!.day, _dueTime!.hour, _dueTime!.minute);
      } else {
        dueDateStr =
            '${_dueDate!.year.toString().padLeft(4, '0')}-${_dueDate!.month.toString().padLeft(2, '0')}-${_dueDate!.day.toString().padLeft(2, '0')}';
      }
    }

    try {
      if (_isEditing) {
        await ref
            .read(tasksApiProvider)
            .update(
              widget.task!.id,
              title: _titleController.text.trim(),
              description: _descriptionController.text.trim(),
              priority: _priority,
              categoryId: _categoryId,
              personId: _personId,
              dueDate: dueDateStr,
              dueAt: dueAt,
            );
        ref.invalidate(taskProvider(widget.task!.id));
      } else {
        await ref
            .read(tasksApiProvider)
            .create(
              title: _titleController.text.trim(),
              description: _descriptionController.text.trim().isEmpty ? null : _descriptionController.text.trim(),
              priority: _priority,
              categoryId: _categoryId,
              personId: _personId,
              dueDate: dueDateStr,
              dueAt: dueAt,
            );
      }
      ref.invalidate(tasksProvider(noTaskFilter));
      if (mounted) context.pop();
    } on ApiException {
      if (mounted) setState(() => _errorMessage = AppLocalizations.of(context)!.genericError);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final categoriesAsync = ref.watch(categoriesListProvider);
    final peopleAsync = ref.watch(peopleListProvider);

    return Scaffold(
      appBar: AppBar(title: Text(_isEditing ? l10n.tasksEditTask : l10n.tasksNewTask)),
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
                  decoration: InputDecoration(labelText: l10n.tasksTitleLabel),
                  validator: (value) => (value == null || value.trim().isEmpty) ? l10n.tasksTitleRequired : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _descriptionController,
                  decoration: InputDecoration(labelText: l10n.tasksDescriptionLabel),
                  maxLines: 3,
                ),
                const SizedBox(height: 16),
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
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.calendar_today_outlined),
                        onPressed: _pickDate,
                        label: Text(
                          _dueDate == null
                              ? l10n.tasksPickDate
                              : '${_dueDate!.day}/${_dueDate!.month}/${_dueDate!.year}',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.access_time),
                        onPressed: _dueDate == null ? null : _pickTime,
                        label: Text(_dueTime == null ? l10n.tasksPickTime : _dueTime!.format(context)),
                      ),
                    ),
                  ],
                ),
                if (_dueDate != null)
                  TextButton(
                    onPressed: () => setState(() {
                      _dueDate = null;
                      _dueTime = null;
                    }),
                    child: Text(l10n.tasksClearDate),
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
