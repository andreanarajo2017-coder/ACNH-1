import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/page.dart';
import 'inbox_models.dart';

class InboxApi {
  InboxApi(this._dio);

  final Dio _dio;

  Future<Page<InboxItem>> list({InboxStatus? status, int limit = 100}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/v1/inbox',
        queryParameters: {'limit': limit, if (status != null) 'status': status.value},
      );
      return Page.fromJson(response.data!, InboxItem.fromJson);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<InboxItem> create(String rawText) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>('/v1/inbox', data: {'raw_text': rawText});
      return InboxItem.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<InboxItem> discard(String id) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/v1/inbox/$id',
        data: {'status': 'discarded'},
      );
      return InboxItem.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete('/v1/inbox/$id');
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
