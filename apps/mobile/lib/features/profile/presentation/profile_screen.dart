import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/api/api_providers.dart';
import '../../../core/permissions/notification_permission_service.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/application/session_controller.dart';
import '../../me/application/me_providers.dart';
import '../../notification_settings/application/notification_settings_providers.dart';
import '../../notification_settings/data/notification_type_setting.dart';

final _notificationStatusProvider = FutureProvider.autoDispose<PermissionStatus>(
  (ref) => NotificationPermissionService().status(),
);

/// Account info, settings, notification permission notice, access to
/// Personas, logout and account deletion (F09-ish profile screen — no
/// dedicated feature id in the spec beyond section 9's wireframe).
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        content: Text(l10n.profileLogoutConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: Text(l10n.cancel)),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: Text(l10n.profileLogout)),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(sessionControllerProvider.notifier).logout();
    }
  }

  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.profileDeleteAccount),
        content: Text(l10n.profileDeleteAccountConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: Text(l10n.cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(dialogContext).colorScheme.error),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.delete),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(meApiProvider).deleteAccount();
      await ref.read(sessionControllerProvider.notifier).clearAfterAccountDeletion();
    } on Exception {
      messenger.showSnackBar(SnackBar(content: Text(l10n.genericError)));
    }
  }

  Future<void> _toggleDailySummary(WidgetRef ref, bool value) async {
    await ref.read(meApiProvider).updateSettings(dailySummaryEnabled: value);
    ref.invalidate(settingsProvider);
  }

  // F16: "configurables por tipo desde Perfil" — each switch PATCHes just
  // its own row; the API returns the full list back, kept as the new cache.
  Future<void> _toggleNotificationType(WidgetRef ref, NotificationType type, bool value) async {
    await ref
        .read(notificationSettingsApiProvider)
        .update([NotificationTypeSetting(type: type, enabled: value)]);
    ref.invalidate(notificationTypeSettingsProvider);
  }

  String _notificationTypeLabel(AppLocalizations l10n, NotificationType type) => switch (type) {
    NotificationType.reminder => l10n.notificationTypeReminder,
    NotificationType.upcomingEvent => l10n.notificationTypeUpcomingEvent,
    NotificationType.overdueTask => l10n.notificationTypeOverdueTask,
    NotificationType.dailySummary => l10n.notificationTypeDailySummary,
    NotificationType.conflictAlert => l10n.notificationTypeConflictAlert,
    NotificationType.contextualRecommendation => l10n.notificationTypeContextualRecommendation,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final meAsync = ref.watch(meProvider);
    final settingsAsync = ref.watch(settingsProvider);
    final notificationStatusAsync = ref.watch(_notificationStatusProvider);
    final notificationTypesAsync = ref.watch(notificationTypeSettingsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.navProfile)),
      body: SafeArea(
        child: ListView(
          children: [
            meAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (error, stackTrace) => ListTile(title: Text(error.toString())),
              data: (me) => Column(
                children: [
                  ListTile(
                    leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                    title: Text(me.displayName?.isNotEmpty == true ? me.displayName! : me.email ?? ''),
                    subtitle: me.displayName?.isNotEmpty == true && me.email != null ? Text(me.email!) : null,
                  ),
                  ListTile(title: Text(l10n.profileTimezone), trailing: Text(me.timezone)),
                ],
              ),
            ),
            const Divider(),
            settingsAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (error, stackTrace) => const SizedBox.shrink(),
              data: (settings) => SwitchListTile(
                title: Text(l10n.profileDailySummary),
                value: settings.dailySummaryEnabled,
                onChanged: (value) => _toggleDailySummary(ref, value),
              ),
            ),
            notificationStatusAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (error, stackTrace) => const SizedBox.shrink(),
              data: (status) {
                if (status.isGranted) return const SizedBox.shrink();
                return ListTile(
                  leading: Icon(Icons.notifications_off_outlined, color: Theme.of(context).colorScheme.error),
                  title: Text(l10n.profileNotifications),
                  subtitle: Text(l10n.profileNotificationsDenied),
                  isThreeLine: true,
                  trailing: TextButton(
                    onPressed: () => NotificationPermissionService().openSettings(),
                    child: Text(l10n.profileOpenSettings),
                  ),
                );
              },
            ),
            const Divider(),
            notificationTypesAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (error, stackTrace) => const SizedBox.shrink(),
              data: (types) => Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        l10n.profileNotificationTypesTitle,
                        style: Theme.of(context).textTheme.labelLarge,
                      ),
                    ),
                  ),
                  for (final setting in types)
                    SwitchListTile(
                      title: Text(_notificationTypeLabel(l10n, setting.type)),
                      value: setting.enabled,
                      onChanged: (value) => _toggleNotificationType(ref, setting.type, value),
                    ),
                ],
              ),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.people_outline),
              title: Text(l10n.navPeople),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/people'),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout),
              title: Text(l10n.profileLogout),
              onTap: () => _logout(context, ref),
            ),
            ListTile(
              leading: Icon(Icons.delete_forever_outlined, color: Theme.of(context).colorScheme.error),
              title: Text(l10n.profileDeleteAccount, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              onTap: () => _deleteAccount(context, ref),
            ),
          ],
        ),
      ),
    );
  }
}
