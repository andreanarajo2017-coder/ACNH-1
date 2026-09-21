import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/page.dart';
import 'event_models.dart';

class EventsApi {
  EventsApi(this._dio);

  final Dio _dio;

  Future<Page<Event>> list({int limit = 100}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/events', queryParameters: {'limit': limit});
      return Page.fromJson(response.data!, Event.fromJson);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Event> create({
    required String title,
    bool allDay = false,
    DateTime? startAt,
    DateTime? endAt,
    String? startDate,
    String? locationText,
    String? personId,
    String? categoryId,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/events',
        data: {
          'title': title,
          'all_day': allDay,
          if (startAt != null) 'start_at': startAt.toUtc().toIso8601String(),
          if (endAt != null) 'end_at': endAt.toUtc().toIso8601String(),
          if (startDate != null) 'start_date': startDate,
          if (locationText != null) 'location_text': locationText,
          if (personId != null) 'person_id': personId,
          if (categoryId != null) 'category_id': categoryId,
        },
      );
      return Event.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Event> update(
    String id, {
    String? title,
    DateTime? startAt,
    DateTime? endAt,
    String? locationText,
    String? personId,
    String? categoryId,
  }) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/v1/events/$id',
        data: {
          if (title != null) 'title': title,
          if (startAt != null) 'start_at': startAt.toUtc().toIso8601String(),
          if (endAt != null) 'end_at': endAt.toUtc().toIso8601String(),
          if (locationText != null) 'location_text': locationText,
          if (personId != null) 'person_id': personId,
          if (categoryId != null) 'category_id': categoryId,
        },
      );
      return Event.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete('/v1/events/$id');
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}

class CalendarApi {
  CalendarApi(this._dio);

  final Dio _dio;

  Future<List<CalendarItem>> range({required DateTime from, required DateTime to}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/v1/calendar',
        queryParameters: {'from': from.toUtc().toIso8601String(), 'to': to.toUtc().toIso8601String()},
      );
      return (response.data!['data'] as List)
          .map((e) => CalendarItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
