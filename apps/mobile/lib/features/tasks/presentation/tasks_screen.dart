import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/widgets/async_state_views.dart';
import '../../../l10n/app_localizations.dart';
import '../application/task_views.dart';
import '../application/tasks_providers.dart';
import '../data/task_models.dart';
import 'task_tile.dart';

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});

  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 5, vsync: this);
  final _searchController = TextEditingController();
  bool _searching = false;

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final filter = (categoryId: null, personId: null, q: _searchController.text.trim().isEmpty ? null : _searchController.text.trim());
    final tasksAsync = ref.watch(tasksProvider(filter));

    return Scaffold(
      appBar: AppBar(
        title: _searching
            ? TextField(
                controller: _searchController,
                autofocus: true,
                decoration: InputDecoration(hintText: l10n.tasksSearchHint, border: InputBorder.none),
                onChanged: (_) => setState(() {}),
              )
            : Text(l10n.navTasks),
        actions: [
          IconButton(
            icon: Icon(_searching ? Icons.close : Icons.search),
            onPressed: () => setState(() {
              _searching = !_searching;
              if (!_searching) _searchController.clear();
            }),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: [
            Tab(text: l10n.tasksViewToday),
            Tab(text: l10n.tasksViewUpcoming),
            Tab(text: l10n.tasksViewNoDate),
            Tab(text: l10n.tasksViewOverdue),
            Tab(text: l10n.tasksViewCompleted),
          ],
        ),
      ),
      body: AsyncListWrapper(
        tasksAsync: tasksAsync,
        builder: (tasks) {
          final now = DateTime.now();
          return TabBarView(
            controller: _tabController,
            children: [
              _TaskListView(tasks: TaskViews.filter(tasks, TaskView.today, now), filter: filter, emptyMessage: l10n.tasksEmptyToday),
              _TaskListView(tasks: TaskViews.filter(tasks, TaskView.upcoming, now), filter: filter, emptyMessage: l10n.tasksEmptyUpcoming),
              _TaskListView(tasks: TaskViews.filter(tasks, TaskView.noDate, now), filter: filter, emptyMessage: l10n.tasksEmptyNoDate),
              _TaskListView(tasks: TaskViews.filter(tasks, TaskView.overdue, now), filter: filter, emptyMessage: l10n.tasksEmptyOverdue),
              _TaskListView(tasks: TaskViews.filter(tasks, TaskView.completed, now), filter: filter, emptyMessage: l10n.tasksEmptyCompleted),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/tasks/new'),
        child: const Icon(Icons.add),
      ),
    );
  }
}

/// Small adapter so the 5 tabs share one fetch (AsyncValue<List<Task>>)
/// instead of each tab hitting loading/error separately.
class AsyncListWrapper extends StatelessWidget {
  const AsyncListWrapper({super.key, required this.tasksAsync, required this.builder});

  final AsyncValue<List<Task>> tasksAsync;
  final Widget Function(List<Task> tasks) builder;

  @override
  Widget build(BuildContext context) {
    return tasksAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stackTrace) => ErrorStateView(message: error.toString()),
      data: builder,
    );
  }
}

class _TaskListView extends StatelessWidget {
  const _TaskListView({required this.tasks, required this.filter, required this.emptyMessage});

  final List<Task> tasks;
  final TaskFilter filter;
  final String emptyMessage;

  @override
  Widget build(BuildContext context) {
    if (tasks.isEmpty) {
      return EmptyStateView(message: emptyMessage, icon: Icons.task_alt_outlined);
    }
    return ListView.builder(
      itemCount: tasks.length,
      itemBuilder: (context, index) => TaskTile(task: tasks[index], filter: filter),
    );
  }
}
