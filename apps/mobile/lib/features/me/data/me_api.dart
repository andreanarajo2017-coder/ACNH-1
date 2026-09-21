import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';
import 'me_models.dart';

class MeApi {
  MeApi(this._dio);

  final Dio _dio;

  Future<Me> getMe() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/me');
      return Me.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Me> updateMe({
    String? displayName,
    String? timezone,
    String? locale,
    DateTime? onboardingCompletedAt,
  }) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/v1/me',
        data: {
          if (displayName != null) 'display_name': displayName,
          if (timezone != null) 'timezone': timezone,
          if (locale != null) 'locale': locale,
          if (onboardingCompletedAt != null)
            'onboarding_completed_at': onboardingCompletedAt.toUtc().toIso8601String(),
        },
      );
      return Me.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<void> deleteAccount() async {
    try {
      await _dio.delete('/v1/me');
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<UserSettings> getSettings() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/me/settings');
      return UserSettings.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<UserSettings> updateSettings({
    bool? dailySummaryEnabled,
    String? dailySummaryTime,
    int? maxPushPerDay,
  }) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/v1/me/settings',
        data: {
          if (dailySummaryEnabled != null) 'daily_summary_enabled': dailySummaryEnabled,
          if (dailySummaryTime != null) 'daily_summary_time': dailySummaryTime,
          if (maxPushPerDay != null) 'max_push_per_day': maxPushPerDay,
        },
      );
      return UserSettings.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
