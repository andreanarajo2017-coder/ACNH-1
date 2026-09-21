import 'package:dio/dio.dart';

import '../../../core/api/api_exception.dart';
import '../../people/data/people_models.dart';
import 'ai_models.dart';

class ClarificationAnswer {
  const ClarificationAnswer({required this.clarificationId, required this.value});

  final String clarificationId;
  final String value;

  Map<String, dynamic> toJson() => {'clarification_id': clarificationId, 'value': value};
}

class CreatePersonDraft {
  const CreatePersonDraft({required this.name, required this.relationship});

  final String name;
  final Relationship relationship;

  Map<String, dynamic> toJson() => {'name': name, 'relationship': relationship.value};
}

/// Section 8: the AI capture pipeline. `parse` never persists anything
/// (R-02) — only `commit` does, and only for items the user confirmed.
class AiApi {
  AiApi(this._dio);

  final Dio _dio;

  // AC-F03-03: 15s is the spec's own threshold for when the caller should
  // give up and offer "Guardar en Inbox" instead — longer than the app's
  // default 10s timeout (dio_client.dart) on purpose.
  static const _parseTimeout = Duration(seconds: 15);

  Future<ParseResponse> parse({
    String? text,
    String? parseId,
    List<ClarificationAnswer>? answers,
    DateTime? capturedAt,
    String? inboxItemId,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/ai/parse',
        data: {
          if (text != null) 'text': text,
          if (parseId != null) 'parse_id': parseId,
          if (answers != null) 'answers': answers.map((a) => a.toJson()).toList(),
          if (capturedAt != null) 'captured_at': capturedAt.toUtc().toIso8601String(),
          if (inboxItemId != null) 'inbox_item_id': inboxItemId,
        },
        options: Options(sendTimeout: _parseTimeout, receiveTimeout: _parseTimeout),
      );
      return ParseResponse.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<CommitResponse> commit(
    String parseId, {
    required List<ParsedItem> items,
    List<ParsedItemRelation> relations = const [],
    List<CreatePersonDraft>? createPeople,
    String? inboxItemId,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/ai/parse/$parseId/commit',
        data: {
          'items': items.map((i) => i.toJson()).toList(),
          'relations': relations.map((r) => r.toJson()).toList(),
          if (createPeople != null && createPeople.isNotEmpty)
            'create_people': createPeople.map((p) => p.toJson()).toList(),
          if (inboxItemId != null) 'inbox_item_id': inboxItemId,
        },
      );
      return CommitResponse.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
