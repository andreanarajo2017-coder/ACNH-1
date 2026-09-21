import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';
import 'notification_type_setting.dart';

class NotificationSettingsApi {
  NotificationSettingsApi(this._dio);

  final Dio _dio;

  Future<List<NotificationTypeSetting>> list() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/me/notification-settings');
      return (response.data!['data'] as List)
          .map((e) => NotificationTypeSetting.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<List<NotificationTypeSetting>> update(List<NotificationTypeSetting> settings) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/v1/me/notification-settings',
        data: {'settings': settings.map((s) => s.toJson()).toList()},
      );
      return (response.data!['data'] as List)
          .map((e) => NotificationTypeSetting.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
