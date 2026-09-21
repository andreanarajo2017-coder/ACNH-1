import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';

/// F16: registers this device's push token so the API can send it
/// reminders/notifications. See `POST/DELETE /v1/devices`.
class DevicesApi {
  DevicesApi(this._dio);

  final Dio _dio;

  Future<void> register({required String platform, required String pushToken, String? appVersion}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/v1/devices',
        data: {
          'platform': platform,
          'push_token': pushToken,
          if (appVersion != null) 'app_version': appVersion,
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
