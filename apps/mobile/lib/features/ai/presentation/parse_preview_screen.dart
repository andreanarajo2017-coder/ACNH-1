import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/api_providers.dart';
import '../../../l10n/app_localizations.dart';
import '../../categories/application/categories_providers.dart';
import '../../events/application/calendar_providers.dart';
import '../../inbox/application/inbox_providers.dart';
import '../../people/application/people_providers.dart';
import '../../people/data/people_models.dart';
import '../../people/presentation/relationship_label.dart';
import '../../tasks/application/tasks_providers.dart';
import '../data/ai_api.dart';
import '../data/ai_models.dart';
import 'edit_parsed_item_sheet.dart';

const _maxClarificationRounds = 3;

/// F04's preview screen: one card per parsed item (editable, removable),
/// relations in plain language, one clarification at a time (max 3
/// rounds — after that the user finishes by hand via "editar ítem"),
/// Confirmar → commit, Descartar → optionally keep the raw text in the
/// Inbox (R-02: nothing persists before this screen's Confirmar).
class ParsePreviewScreen extends ConsumerStatefulWidget {
  const ParsePreviewScreen({super.key, required this.initial, this.sourceText, this.inboxItemId});

  final ParseResponse initial;

  /// Set when this came straight from "¿Qué necesitas?" — lets Descartar
  /// offer "Guardar en Inbox" for the original text (not saved yet).
  final String? sourceText;

  /// Set when this came from "Organizar con IA" on an existing Inbox item —
  /// commit marks that item processed; the raw text is already safe, so
  /// Descartar doesn't need a save option here.
  final String? inboxItemId;

  @override
  ConsumerState<ParsePreviewScreen> createState() => _ParsePreviewScreenState();
}

class _ParsePreviewScreenState extends ConsumerState<ParsePreviewScreen> {
  late final String _parseId = widget.initial.parseId;
  late List<ParsedItem> _items = List.of(widget.initial.items);
  late List<ParsedItemRelation> _relations = List.of(widget.initial.relations);
  late List<Clarification> _clarifications = List.of(widget.initial.clarifications);
  int _clarificationRounds = 0;
  final Set<String> _peopleToCreate = {};
  final Map<String, Relationship> _peopleRelationships = {};
  bool _busy = false;
  String? _errorMessage;

  bool get _clarificationLimitReached => _clarificationRounds >= _maxClarificationRounds;

  // Shows clarifications in the same order their items appear.
  Clarification? get _currentClarification {
    if (_clarificationLimitReached) return null;
    for (final item in _items) {
      final match = _clarifications.where((c) => c.itemRef == item.ref);
      if (match.isNotEmpty) return match.first;
    }
    return null;
  }

  bool get _canConfirm =>
      _items.isNotEmpty && _items.every((i) => i.isReady) && !_items.any((i) => i.kind == ItemKind.shoppingItem);

  void _removeItem(String ref) {
    setState(() {
      _items = _items.where((i) => i.ref != ref).toList();
      _relations = _relations.where((r) => r.from != ref && r.to != ref).toList();
      _clarifications = _clarifications.where((c) => c.itemRef != ref).toList();
    });
  }

  Future<void> _editItem(ParsedItem item) async {
    final categories = await ref.read(categoriesListProvider.future);
    final people = await ref.read(peopleListProvider.future);
    if (!mounted) return;
    final edited = await showEditParsedItemSheet(context, item: item, categories: categories, people: people);
    if (edited == null) return;
    setState(() {
      _items = _items.map((i) => i.ref == edited.ref ? edited : i).toList();
      _clarifications = _clarifications.where((c) => c.itemRef != edited.ref).toList();
    });
  }

