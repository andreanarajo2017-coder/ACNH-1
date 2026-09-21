import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_providers.dart';
import '../../../core/permissions/notification_permission_service.dart';
import '../../../core/widgets/onboarding_step_scaffold.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/application/session_controller.dart';
import '../../people/data/people_models.dart';
import '../../people/presentation/relationship_label.dart';

class _DraftPerson {
  _DraftPerson({required this.name, required this.relationship});
  final String name;
  final Relationship relationship;
}

/// F02: a single route hosting all onboarding steps as internal state — the
/// step transitions are local UX, not places a user should be able to deep
/// link into or navigate back to independently.
class OnboardingFlow extends ConsumerStatefulWidget {
  const OnboardingFlow({super.key});

  @override
  ConsumerState<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends ConsumerState<OnboardingFlow> {
  static const _totalSteps = 6; // privacy, name, timezone, notifications, people, categories

  int _step = 0;
  final _nameController = TextEditingController();
  final _timezoneController = TextEditingController(text: 'America/Argentina/Buenos_Aires');
  bool _dailySummaryEnabled = true;
  final List<_DraftPerson> _people = [];
  bool _finishing = false;

  @override
  void dispose() {
    _nameController.dispose();
    _timezoneController.dispose();
    super.dispose();
  }

  void _goTo(int step) {
    if (step >= _totalSteps) {
      _finish();
      return;
    }
    setState(() => _step = step);
  }

  Future<void> _finish() async {
    if (_finishing) return;
    setState(() => _finishing = true);
    try {
      await ref
          .read(meApiProvider)
          .updateMe(
            displayName: _nameController.text.trim().isEmpty ? null : _nameController.text.trim(),
            timezone: _timezoneController.text.trim().isEmpty ? null : _timezoneController.text.trim(),
            onboardingCompletedAt: DateTime.now(),
          );
      await ref.read(meApiProvider).updateSettings(dailySummaryEnabled: _dailySummaryEnabled);
      for (final person in _people) {
        await ref.read(peopleApiProvider).create(name: person.name, relationship: person.relationship);
      }
      ref.read(sessionControllerProvider.notifier).markOnboardingCompleted();
      if (mounted) context.go('/');
    } finally {
      if (mounted) setState(() => _finishing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    switch (_step) {
      case 0:
        return _PrivacyStep(onContinue: () => _goTo(1));
      case 1:
        return _NameStep(controller: _nameController, onContinue: () => _goTo(2), onSkip: () => _goTo(2));
      case 2:
        return _TimezoneStep(
          controller: _timezoneController,
          onContinue: () => _goTo(3),
          onSkip: () => _goTo(3),
        );
      case 3:
        return _NotificationsStep(
          enabled: _dailySummaryEnabled,
          onChanged: (value) => setState(() => _dailySummaryEnabled = value),
          onContinue: () => _goTo(4),
          onSkip: () => _goTo(4),
        );
      case 4:
        return _PeopleStep(
          people: _people,
          onAdd: (p) => setState(() => _people.add(p)),
          onRemove: (i) => setState(() => _people.removeAt(i)),
          onContinue: () => _goTo(5),
          onSkip: () => _goTo(5),
        );
      default:
        return _CategoriesStep(onContinue: () => _goTo(6), onSkip: () => _goTo(6), finishing: _finishing);
    }
  }
}

class _PrivacyStep extends StatelessWidget {
  const _PrivacyStep({required this.onContinue});
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return OnboardingStepScaffold(
      title: l10n.onboardingPrivacyTitle,
      onContinue: onContinue,
      continueLabel: l10n.onboardingPrivacyAccept,
      child: Text(l10n.onboardingPrivacyBody, style: Theme.of(context).textTheme.bodyLarge),
    );
  }
}

class _NameStep extends StatelessWidget {
  const _NameStep({required this.controller, required this.onContinue, required this.onSkip});
  final TextEditingController controller;
  final VoidCallback onContinue;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return OnboardingStepScaffold(
      title: l10n.onboardingNameTitle,
      onContinue: onContinue,
      onSkip: onSkip,
      child: TextField(
        controller: controller,
        decoration: InputDecoration(labelText: l10n.onboardingNameLabel),
        textCapitalization: TextCapitalization.words,
      ),
    );
  }
}

class _TimezoneStep extends StatelessWidget {
  const _TimezoneStep({required this.controller, required this.onContinue, required this.onSkip});
  final TextEditingController controller;
  final VoidCallback onContinue;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return OnboardingStepScaffold(
      title: l10n.onboardingTimezoneTitle,
      onContinue: onContinue,
      onSkip: onSkip,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.onboardingTimezoneHelp, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 16),
          TextField(controller: controller, decoration: InputDecoration(labelText: l10n.onboardingTimezoneLabel)),
        ],
      ),
    );
  }
}

