import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/data/auth_api.dart';
import '../../features/categories/data/categories_api.dart';
import '../../features/events/data/events_api.dart';
import '../../features/inbox/data/inbox_api.dart';
import '../../features/me/data/me_api.dart';
import '../../features/people/data/people_api.dart';
import '../../features/tasks/data/tasks_api.dart';
import 'api_client.dart';
import 'auth_interceptor.dart';
import 'dio_client.dart';
import 'session_expired_signal.dart';
import 'token_storage.dart';

// --- M0: plain health check (kept for the startup banner) ---

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

enum ServerHealth { checking, connected, unreachable }

final serverHealthProvider = FutureProvider<ServerHealth>((ref) async {
  final client = ref.watch(apiClientProvider);
  final ok = await client.checkHealth();
  return ok ? ServerHealth.connected : ServerHealth.unreachable;
});

// --- M3: authenticated API stack ---

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

final sessionExpiredSignalProvider = Provider<SessionExpiredSignal>((ref) {
  final signal = SessionExpiredSignal();
  ref.onDispose(signal.dispose);
  return signal;
});

/// No interceptor — used for endpoints that don't need a bearer token
/// (register/login/forgot/reset) and, internally, to call `/auth/refresh`
/// itself (which must not go through the interceptor it triggers).
final _plainDioProvider = Provider<Dio>((ref) => createDio());

final authApiProvider = Provider<AuthApi>((ref) => AuthApi(ref.watch(_plainDioProvider)));

/// Attaches the access token and auto-refreshes on 401 (see
/// AuthInterceptor). Every authenticated feature module uses this.
final authorizedDioProvider = Provider<Dio>((ref) {
  final dio = createDio();
  dio.interceptors.add(
    AuthInterceptor(
      tokenStorage: ref.watch(tokenStorageProvider),
      refreshDio: ref.watch(_plainDioProvider),
      retryDio: dio,
      onSessionExpired: () async {
        ref.read(sessionExpiredSignalProvider).notify();
      },
    ),
  );
  return dio;
});

final meApiProvider = Provider<MeApi>((ref) => MeApi(ref.watch(authorizedDioProvider)));
final peopleApiProvider = Provider<PeopleApi>((ref) => PeopleApi(ref.watch(authorizedDioProvider)));
final categoriesApiProvider = Provider<CategoriesApi>(
  (ref) => CategoriesApi(ref.watch(authorizedDioProvider)),
);
final tasksApiProvider = Provider<TasksApi>((ref) => TasksApi(ref.watch(authorizedDioProvider)));
final eventsApiProvider = Provider<EventsApi>((ref) => EventsApi(ref.watch(authorizedDioProvider)));
final calendarApiProvider = Provider<CalendarApi>(
  (ref) => CalendarApi(ref.watch(authorizedDioProvider)),
);
final inboxApiProvider = Provider<InboxApi>((ref) => InboxApi(ref.watch(authorizedDioProvider)));
