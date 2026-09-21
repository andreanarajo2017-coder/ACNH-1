import '../../tasks/data/task_models.dart' show TaskPriority;

enum ItemKind {
  event('event'),
  task('task'),
  shoppingItem('shopping_item');

  const ItemKind(this.value);
  final String value;

  static ItemKind fromJson(String value) =>
      ItemKind.values.firstWhere((k) => k.value == value, orElse: () => ItemKind.task);
}

enum RelationType {
  after('after'),
  before('before'),
  related('related');

  const RelationType(this.value);
  final String value;

  static RelationType fromJson(String value) =>
      RelationType.values.firstWhere((r) => r.value == value, orElse: () => RelationType.related);
}

enum ClarificationAnswerType {
  time('time'),
  date('date'),
  choice('choice'),
  text('text');

  const ClarificationAnswerType(this.value);
  final String value;

  static ClarificationAnswerType fromJson(String value) => ClarificationAnswerType.values.firstWhere(
    (t) => t.value == value,
    orElse: () => ClarificationAnswerType.text,
  );
}

enum ParseStatus {
  ready('ready'),
  needsClarification('needs_clarification'),
  noActionableItems('no_actionable_items'),
  error('error');

  const ParseStatus(this.value);
  final String value;

  static ParseStatus fromJson(String value) =>
      ParseStatus.values.firstWhere((s) => s.value == value, orElse: () => ParseStatus.error);
}

class ClarificationOption {
  const ClarificationOption({required this.label, required this.value});

  final String label;
  final String value;

  factory ClarificationOption.fromJson(Map<String, dynamic> json) =>
      ClarificationOption(label: json['label'] as String, value: json['value'] as String);
}

class Clarification {
  const Clarification({
    required this.id,
    required this.itemRef,
    required this.field,
    required this.question,
    required this.answerType,
    required this.options,
  });

  final String id;
  final String itemRef;
  final String field;
  final String question;
  final ClarificationAnswerType answerType;
  final List<ClarificationOption>? options;

  factory Clarification.fromJson(Map<String, dynamic> json) => Clarification(
    id: json['id'] as String,
    itemRef: json['item_ref'] as String,
    field: json['field'] as String,
    question: json['question'] as String,
    answerType: ClarificationAnswerType.fromJson(json['answer_type'] as String),
    options: (json['options'] as List?)
        ?.map((o) => ClarificationOption.fromJson(o as Map<String, dynamic>))
        .toList(),
  );
}

class ParsedItemRelation {
  const ParsedItemRelation({required this.from, required this.to, required this.type});

  final String from;
  final String to;
  final RelationType type;

  factory ParsedItemRelation.fromJson(Map<String, dynamic> json) => ParsedItemRelation(
    from: json['from'] as String,
    to: json['to'] as String,
    type: RelationType.fromJson(json['type'] as String),
  );

  Map<String, dynamic> toJson() => {'from': from, 'to': to, 'type': type.value};
}

/// Mirrors `ParsedItem` (spec 8.3) — the draft shape shared by
/// `POST /v1/ai/parse`'s response and `POST /v1/ai/parse/{id}/commit`'s
/// request. `missing_fields` gates confirmation (R-01/R-02): an item with a
/// non-empty list can't be committed until it's resolved (an answered
/// clarification or a manual edit) or removed from the preview.
class ParsedItem {
  const ParsedItem({
    required this.ref,
    required this.kind,
    required this.title,
    this.startAt,
    this.endAt,
    this.allDay,
    this.startDate,
    this.dueDate,
    this.dueAt,
    this.estimatedMinutes,
    this.listHint,
    this.quantity,
    this.personId,
    this.personNameUnresolved,
    this.categoryId,
    this.locationText,
    this.priority,
    this.recurrenceRule,
    this.notes,
    required this.missingFields,
    required this.inferredFields,
    required this.flags,
    this.sourceSpan,
  });

