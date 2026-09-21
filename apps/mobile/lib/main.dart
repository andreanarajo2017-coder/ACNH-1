import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/api/api_providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/application/session_controller.dart';
import 'l10n/app_localizations.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Needed for Spanish month/weekday names in the calendar (F07).
  await initializeDateFormatting('es');
  runApp(const ProviderScope(child: CopilotoApp()));
}

class CopilotoApp extends ConsumerWidget {
  const CopilotoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    // F16: register this device's push token once the user is
    // authenticated, and wire notification taps to deep-link navigation.
    // Fires once per authenticated session (`previous` is null both on the
    // very first build and right after a fresh login/register).
    ref.listen<SessionState>(sessionControllerProvider, (previous, next) {
      if (next.status == AuthStatus.authenticated &&
          previous?.status != AuthStatus.authenticated) {
        final pushService = ref.read(pushServiceProvider);
        pushService.registerDevice().then((_) => pushService.listenForTaps(router));
      }
    });

    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context)!.appTitle,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: router,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
