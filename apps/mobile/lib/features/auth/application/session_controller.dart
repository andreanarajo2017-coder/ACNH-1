import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../../../core/api/session_expired_signal.dart';
import '../../../core/api/token_storage.dart';
import '../../me/data/me_api.dart';
import '../data/auth_api.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class SessionState {
  const SessionState({required this.status, this.onboardingCompleted = false});

  final AuthStatus status;
  final bool onboardingCompleted;

  SessionState copyWith({AuthStatus? status, bool? onboardingCompleted}) => SessionState(
    status: status ?? this.status,
    onboardingCompleted: onboardingCompleted ?? this.onboardingCompleted,
  );
}

/// Owns the auth lifecycle: bootstraps from stored tokens on app start,
/// exposes register/login/logout, and reacts to the interceptor's
/// session-expired signal (see core/api/session_expired_signal.dart).
class SessionController extends StateNotifier<SessionState> {
  SessionController({
    required TokenStorage tokenStorage,
    required AuthApi authApi,
    required MeApi meApi,
    required SessionExpiredSignal sessionExpiredSignal,
  }) : _tokenStorage = tokenStorage,
       _authApi = authApi,
       _meApi = meApi,
       super(const SessionState(status: AuthStatus.unknown)) {
    _subscription = sessionExpiredSignal.stream.listen((_) => _forceLogout());
    _bootstrap();
  }

  final TokenStorage _tokenStorage;
  final AuthApi _authApi;
  final MeApi _meApi;
  late final StreamSubscription<void> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final token = await _tokenStorage.readAccessToken();
    if (token == null) {
      state = const SessionState(status: AuthStatus.unauthenticated);
      return;
    }
    await _loadProfile();
  }

  Future<void> _loadProfile() async {
    try {
      final me = await _meApi.getMe();
      state = SessionState(status: AuthStatus.authenticated, onboardingCompleted: me.onboardingCompleted);
    } catch (_) {
      await _tokenStorage.clear();
      state = const SessionState(status: AuthStatus.unauthenticated);
    }
  }

  Future<void> register({required String email, required String password}) async {
    final tokens = await _authApi.register(email: email, password: password, acceptTerms: true);
    await _tokenStorage.save(tokens);
    await _loadProfile();
  }

  Future<void> login({required String email, required String password}) async {
    final tokens = await _authApi.login(email: email, password: password);
    await _tokenStorage.save(tokens);
    await _loadProfile();
  }

  /// Called after the onboarding flow finishes (it already PATCHes
  /// `onboarding_completed_at` on the server); updates local state so the
  /// router stops redirecting to /onboarding without a round trip.
  void markOnboardingCompleted() {
    state = state.copyWith(onboardingCompleted: true);
  }

  Future<void> logout() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken != null) {
      await _authApi.logout(refreshToken);
    }
    await _tokenStorage.clear();
    state = const SessionState(status: AuthStatus.unauthenticated);
  }

  /// The account itself was deleted (DELETE /me already succeeded); just
  /// drop local session state, no server call needed.
  Future<void> clearAfterAccountDeletion() async {
    await _tokenStorage.clear();
    state = const SessionState(status: AuthStatus.unauthenticated);
  }

  void _forceLogout() {
    state = const SessionState(status: AuthStatus.unauthenticated);
  }
}

final sessionControllerProvider = StateNotifierProvider<SessionController, SessionState>((ref) {
  return SessionController(
    tokenStorage: ref.watch(tokenStorageProvider),
    authApi: ref.watch(authApiProvider),
    meApi: ref.watch(meApiProvider),
    sessionExpiredSignal: ref.watch(sessionExpiredSignalProvider),
  );
});
