import 'package:dio/dio.dart';

import 'token_storage.dart';

/// Attaches the access token to every request and, on a single 401,
/// refreshes it once (D-11: rotating refresh tokens) and replays the
/// original request. Concurrent 401s share one in-flight refresh instead of
/// each racing their own.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.tokenStorage,
    required this.refreshDio,
    required this.retryDio,
    required this.onSessionExpired,
  });

  final TokenStorage tokenStorage;
  final Dio refreshDio; // Plain Dio, no interceptors — used only to call /auth/refresh.
  final Dio retryDio; // The authorized Dio itself, used to replay the failed request.
  final Future<void> Function() onSessionExpired;

  Future<AuthTokens?>? _refreshing;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await tokenStorage.readAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final isAuthError = err.response?.statusCode == 401;
    final alreadyRetried = err.requestOptions.extra['retried'] == true;
    if (!isAuthError || alreadyRetried) {
      handler.next(err);
      return;
    }

    final tokens = await (_refreshing ??= _refresh().whenComplete(() => _refreshing = null));
    if (tokens == null) {
      await onSessionExpired();
      handler.next(err);
      return;
    }

    final retryOptions = err.requestOptions;
    retryOptions.extra = {...retryOptions.extra, 'retried': true};
    retryOptions.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
    try {
      handler.resolve(await retryDio.fetch(retryOptions));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  Future<AuthTokens?> _refresh() async {
    final refreshToken = await tokenStorage.readRefreshToken();
    if (refreshToken == null) return null;
    try {
      final response = await refreshDio.post<Map<String, dynamic>>(
        '/v1/auth/refresh',
        data: {'refresh_token': refreshToken},
      );
      final tokens = AuthTokens(
        accessToken: response.data!['access_token'] as String,
        refreshToken: response.data!['refresh_token'] as String,
      );
      await tokenStorage.save(tokens);
      return tokens;
    } on DioException {
      await tokenStorage.clear();
      return null;
    }
  }
}