class _NotificationsStep extends ConsumerWidget {
  const _NotificationsStep({
    required this.enabled,
    required this.onChanged,
    required this.onContinue,
    required this.onSkip,
  });

  final bool enabled;
  final ValueChanged<bool> onChanged;
  final VoidCallback onContinue;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    return OnboardingStepScaffold(
      title: l10n.onboardingNotificationsTitle,
      onContinue: () async {
        // AC-F02-02: the app works the same whether the OS permission is
        // granted or denied — this is informational, not a gate.
        await NotificationPermissionService().request();
        onContinue();
      },
      onSkip: onSkip,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.onboardingNotificationsExplainer, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 16),
          SwitchListTile(
            value: enabled,
            onChanged: onChanged,
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.onboardingDailySummaryLabel),
          ),
        ],
      ),
    );
  }
}

class _PeopleStep extends StatelessWidget {
  const _PeopleStep({
    required this.people,
    required this.onAdd,
    required this.onRemove,
    required this.onContinue,
    required this.onSkip,
  });

  final List<_DraftPerson> people;
  final ValueChanged<_DraftPerson> onAdd;
  final ValueChanged<int> onRemove;
  final VoidCallback onContinue;
  final VoidCallback onSkip;

  Future<void> _openAddDialog(BuildContext context) async {
    final l10n = AppLocalizations.of(context)!;
    final nameController = TextEditingController();
    var relationship = Relationship.family;
    final result = await showDialog<_DraftPerson>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: Text(l10n.onboardingAddPerson),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                autofocus: true,
                decoration: InputDecoration(labelText: l10n.onboardingPersonName),
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<Relationship>(
                initialValue: relationship,
                decoration: InputDecoration(labelText: l10n.onboardingPersonRelationship),
                items: Relationship.values
                    .map((r) => DropdownMenuItem(value: r, child: Text(relationshipLabel(l10n, r))))
                    .toList(),
                onChanged: (value) => setDialogState(() => relationship = value ?? relationship),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: Text(l10n.cancel)),
            FilledButton(
              onPressed: nameController.text.trim().isEmpty
                  ? null
                  : () => Navigator.of(
                      dialogContext,
                    ).pop(_DraftPerson(name: nameController.text.trim(), relationship: relationship)),
              child: Text(l10n.add),
            ),
          ],
        ),
      ),
    );
    if (result != null) onAdd(result);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return OnboardingStepScaffold(
      title: l10n.onboardingPeopleTitle,
      onContinue: onContinue,
      onSkip: onSkip,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.onboardingPeopleExplainer, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          for (var i = 0; i < people.length; i++)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(people[i].name),
              subtitle: Text(relationshipLabel(l10n, people[i].relationship)),
              trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => onRemove(i)),
            ),
          OutlinedButton.icon(
            onPressed: () => _openAddDialog(context),
            icon: const Icon(Icons.add),
            label: Text(l10n.onboardingAddPerson),
          ),
        ],
      ),
    );
  }
}

class _CategoriesStep extends ConsumerWidget {
  const _CategoriesStep({required this.onContinue, required this.onSkip, required this.finishing});
  final VoidCallback onContinue;
  final VoidCallback onSkip;
  final bool finishing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final categoriesAsync = ref.watch(_onboardingCategoriesProvider);
    return OnboardingStepScaffold(
      title: l10n.onboardingCategoriesTitle,
      onContinue: onContinue,
      onSkip: onSkip,
      continueLabel: l10n.onboardingFinish,
      continueEnabled: !finishing,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.onboardingCategoriesExplainer, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 16),
          categoriesAsync.when(
            data: (categories) => Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [for (final c in categories) FilterChip(label: Text(c.name), selected: true, onSelected: (_) {})],
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stackTrace) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

final _onboardingCategoriesProvider = FutureProvider((ref) async {
  final page = await ref.watch(categoriesApiProvider).list();
  return page.data;
});
