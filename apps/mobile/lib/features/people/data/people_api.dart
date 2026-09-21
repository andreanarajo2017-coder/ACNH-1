import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/page.dart';
import 'people_models.dart';

class PeopleApi {
  PeopleApi(this._dio);

  final Dio _dio;

  Future<Page<Person>> list({int limit = 100}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/people', queryParameters: {'limit': limit});
      return Page.fromJson(response.data!, Person.fromJson);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Person> get(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/people/$id');
      return Person.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Person> create({
    required String name,
    required Relationship relationship,
    List<String>? aliases,
    String? birthday,
    String? notes,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/people',
        data: {
          'name': name,
          'relationship': relationship.value,
          if (aliases != null) 'aliases': aliases,
          if (birthday != null) 'birthday': birthday,
          if (notes != null) 'notes': notes,
        },
      );
      return Person.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Person> update(
    String id, {
    String? name,
    Relationship? relationship,
    List<String>? aliases,
    String? birthday,
    String? notes,
  }) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/v1/people/$id',
        data: {
          if (name != null) 'name': name,
          if (relationship != null) 'relationship': relationship.value,
          if (aliases != null) 'aliases': aliases,
          if (birthday != null) 'birthday': birthday,
          if (notes != null) 'notes': notes,
        },
      );
      return Person.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete('/v1/people/$id');
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
