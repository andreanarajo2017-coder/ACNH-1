import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_providers.dart';
import '../../l10n/app_localizations.dart';
import '../inbox/application/inbox_providers.dart';

/// F03 (capture): the AI parse/preview flow is M4–M5. Until then, "¿Qué
/// necesitas?" saves straight to the Inbox — the same honest fallback the
/// spec describes for when AI parsing fails or is unavailable.
Future<void> showCaptureSheet(BuildContext context, WidgetRef ref) {
  final l10n = AppLocalizations.of(context)!;
  final controller = TextEditingController();
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) {
      return Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.whatDoYouNeed, style: Theme.of(sheetContext).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(l10n.captureFallbackExplainer, style: Theme.of(sheetContext).textTheme.bodySmall),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              autofocus: true,
              maxLength: 1000,
              maxLines: 4,
              minLines: 2,
              decoration: InputDecoration(hintText: l10n.captureHint, border: const OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              icon: const Icon(Icons.inbox_outlined),
              label: Text(l10n.saveToInbox),
              onPressed: () async {
                final text = controller.text.trim();
                if (text.isEmpty) return;
                final navigator = Navigator.of(sheetContext);
                final messenger = ScaffoldMessenger.of(context);
                await ref.read(inboxApiProvider).create(text);
                ref.invalidate(unprocessedInboxProvider);
                navigator.pop();
                messenger.showSnackBar(SnackBar(content: Text(l10n.captureSaved)));
              },
            ),
          ],
        ),
      );
    },
  );
}
