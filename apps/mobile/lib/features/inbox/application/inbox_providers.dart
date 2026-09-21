import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../data/inbox_models.dart';

final unprocessedInboxProvider = FutureProvider.autoDispose<List<InboxItem>>((ref) async {
  final page = await ref.watch(inboxApiProvider).list(status: InboxStatus.unprocessed);
  return page.data;
});

final inboxByStatusProvider = FutureProvider.autoDispose.family<List<InboxItem>, InboxStatus>((ref, status) async {
  final page = await ref.watch(inboxApiProvider).list(status: status);
  return page.data;
});
