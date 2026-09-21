import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../data/task_models.dart';

typedef TaskFilter = ({String? categoryId, String? personId, String? q});

const noTaskFilter = (categoryId: null, personId: null, q: null);

final tasksProvider = FutureProvider.autoDispose.family<List<Task>, TaskFilter>((ref, filter) async {
  final page = await ref.watch(
    tasksApiProvider,
  ).list(categoryId: filter.categoryId, personId: filter.personId, q: filter.q, limit: 100);
  return page.data;
});

final taskProvider = FutureProvider.autoDispose.family<Task, String>((ref, id) {
  return ref.watch(tasksApiProvider).get(id);
});
