import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/async_state_views.dart';
import '../application/tasks_providers.dart';
import 'task_form_screen.dart';

/// Loads the task by id, then hands off to the (editable) form — see
/// TaskFormScreen for why detail and edit are the same screen in M3.
class TaskDetailScreen extends ConsumerWidget {
  const TaskDetailScreen({super.key, required this.taskId});

  final String taskId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final taskAsync = ref.watch(taskProvider(taskId));
    return taskAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, stackTrace) => Scaffold(
        body: ErrorStateView(message: error.toString(), onRetry: () => ref.invalidate(taskProvider(taskId))),
      ),
      data: (task) => TaskFormScreen(task: task),
    );
  }
}
