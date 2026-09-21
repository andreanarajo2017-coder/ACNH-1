import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/api_providers.dart';
import '../../l10n/app_localizations.dart';
import '../ai/data/ai_models.dart';
import '../inbox/application/inbox_providers.dart';

/// F03: "¿Qué necesitas?" sends the capture to `POST /v1/ai/parse` (F04).
/// On success it hands off to the preview screen (`/capture/preview`); on
/// timeout or failure (AC-F03-03) it falls back to saving the raw text in
/// the Inbox — the text is never lost either way.
Future<void> showCaptureSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (sheetContext) => _CaptureSheetContent(outerContext: context),
  );
}

class _CaptureSheetContent extends ConsumerStatefulWidget {
  const _CaptureSheetContent({required this.outerContext});

  /// The screen that opened the sheet (e.g. Home) — used to navigate to the
  /// preview screen after this sheet closes, since this widget's own
  /// context is torn down with the sheet.
  final BuildContext outerContext;

  @override
  ConsumerState<_CaptureSheetContent> createState() => _CaptureSheetContentState();
}

class _CaptureSheetContentState extends ConsumerState<_CaptureSheetContent> {
  final _controller = TextEditingController();
  bool _submitting = false;
  bool _failed = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _submitting = true;
      _failed = false;
    });

    ParseResponse? parsed;
    try {
      parsed = await ref.read(aiApiProvider).parse(text: text);
    } on ApiException {
      parsed = null;
    }

    if (!mounted) return;
    if (parsed == null || parsed.status == ParseStatus.error) {
      setState(() {
        _submitting = false;
        _failed = true;
      });
      return;
    }

    final outer = widget.outerContext;
    Navigator.of(context).pop();
    if (!outer.mounted) return;
    outer.push('/capture/preview', extra: ParsePreviewArgs(response: parsed, sourceText: text));
  }

  Future<void> _saveToInbox() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    final outer = widget.outerContext;
    final l10n = AppLocalizations.of(context)!;
    final messenger = ScaffoldMessenger.of(outer);
    await ref.read(inboxApiProvider).create(text);
    ref.invalidate(unprocessedInboxProvider);
    if (mounted) Navigator.of(context).pop();
    if (outer.mounted) messenger.showSnackBar(SnackBar(content: Text(l10n.captureSaved)));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.whatDoYouNeed, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(l10n.captureExplainer, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            enabled: !_submitting,
            maxLength: 1000,
            maxLines: 4,
            minLines: 2,
            decoration: InputDecoration(hintText: l10n.captureHint, border: const OutlineInputBorder()),
          ),
          if (_failed) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.error_outline, size: 18, color: Theme.of(context).colorScheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(l10n.captureParseFailed, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              icon: const Icon(Icons.inbox_outlined),
              label: Text(l10n.saveToInbox),
              onPressed: _saveToInbox,
            ),
          ] else ...[
            const SizedBox(height: 8),
            FilledButton.icon(
              icon: _submitting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.auto_awesome_outlined),
              label: Text(_submitting ? l10n.captureOrganizing : l10n.captureOrganize),
              onPressed: _submitting ? null : _submit,
            ),
          ],
        ],
      ),
    );
  }
}
