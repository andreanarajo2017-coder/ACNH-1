import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/async_state_views.dart';
import '../../../l10n/app_localizations.dart';
import '../../home/capture_sheet.dart';
import '../application/inbox_providers.dart';
import '../data/inbox_models.dart';
import 'inbox_item_tile.dart';

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
