import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_providers.dart';
import '../../../core/widgets/async_state_views.dart';
import '../../../l10n/app_localizations.dart';
import '../../tasks/data/task_models.dart';
import '../application/people_providers.dart';
import 'relationship_label.dart';

final _personTasksProvider = FutureProvider.autoDispose.family<List<Task>, String>((ref, personId) async {
  final page = await ref.watch(tasksApiProvider).list(personId: personId, status: TaskStatus.pending);
  return page.data;
});

class PersonDetailScreen extends ConsumerWidget {
  const PersonDetailScreen({super.key, required this.personId});

  final String personId;

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.peopleDeleteTitle),
        content: Text(l10n.peopleDeleteConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: Text(l10n.cancel)),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(backgroundColor: Theme.of(dialogContext).colorScheme.error),
            child: Text(l10n.delete),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(peopleApiProvider).delete(personId);
    ref.invalidate(peopleListProvider);
    if (context.mounted) context.pop();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final personAsync = ref.watch(personProvider(personId));
    final tasksAsync = ref.watch(_personTasksProvider(personId));

    return Scaffold(
      appBar: AppBar(
        title: personAsync.maybeWhen(data: (p) => Text(p.name), orElse: () => Text(l10n.navPeople)),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            onPressed: personAsync.valueOrNull == null
                ? null
                : () => context.push('/people/$personId/edit', extra: personAsync.value),
          ),
          IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _confirmDelete(context, ref)),
        ],
      ),
      body: personAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stackTrace) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(personProvider(personId)),
        ),
        data: (person) => ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(relationshipLabel(l10n, person.relationship), style: Theme.of(context).textTheme.titleMedium),
            if (person.aliases.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [for (final alias in person.aliases) Chip(label: Text(alias))],
              ),
            ],
            const SizedBox(height: 24),
            Text(l10n.peoplePendingTasks, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            tasksAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, stackTrace) => Text(l10n.genericError),
              data: (tasks) => tasks.isEmpty
                  ? Text(l10n.peopleNoPendingTasks, style: Theme.of(context).textTheme.bodyMedium)
                  : Column(
                      children: [
                        for (final task in tasks)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.circle_outlined),
                            title: Text(task.title),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
