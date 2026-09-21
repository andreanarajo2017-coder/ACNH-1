import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_providers.dart';
import '../../l10n/app_localizations.dart';
import '../inbox/application/inbox_providers.dart';
import '../me/application/me_providers.dart';
import 'capture_sheet.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final me = ref.watch(meProvider);
    final inbox = ref.watch(unprocessedInboxProvider);
    final health = ref.watch(serverHealthProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.appTitle),
        actions: [
          IconButton(
            tooltip: l10n.inbox,
            onPressed: () => context.push('/inbox'),
            icon: Badge(
              label: Text('${inbox.valueOrNull?.length ?? 0}'),
              isLabelVisible: (inbox.valueOrNull?.isNotEmpty ?? false),
              child: const Icon(Icons.inbox_outlined),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Builder(
              builder: (context) {
                final name = me.valueOrNull?.displayName;
                final text = (name != null && name.isNotEmpty) ? l10n.greeting(name) : l10n.greetingNoName;
                return Text(text, style: Theme.of(context).textTheme.headlineSmall);
              },
            ),
            const SizedBox(height: 24),
            Card(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => showCaptureSheet(context, ref),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    children: [
                      const Icon(Icons.edit_outlined),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Text(l10n.whatDoYouNeed, style: Theme.of(context).textTheme.titleMedium),
                      ),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(l10n.homeQuickAccess, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _QuickAccessChip(
                  icon: Icons.check_circle_outline,
                  label: l10n.navTasks,
                  onTap: () => context.go('/tasks'),
                ),
                _QuickAccessChip(
                  icon: Icons.calendar_today_outlined,
                  label: l10n.navCalendar,
                  onTap: () => context.go('/calendar'),
                ),
                _QuickAccessChip(
                  icon: Icons.people_outline,
                  label: l10n.navPeople,
                  onTap: () => context.push('/people'),
                ),
              ],
            ),
            const SizedBox(height: 32),
            _HealthBanner(health: health, l10n: l10n),
          ],
        ),
      ),
    );
  }
}

class _QuickAccessChip extends StatelessWidget {
  const _QuickAccessChip({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(avatar: Icon(icon, size: 18), label: Text(label), onPressed: onTap);
  }
}

class _HealthBanner extends StatelessWidget {
  const _HealthBanner({required this.health, required this.l10n});

  final AsyncValue<ServerHealth> health;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    return health.when(
      loading: () => _banner(context, l10n.checkingConnection, Icons.hourglass_top),
      error: (error, stackTrace) => _banner(context, l10n.connectionError, Icons.error_outline, isError: true),
      data: (value) => switch (value) {
        ServerHealth.connected => _banner(context, l10n.connectedToServer, Icons.check_circle_outline),
        ServerHealth.checking => _banner(context, l10n.checkingConnection, Icons.hourglass_top),
        ServerHealth.unreachable => _banner(context, l10n.connectionError, Icons.error_outline, isError: true),
      },
    );
  }

  Widget _banner(BuildContext context, String text, IconData icon, {bool isError = false}) {
    final color = isError ? Theme.of(context).colorScheme.error : Theme.of(context).colorScheme.outline;
    return Row(
      children: [
        Icon(icon, color: color, size: 16),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: TextStyle(color: color, fontSize: 12))),
      ],
    );
  }
}
