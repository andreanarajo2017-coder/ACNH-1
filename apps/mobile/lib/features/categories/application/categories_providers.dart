import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../data/category_model.dart';

final categoriesListProvider = FutureProvider.autoDispose<List<Category>>((ref) async {
  final page = await ref.watch(categoriesApiProvider).list();
  return page.data;
});