  final String ref;
  final ItemKind kind;
  final String title;
  final DateTime? startAt;
  final DateTime? endAt;
  final bool? allDay;
  final String? startDate;
  final String? dueDate;
  final DateTime? dueAt;
  final int? estimatedMinutes;
  final String? listHint;
  final String? quantity;
  final String? personId;
  final String? personNameUnresolved;
  final String? categoryId;
  final String? locationText;
  final TaskPriority? priority;
  final String? recurrenceRule;
  final String? notes;
  final List<String> missingFields;
  final List<String> inferredFields;
  final List<String> flags;
  final String? sourceSpan;

  bool get isReady => missingFields.isEmpty;
  bool get isInPast => flags.contains('in_past');
  bool isInferred(String field) => inferredFields.contains(field);

  factory ParsedItem.fromJson(Map<String, dynamic> json) => ParsedItem(
    ref: json['ref'] as String,
    kind: ItemKind.fromJson(json['kind'] as String),
    title: json['title'] as String? ?? '',
    startAt: json['start_at'] != null ? DateTime.parse(json['start_at'] as String) : null,
    endAt: json['end_at'] != null ? DateTime.parse(json['end_at'] as String) : null,
    allDay: json['all_day'] as bool?,
    startDate: json['start_date'] as String?,
    dueDate: json['due_date'] as String?,
    dueAt: json['due_at'] != null ? DateTime.parse(json['due_at'] as String) : null,
    estimatedMinutes: json['estimated_minutes'] as int?,
    listHint: json['list_hint'] as String?,
    quantity: json['quantity'] as String?,
    personId: json['person_id'] as String?,
    personNameUnresolved: json['person_name_unresolved'] as String?,
    categoryId: json['category_id'] as String?,
    locationText: json['location_text'] as String?,
    priority: json['priority'] != null ? TaskPriority.fromJson(json['priority'] as String) : null,
    recurrenceRule: json['recurrence_rule'] as String?,
    notes: json['notes'] as String?,
    missingFields: (json['missing_fields'] as List? ?? const []).cast<String>(),
    inferredFields: (json['inferred_fields'] as List? ?? const []).cast<String>(),
    flags: (json['flags'] as List? ?? const []).cast<String>(),
    sourceSpan: json['source_span'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'ref': ref,
    'kind': kind.value,
    'title': title,
    if (startAt != null) 'start_at': startAt!.toUtc().toIso8601String(),
    if (endAt != null) 'end_at': endAt!.toUtc().toIso8601String(),
    if (allDay != null) 'all_day': allDay,
    if (startDate != null) 'start_date': startDate,
    if (dueDate != null) 'due_date': dueDate,
    if (dueAt != null) 'due_at': dueAt!.toUtc().toIso8601String(),
    if (estimatedMinutes != null) 'estimated_minutes': estimatedMinutes,
    if (listHint != null) 'list_hint': listHint,
    if (quantity != null) 'quantity': quantity,
    if (personId != null) 'person_id': personId,
    if (personNameUnresolved != null) 'person_name_unresolved': personNameUnresolved,
    if (categoryId != null) 'category_id': categoryId,
    if (locationText != null) 'location_text': locationText,
    if (priority != null) 'priority': priority!.value,
    if (recurrenceRule != null) 'recurrence_rule': recurrenceRule,
    if (notes != null) 'notes': notes,
    'missing_fields': missingFields,
    'inferred_fields': inferredFields,
    'flags': flags,
    if (sourceSpan != null) 'source_span': sourceSpan,
  };

  ParsedItem copyWith({
    String? title,
    DateTime? startAt,
    bool clearStartAt = false,
    DateTime? endAt,
    bool clearEndAt = false,
    bool? allDay,
    String? startDate,
    bool clearStartDate = false,
    String? dueDate,
    bool clearDueDate = false,
    DateTime? dueAt,
    bool clearDueAt = false,
    int? estimatedMinutes,
    String? personId,
    bool clearPersonId = false,
    String? personNameUnresolved,
    bool clearPersonNameUnresolved = false,
    String? categoryId,
    bool clearCategoryId = false,
    String? locationText,
    TaskPriority? priority,
    List<String>? missingFields,
  }) {
    return ParsedItem(
      ref: ref,
      kind: kind,
      title: title ?? this.title,
      startAt: clearStartAt ? null : (startAt ?? this.startAt),
      endAt: clearEndAt ? null : (endAt ?? this.endAt),
      allDay: allDay ?? this.allDay,
      startDate: clearStartDate ? null : (startDate ?? this.startDate),
      dueDate: clearDueDate ? null : (dueDate ?? this.dueDate),
      dueAt: clearDueAt ? null : (dueAt ?? this.dueAt),
      estimatedMinutes: estimatedMinutes ?? this.estimatedMinutes,
      listHint: listHint,
      quantity: quantity,
      personId: clearPersonId ? null : (personId ?? this.personId),
      personNameUnresolved: clearPersonNameUnresolved ? null : (personNameUnresolved ?? this.personNameUnresolved),
      categoryId: clearCategoryId ? null : (categoryId ?? this.categoryId),
      locationText: locationText ?? this.locationText,
      priority: priority ?? this.priority,
      recurrenceRule: recurrenceRule,
      notes: notes,
      missingFields: missingFields ?? this.missingFields,
      inferredFields: inferredFields,
      flags: flags,
      sourceSpan: sourceSpan,
    );
  }
}

class ParseResponse {
  const ParseResponse({
    required this.parseId,
    required this.status,
    required this.items,
    required this.relations,
    required this.clarifications,
    required this.expiresAt,
  });

