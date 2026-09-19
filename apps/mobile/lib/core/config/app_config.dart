/// Runtime configuration. Override at build time with
/// `--dart-define=API_BASE_URL=https://...`.
class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
}
