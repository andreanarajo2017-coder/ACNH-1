enum InboxStatus {
  unprocessed('unprocessed'),
  processed('processed'),
  discarded('discarded');

  const InboxStatus(this.value);
  final String value;

  static InboxStatus fromJson(String value) =>
      InboxStatus.values.firstWhere((s) => s.value == value, orElse: () => InboxStatus.unprocessed);
}

class InboxItem {
  const InboxItem({required this.id, required this.rawText, required this.status, required this.capturedAt});

  final String id;
  final String rawText;
  final InboxStatus status;
  final DateTime capturedAt;

  factory InboxItem.fromJson(Map<String, dynamic> json) => InboxItem(
    id: json['id'] as String,
    rawText: json['raw_text'] as String,
    status: InboxStatus.fromJson(json['status'] as String),
    capturedAt: DateTime.parse(json['captured_at'] as String),
  );
}
