import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/page.dart';
import 'category_model.dart';

class CategoriesApi {
  CategoriesApi(this._dio);

  final Dio _dio;

  Future<Page<Category>> list({int limit = 100}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/v1/categories',
        queryParameters: {'limit': limit},
      );
      return Page.fromJson(response.data!, Category.fromJson);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
