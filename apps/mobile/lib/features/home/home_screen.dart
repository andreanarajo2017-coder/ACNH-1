import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_providers.dart';
import '../../l10n/app_localizations.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final health = ref.watch(serverHealthProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.appTitle)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.greeting('👋'), style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(l10n.whatDoYouNeed, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 24),
              _HealthBanner(health: health, l10n: l10n),
              const Spacer(),
              FilledButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.edit_outlined),
                label: Text(l10n.write),
              ),
            ],
          ),
        ),
      ),
    );
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
    final color = isError ? Theme.of(context).colorScheme.error : Theme.of(context).colorScheme.primary;
    return Row(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: TextStyle(color: color))),
      ],
    );
  }
}
