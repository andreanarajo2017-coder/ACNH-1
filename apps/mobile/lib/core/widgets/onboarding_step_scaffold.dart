import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// Shared layout for onboarding steps (F02): a title, the step's content,
/// a primary continue action, and — for every step except privacy — a skip
/// action (skipping applies defaults and never blocks, per section 0.4/F02).
class OnboardingStepScaffold extends StatelessWidget {
  const OnboardingStepScaffold({
    super.key,
    required this.title,
    required this.child,
    required this.onContinue,
    this.onSkip,
    this.continueLabel,
    this.continueEnabled = true,
  });

  final String title;
  final Widget child;
  final VoidCallback onContinue;
  final VoidCallback? onSkip;
  final String? continueLabel;
  final bool continueEnabled;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: onSkip != null
          ? AppBar(
              actions: [
                TextButton(onPressed: onSkip, child: Text(l10n.onboardingSkip)),
                const SizedBox(width: 8),
              ],
            )
          : null,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 16),
              Expanded(child: SingleChildScrollView(child: child)),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: continueEnabled ? onContinue : null,
                child: Text(continueLabel ?? l10n.onboardingContinue),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
