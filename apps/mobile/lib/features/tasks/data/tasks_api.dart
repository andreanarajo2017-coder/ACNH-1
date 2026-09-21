import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/page.dart';
import 'task_models.dart';

class TasksApi {
  TasksApi(this._dio);

  final Dio _dio;

  Future<Page<Task>> list({
    TaskStatus? status,
    String? dueFrom,
    String? dueTo,
    String? categoryId,
    String? personId,
    String? q,
    int limit = 100,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/v1/tasks',
        queryParameters: {
          'limit': limit,
          if (status != null) 'status': status.value,
          if (dueFrom != null) 'due_from': dueFrom,
          if (dueTo != null) 'due_to': dueTo,
          if (categoryId != null) 'category_id': categoryId,
          if (personId != null) 'person_id': personId,
          if (q != null && q.isNotEmpty) 'q': q,
        },
      );
      return Page.fromJson(response.data!, Task.fromJson);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Task> get(String id) => _fetch('/v1/tasks/$id');

  Future<Task> create({
    required String title,
    String? description,
    TaskPriority? priority,
    String? categoryId,
    String? personId,
    String? locationText,
    String? dueDate,
    DateTime? dueAt,
    int? estimatedMinutes,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/tasks',
        data: {
          'title': title,
          if (description != null) 'description': description,
          if (priority != null) 'priority': priority.value,
          if (categoryId != null) 'category_id': categoryId,
          if (personId != null) 'person_id': personId,
          if (locationText != null) 'location_text': locationText,
          if (dueDate != null) 'due_date': dueDate,
          if (dueAt != null) 'due_at': dueAt.toUtc().toIso8601String(),
          if (estimatedMinutes != null) 'estimated_minutes': estimatedMinutes,
        },
      );
      return Task.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Task> update(
    String id, {
    String? title,
    String? description,
    TaskPriority? priority,
    String? categoryId,
    String? personId,
    String? locationText,
    String? dueDate,
    DateTime? dueAt,
    int? estimatedMinutes,
  }) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/v1/tasks/$id',
        data: {
          if (title != null) 'title': title,
          if (description != null) 'description': description,
          if (priority != null) 'priority': priority.value,
          if (categoryId != null) 'category_id': categoryId,
          if (personId != null) 'person_id': personId,
          if (locationText != null) 'location_text': locationText,
          if (dueDate != null) 'due_date': dueDate,
          if (dueAt != null) 'due_at': dueAt.toUtc().toIso8601String(),
          if (estimatedMinutes != null) 'estimated_minutes': estimatedMinutes,
        },
      );
      return Task.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete('/v1/tasks/$id');
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Task> complete(String id) => _post('/v1/tasks/$id/complete');
  Future<Task> reopen(String id) => _post('/v1/tasks/$id/reopen');

  Future<Task> postponeLaterToday(String id) => _postpone(id, {'preset': 'later_today'});
  Future<Task> postponeTomorrow(String id) => _postpone(id, {'preset': 'tomorrow'});
  Future<Task> postponeNextWeek(String id) => _postpone(id, {'preset': 'next_week'});
  Future<Task> postponeUntil(String id, DateTime until) =>
      _postpone(id, {'until': until.toUtc().toIso8601String()});

  Future<Task> _postpone(String id, Map<String, dynamic> body) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>('/v1/tasks/$id/postpone', data: body);
      return Task.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Task> _post(String path) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(path);
      return Task.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Task> _fetch(String path) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(path);
      return Task.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
