import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/api_providers.dart';
import '../../../core/widgets/async_state_views.dart';
import '../../../l10n/app_localizations.dart';
import '../../ai/data/ai_models.dart';
import '../../home/capture_sheet.dart';
import '../application/inbox_providers.dart';
import '../data/inbox_models.dart';
import 'inbox_item_tile.dart';

// F05's "Organizar todo": one preview at a time, in order. Pushing and
// `await`-ing each route naturally sequences the queue — the next preview
// only opens once the previous one is confirmed or discarded (popped).
// Items that fail to parse are skipped (left unprocessed) rather than
// blocking the rest of the queue.
Future<void> _organizeAll(BuildContext context, WidgetRef ref) async {
  final items = await ref.read(inboxByStatusProvider(InboxStatus.unprocessed).future);
  for (final item in items) {
    if (!context.mounted) return;
    ParseResponse? response;
    try {
      response = await ref.read(aiApiProvider).parse(text: item.rawText, capturedAt: item.capturedAt);
    } on ApiException {
      response = null;
    }
    if (response == null || response.status == ParseStatus.error) continue;
    if (!context.mounted) return;
    await context.push('/capture/preview', extra: ParsePreviewArgs(response: response, inboxItemId: item.id));
  }
}

/// F05 (P0): manual capture list. AI-driven processing (turning an inbox
/// item into a task/event/shopping item) is M4–M5 — for now this is just a
/// list of what was captured, with discard/delete.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.inbox),
          actions: [
            Builder(
              builder: (context) => TextButton(
                onPressed: () => _organizeAll(context, ref),
                child: Text(l10n.inboxOrganizeAll, style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
              ),
            ),
          ],
          bottom: TabBar(
            tabs: [
              Tab(text: l10n.inboxUnprocessed),
              Tab(text: l10n.inboxProcessed),
              Tab(text: l10n.inboxDiscarded),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _InboxStatusList(status: InboxStatus.unprocessed, emptyMessage: l10n.inboxEmptyUnprocessed),
            _InboxStatusList(status: InboxStatus.processed, emptyMessage: l10n.inboxEmptyProcessed),
            _InboxStatusList(status: InboxStatus.discarded, emptyMessage: l10n.inboxEmptyDiscarded),
          ],
        ),
        floatingActionButton: Builder(
          builder: (context) => FloatingActionButton(
            onPressed: () => showCaptureSheet(context, ref),
            child: const Icon(Icons.add),
          ),
        ),
      ),
    );
  }
}

class _InboxStatusList extends ConsumerWidget {
  const _InboxStatusList({required this.status, required this.emptyMessage});

  final InboxStatus status;
  final String emptyMessage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(inboxByStatusProvider(status));
    return AsyncListView<InboxItem>(
      value: itemsAsync,
      emptyMessage: emptyMessage,
      emptyIcon: Icons.inbox_outlined,
      onRetry: () => ref.invalidate(inboxByStatusProvider(status)),
      itemBuilder: (context, item) => InboxItemTile(item: item),
    );
  }
}
