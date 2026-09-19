import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

enum ServerHealth { checking, connected, unreachable }

final serverHealthProvider = FutureProvider<ServerHealth>((ref) async {
  final client = ref.watch(apiClientProvider);
  final ok = await client.checkHealth();
  return ok ? ServerHealth.connected : ServerHealth.unreachable;
});
