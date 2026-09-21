import 'package:dio/dio.dart';

/// Mirrors the API's error envelope (section 7 of the spec):
/// `{ error: { code, message, details, request_id } }`.
class ApiException implements Exception {
  const ApiException({required this.statusCode, required this.code, required this.message});

  final int statusCode;
  final String code;
  final String message;

  factory ApiException.fromDioException(DioException e) {
    final statusCode = e.response?.statusCode ?? 0;
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      final error = data['error'] as Map;
      return ApiException(
        statusCode: statusCode,
        code: (error['code'] as String?) ?? 'unknown_error',
        message: (error['message'] as String?) ?? e.message ?? 'Unknown error',
      );
    }
    return ApiException(
      statusCode: statusCode,
      code: statusCode == 0 ? 'network_error' : 'unknown_error',
      message: e.message ?? 'Network error',
    );
  }

  bool get isNotFound => statusCode == 404;
  bool get isUnauthorized => statusCode == 401;
  bool get isConflict => statusCode == 409;
  bool get isRateLimited => statusCode == 429;

  @override
  String toString() => message;
}