  final String parseId;
  final ParseStatus status;
  final List<ParsedItem> items;
  final List<ParsedItemRelation> relations;
  final List<Clarification> clarifications;
  final DateTime expiresAt;

  factory ParseResponse.fromJson(Map<String, dynamic> json) => ParseResponse(
    parseId: json['parse_id'] as String,
    status: ParseStatus.fromJson(json['status'] as String),
    items: (json['items'] as List).map((i) => ParsedItem.fromJson(i as Map<String, dynamic>)).toList(),
    relations: (json['relations'] as List)
        .map((r) => ParsedItemRelation.fromJson(r as Map<String, dynamic>))
        .toList(),
    clarifications: (json['clarifications'] as List)
        .map((c) => Clarification.fromJson(c as Map<String, dynamic>))
        .toList(),
    expiresAt: DateTime.parse(json['expires_at'] as String),
  );
}

class CommitCreatedRef {
  const CommitCreatedRef({required this.ref, required this.id});

  final String ref;
  final String id;

  factory CommitCreatedRef.fromJson(Map<String, dynamic> json) =>
      CommitCreatedRef(ref: json['ref'] as String, id: json['id'] as String);
}

class CommitCreatedPerson {
  const CommitCreatedPerson({required this.id, required this.name});

  final String id;
  final String name;

  factory CommitCreatedPerson.fromJson(Map<String, dynamic> json) =>
      CommitCreatedPerson(id: json['id'] as String, name: json['name'] as String);
}

/// Everything `/capture/preview` needs beyond the parse result itself —
/// see `ParsePreviewScreen`'s doc comment for what `sourceText` and
/// `inboxItemId` each unlock on Descartar/commit.
class ParsePreviewArgs {
  const ParsePreviewArgs({required this.response, this.sourceText, this.inboxItemId});

  final ParseResponse response;
  final String? sourceText;
  final String? inboxItemId;
}

class CommitResponse {
  const CommitResponse({
    required this.parseId,
    required this.createdTasks,
    required this.createdEvents,
    required this.createdPeople,
    required this.relationsCreated,
  });

  final String parseId;
  final List<CommitCreatedRef> createdTasks;
  final List<CommitCreatedRef> createdEvents;
  final List<CommitCreatedPerson> createdPeople;
  final int relationsCreated;

  factory CommitResponse.fromJson(Map<String, dynamic> json) {
    final created = json['created'] as Map<String, dynamic>;
    return CommitResponse(
      parseId: json['parse_id'] as String,
      createdTasks: (created['tasks'] as List).map((t) => CommitCreatedRef.fromJson(t as Map<String, dynamic>)).toList(),
      createdEvents: (created['events'] as List)
          .map((e) => CommitCreatedRef.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdPeople: (created['people'] as List)
          .map((p) => CommitCreatedPerson.fromJson(p as Map<String, dynamic>))
          .toList(),
      relationsCreated: json['relations_created'] as int,
    );
  }
}
