import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../../../l10n/app_localizations.dart';
import '../application/inbox_providers.dart';
import '../data/inbox_models.dart';

class InboxItemTile extends ConsumerWidget {
  const InboxItemTile({super.key, required this.item});

  final InboxItem item;

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.inboxDeleteTitle),
        content: Text(l10n.inboxDeleteConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: Text(l10n.cancel)),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: Text(l10n.delete)),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(inboxApiProvider).delete(item.id);
    _invalidateAll(ref);
  }

  Future<void> _discard(WidgetRef ref) async {
    await ref.read(inboxApiProvider).discard(item.id);
    _invalidateAll(ref);
  }

  void _invalidateAll(WidgetRef ref) {
    ref.invalidate(unprocessedInboxProvider);
    for (final status in InboxStatus.values) {
      ref.invalidate(inboxByStatusProvider(status));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final date = item.capturedAt;
    final subtitle =
        '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year} '
        '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';

    return ListTile(
      leading: const Icon(Icons.mail_outline),
      title: Text(item.rawText),
      subtitle: Text(subtitle),
      trailing: PopupMenuButton<String>(
        onSelected: (value) {
          if (value == 'discard') _discard(ref);
          if (value == 'delete') _delete(context, ref);
        },
        itemBuilder: (context) => [
          if (item.status == InboxStatus.unprocessed)
            PopupMenuItem(value: 'discard', child: Text(l10n.inboxDiscard)),
          PopupMenuItem(value: 'delete', child: Text(l10n.delete)),
        ],
      ),
    );
  }
}
