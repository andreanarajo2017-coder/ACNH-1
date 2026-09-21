import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_providers.dart';
import '../../../l10n/app_localizations.dart';
import '../application/tasks_providers.dart';
import '../data/task_models.dart';

class TaskTile extends ConsumerWidget {
  const TaskTile({super.key, required this.task, required this.filter});

  final Task task;
  final TaskFilter filter;

  Future<void> _postpone(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(l10n.postponeLaterToday),
              onTap: () => Navigator.of(sheetContext).pop('later_today'),
            ),
            ListTile(
              title: Text(l10n.postponeTomorrow),
              onTap: () => Navigator.of(sheetContext).pop('tomorrow'),
            ),
            ListTile(
              title: Text(l10n.postponeNextWeek),
              onTap: () => Navigator.of(sheetContext).pop('next_week'),
            ),
            ListTile(title: Text(l10n.postponeChooseDate), onTap: () => Navigator.of(sheetContext).pop('pick')),
          ],
        ),
      ),
    );
    if (choice == null || !context.mounted) return;

    final api = ref.read(tasksApiProvider);
    switch (choice) {
      case 'later_today':
        await api.postponeLaterToday(task.id);
      case 'tomorrow':
        await api.postponeTomorrow(task.id);
      case 'next_week':
        await api.postponeNextWeek(task.id);
      case 'pick':
        final picked = await showDatePicker(
          context: context,
          initialDate: DateTime.now().add(const Duration(days: 1)),
          firstDate: DateTime.now(),
          lastDate: DateTime.now().add(const Duration(days: 365)),
        );
        if (picked == null) return;
        await api.postponeUntil(task.id, picked);
    }
    ref.invalidate(tasksProvider(filter));
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.tasksDeleteTitle),
        content: Text(l10n.tasksDeleteConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: Text(l10n.cancel)),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: Text(l10n.delete)),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(tasksApiProvider).delete(task.id);
    ref.invalidate(tasksProvider(filter));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final isCompleted = task.status == TaskStatus.completed;

    return Dismissible(
      key: ValueKey(task.id),
      background: Container(
        color: Theme.of(context).colorScheme.errorContainer,
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        child: const Icon(Icons.delete_outline),
      ),
      direction: DismissDirection.startToEnd,
      confirmDismiss: (_) async {
        await _delete(context, ref);
        return false; // We handle the list refresh via invalidate; avoid double removal.
      },
      child: ListTile(
        leading: IconButton(
          icon: Icon(isCompleted ? Icons.check_circle : Icons.circle_outlined),
          color: isCompleted ? Theme.of(context).colorScheme.primary : null,
          onPressed: () async {
            final api = ref.read(tasksApiProvider);
            if (isCompleted) {
              await api.reopen(task.id);
            } else {
              await api.complete(task.id);
            }
            ref.invalidate(tasksProvider(filter));
          },
        ),
        title: Text(
          task.title,
          style: isCompleted ? const TextStyle(decoration: TextDecoration.lineThrough) : null,
        ),
        subtitle: _subtitle(context, l10n),
        trailing: isCompleted
            ? null
            : PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'postpone') _postpone(context, ref);
                  if (value == 'delete') _delete(context, ref);
                },
                itemBuilder: (context) => [
                  PopupMenuItem(value: 'postpone', child: Text(l10n.tasksPostpone)),
                  PopupMenuItem(value: 'delete', child: Text(l10n.delete)),
                ],
              ),
        onTap: () => context.push('/tasks/${task.id}'),
      ),
    );
  }

  Widget? _subtitle(BuildContext context, AppLocalizations l10n) {
    final parts = <String>[];
    if (task.dueAt != null) {
      parts.add(
        '${task.dueAt!.day}/${task.dueAt!.month} ${task.dueAt!.hour.toString().padLeft(2, '0')}:${task.dueAt!.minute.toString().padLeft(2, '0')}',
      );
    } else if (task.dueDate != null) {
      parts.add(task.dueDate!);
    }
    if (task.priority == TaskPriority.high) parts.add(l10n.priorityHigh);
    if (parts.isEmpty) return null;
    return Text(parts.join(' · '));
  }
}
