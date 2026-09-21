/// Mirrors the API's cursor pagination envelope (section 7):
/// `{ data: [...], next_cursor: string | null }`.
class Page<T> {
  const Page({required this.data, required this.nextCursor});

  final List<T> data;
  final String? nextCursor;

  factory Page.fromJson(Map<String, dynamic> json, T Function(Map<String, dynamic>) fromJson) {
    return Page(
      data: (json['data'] as List).map((e) => fromJson(e as Map<String, dynamic>)).toList(),
      nextCursor: json['next_cursor'] as String?,
    );
  }
}