  Future<void> _addPerson(ParsedItem item) async {
    final name = item.personNameUnresolved;
    if (name == null) return;
    final l10n = AppLocalizations.of(context)!;
    final relationship = await showModalBottomSheet<Relationship>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(padding: const EdgeInsets.all(16), child: Text(l10n.aiAddPersonRelationship(name))),
            for (final r in Relationship.values)
              ListTile(title: Text(relationshipLabel(l10n, r)), onTap: () => Navigator.of(sheetContext).pop(r)),
          ],
        ),
      ),
    );
    if (relationship == null) return;
    setState(() {
      _peopleToCreate.add(name);
      _peopleRelationships[name] = relationship;
    });
  }

  Future<void> _answerClarification(Clarification clarification, String value) async {
    setState(() {
      _busy = true;
      _errorMessage = null;
    });
    try {
      final response = await ref.read(aiApiProvider).parse(
        parseId: _parseId,
        answers: [ClarificationAnswer(clarificationId: clarification.id, value: value)],
      );
      if (!mounted) return;
      setState(() {
        _items = response.items;
        _relations = response.relations;
        _clarifications = response.clarifications;
        _clarificationRounds++;
      });
    } on ApiException {
      if (mounted) setState(() => _errorMessage = AppLocalizations.of(context)!.genericError);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    if (!_canConfirm) return;
    setState(() {
      _busy = true;
      _errorMessage = null;
    });
    try {
      final createPeople = _peopleToCreate
          .map((name) => CreatePersonDraft(name: name, relationship: _peopleRelationships[name] ?? Relationship.other))
          .toList();
      await ref
          .read(aiApiProvider)
          .commit(
            _parseId,
            items: _items,
            relations: _relations,
            createPeople: createPeople.isEmpty ? null : createPeople,
            inboxItemId: widget.inboxItemId,
          );
      ref.invalidate(tasksProvider(noTaskFilter));
      ref.invalidate(calendarRangeProvider);
      ref.invalidate(peopleListProvider);
      ref.invalidate(unprocessedInboxProvider);
      if (mounted) context.pop();
    } on ApiException {
      if (mounted) setState(() => _errorMessage = AppLocalizations.of(context)!.genericError);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _discard() async {
    final l10n = AppLocalizations.of(context)!;
    if (widget.inboxItemId != null) {
      // The raw text is already safe in the Inbox; leaving just cancels
      // this attempt at organizing it.
      context.pop();
      return;
    }

    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.inbox_outlined),
              title: Text(l10n.saveToInbox),
              onTap: () => Navigator.of(sheetContext).pop('save'),
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: Text(l10n.aiPreviewDiscard),
              onTap: () => Navigator.of(sheetContext).pop('discard'),
            ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    if (choice == 'save' && widget.sourceText != null) {
      await ref.read(inboxApiProvider).create(widget.sourceText!);
      ref.invalidate(unprocessedInboxProvider);
    }
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final clarification = _currentClarification;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.aiPreviewTitle),
        actions: [
          TextButton(onPressed: _busy ? null : _discard, child: Text(l10n.aiPreviewDiscard)),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (clarification != null)
              IgnorePointer(
                ignoring: _busy,
                child: _ClarificationBanner(clarification: clarification, onAnswer: _answerClarification),
              ),
            if (_clarificationLimitReached && _clarifications.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(l10n.aiClarificationRoundsExceeded, style: Theme.of(context).textTheme.bodySmall),
              ),
            Expanded(
              child: IgnorePointer(
                ignoring: _busy,
                child: _items.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(l10n.aiPreviewEmpty, textAlign: TextAlign.center),
                        ),
                      )
                    : ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          for (final item in _items)
                            _ParsedItemCard(
                              item: item,
                              personCreated:
                                  item.personNameUnresolved != null && _peopleToCreate.contains(item.personNameUnresolved),
                              onEdit: () => _editItem(item),
                              onRemove: () => _removeItem(item.ref),
                              onAddPerson: () => _addPerson(item),
                            ),
                          if (_relations.isNotEmpty) _RelationsList(items: _items, relations: _relations),
                        ],
                      ),
              ),
            ),
            if (_errorMessage != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(_errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: FilledButton(
                onPressed: (_busy || !_canConfirm) ? null : _confirm,
                child: _busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(l10n.aiPreviewConfirm),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ClarificationBanner extends StatefulWidget {
  const _ClarificationBanner({required this.clarification, required this.onAnswer});

  final Clarification clarification;
  final void Function(Clarification, String) onAnswer;

  @override
  State<_ClarificationBanner> createState() => _ClarificationBannerState();
}

class _ClarificationBannerState extends State<_ClarificationBanner> {
  final _textController = TextEditingController();

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _pickDate(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (picked != null) {
      final value =
          '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      widget.onAnswer(widget.clarification, value);
    }
  }

  Future<void> _pickTime(BuildContext context) async {
    final picked = await showTimePicker(context: context, initialTime: TimeOfDay.now());
    if (picked != null) {
      final value = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
      widget.onAnswer(widget.clarification, value);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final clarification = widget.clarification;
    return Card(
      margin: const EdgeInsets.all(16),
      color: Theme.of(context).colorScheme.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(clarification.question, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            switch (clarification.answerType) {
              ClarificationAnswerType.choice => Column(
                children: [
                  for (final option in clarification.options ?? const [])
                    ListTile(
                      title: Text(option.label),
                      onTap: () => widget.onAnswer(clarification, option.value),
                    ),
                ],
              ),
              ClarificationAnswerType.date => OutlinedButton.icon(
                icon: const Icon(Icons.calendar_today_outlined),
                label: Text(l10n.tasksPickDate),
                onPressed: () => _pickDate(context),
              ),
              ClarificationAnswerType.time => OutlinedButton.icon(
                icon: const Icon(Icons.access_time),
                label: Text(l10n.tasksPickTime),
                onPressed: () => _pickTime(context),
              ),
              ClarificationAnswerType.text => Row(
                children: [
                  Expanded(child: TextField(controller: _textController)),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: () {
                      final value = _textController.text.trim();
                      if (value.isNotEmpty) widget.onAnswer(clarification, value);
                    },
                    child: Text(l10n.aiAnswerSubmit),
                  ),
                ],
              ),
            },
          ],
        ),
      ),
    );
  }
}

class _ParsedItemCard extends StatelessWidget {
  const _ParsedItemCard({
    required this.item,
    required this.personCreated,
    required this.onEdit,
    required this.onRemove,
    required this.onAddPerson,
  });

  final ParsedItem item;
  final bool personCreated;
  final VoidCallback onEdit;
  final VoidCallback onRemove;
  final VoidCallback onAddPerson;

  IconData get _kindIcon => switch (item.kind) {
    ItemKind.event => Icons.event_outlined,
    ItemKind.task => Icons.check_circle_outline,
    ItemKind.shoppingItem => Icons.shopping_cart_outlined,
  };

  String? _subtitle(AppLocalizations l10n) {
    final instant = item.startAt ?? item.dueAt;
    if (instant != null) {
      return '${instant.day}/${instant.month} ${instant.hour.toString().padLeft(2, '0')}:${instant.minute.toString().padLeft(2, '0')}';
    }
    final dateOnly = item.startDate ?? item.dueDate;
    if (dateOnly != null) return dateOnly;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final subtitle = _subtitle(l10n);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(_kindIcon),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.title, style: Theme.of(context).textTheme.titleMedium),
                      if (subtitle != null)
                        Row(
                          children: [
                            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
                            if (item.isInferred('due_date') || item.isInferred('start_at')) ...[
                              const SizedBox(width: 6),
                              _InferredChip(label: l10n.aiPreviewInferred),
                            ],
                            if (item.isInPast) ...[
                              const SizedBox(width: 6),
                              Icon(Icons.warning_amber_outlined, size: 14, color: Theme.of(context).colorScheme.error),
                            ],
                          ],
                        ),
                    ],
                  ),
                ),
                IconButton(icon: const Icon(Icons.edit_outlined), onPressed: onEdit),
                IconButton(icon: const Icon(Icons.close), onPressed: onRemove, tooltip: l10n.aiPreviewRemoveItem),
              ],
            ),
            if (item.kind == ItemKind.shoppingItem)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(l10n.aiShoppingNotYet, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            if (item.personNameUnresolved != null && item.personId == null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(
                  spacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Chip(label: Text(l10n.aiPersonUnresolved(item.personNameUnresolved!))),
                    if (!personCreated)
                      TextButton(onPressed: onAddPerson, child: Text(l10n.aiAddPerson))
                    else
                      Icon(Icons.check_circle, size: 18, color: Theme.of(context).colorScheme.primary),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _InferredChip extends StatelessWidget {
  const _InferredChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}

class _RelationsList extends StatelessWidget {
  const _RelationsList({required this.items, required this.relations});

  final List<ParsedItem> items;
  final List<ParsedItemRelation> relations;

  String? _titleOf(String ref) {
    final matches = items.where((i) => i.ref == ref);
    return matches.isEmpty ? null : matches.first.title;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final lines = <String>[];
    for (final relation in relations) {
      final fromTitle = _titleOf(relation.from);
      final toTitle = _titleOf(relation.to);
      if (fromTitle == null || toTitle == null) continue;
      final text = switch (relation.type) {
        RelationType.after => l10n.aiRelationAfter(fromTitle, toTitle),
        RelationType.before => l10n.aiRelationBefore(fromTitle, toTitle),
        RelationType.related => l10n.aiRelationRelated(fromTitle, toTitle),
      };
      lines.add(text);
    }
    if (lines.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final line in lines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(line, style: Theme.of(context).textTheme.bodySmall),
            ),
        ],
      ),
    );
  }
}
