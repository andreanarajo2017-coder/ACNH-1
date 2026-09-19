import 'package:dio/dio.dart';

import '../config/app_config.dart';

/// Thin wrapper around dio for the endpoints that exist so far
/// (`/healthz`, `/readyz` — outside `/v1`, see section 7).
///
/// From M1 onward, calls to `/v1/*` should go through the client generated
/// from the API's OpenAPI spec (D-01, D-02) instead of hand-written methods
/// added here.
class ApiClient {
  ApiClient({Dio? dio})
    : _dio = dio ?? Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl, connectTimeout: const Duration(seconds: 5)));

  final Dio _dio;

  Future<bool> checkHealth() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/healthz');
      return response.statusCode == 200 && response.data?['status'] == 'ok';
    } on DioException {
      return false;
    }
  }
}
