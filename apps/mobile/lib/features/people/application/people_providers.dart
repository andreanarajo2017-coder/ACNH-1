import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../data/people_models.dart';

final peopleListProvider = FutureProvider.autoDispose<List<Person>>((ref) async {
  final page = await ref.watch(peopleApiProvider).list();
  return page.data;
});

final personProvider = FutureProvider.autoDispose.family<Person, String>((ref, id) {
  return ref.watch(peopleApiProvider).get(id);
});
