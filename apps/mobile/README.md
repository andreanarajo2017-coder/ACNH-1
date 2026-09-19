# Copiloto — Mobile (Flutter)

This directory holds the Dart application skeleton for M0. The container
this skeleton was authored in does not have the Flutter SDK installed, so
the platform projects (`android/`, `ios/`) have not been generated yet.

## First-time setup (on a machine with the Flutter SDK)

```bash
flutter create --platforms=android,ios --project-name copiloto --org com.copiloto .
flutter pub get
flutter gen-l10n   # generates lib/l10n/app_localizations.dart from app_es.arb
```

`flutter pub get` runs `gen-l10n` automatically because `generate: true` is
set in `pubspec.yaml`.

## Running against the API

The API base URL defaults to `http://localhost:3000`. Override with:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000   # Android emulator
```

## Commands

```bash
flutter analyze
flutter test
flutter run
```
