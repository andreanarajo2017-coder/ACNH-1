import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/token_storage.dart';

/// Talks to `/v1/auth/*` (section 7, F01). Uses the plain (unauthenticated)
/// Dio — these endpoints don't need a bearer token, except `logoutAll`,
/// which takes one explicitly since it runs before the caller necessarily
/// has an authorized Dio available.
class AuthApi {
  AuthApi(this._dio);

  final Dio _dio;

  Future<AuthTokens> register({
    required String email,
    required String password,
    required bool acceptTerms,
  }) => _post('/v1/auth/register', {
    'email': email,
    'password': password,
    'accept_terms': acceptTerms,
  });

  Future<AuthTokens> login({required String email, required String password}) =>
      _post('/v1/auth/login', {'email': email, 'password': password});

  Future<void> logout(String refreshToken) async {
    try {
      await _dio.post('/v1/auth/logout', data: {'refresh_token': refreshToken});
    } on DioException {
      // Logging out locally must succeed even if the network call fails.
    }
  }

  Future<void> logoutAll(String accessToken) async {
    await _dio.post(
      '/v1/auth/logout-all',
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );
  }

  Future<void> forgotPassword(String email) async {
    try {
      await _dio.post('/v1/auth/password/forgot', data: {'email': email});
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<void> resetPassword({required String token, required String newPassword}) async {
    try {
      await _dio.post(
        '/v1/auth/password/reset',
        data: {'token': token, 'new_password': newPassword},
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<AuthTokens> _post(String path, Map<String, dynamic> data) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(path, data: data);
      return AuthTokens(
        accessToken: response.data!['access_token'] as String,
        refreshToken: response.data!['refresh_token'] as String,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
