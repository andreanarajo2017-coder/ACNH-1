# Copiloto — Mobile (Flutter)

Flutter 3.x app. `android/` and `ios/` are generated (checked in as of M3);
regenerate them if missing with:

```bash
flutter create --platforms=android,ios --project-name copiloto --org com.copiloto .
```

## Setup

```bash
flutter pub get
flutter gen-l10n   # generates lib/l10n/app_localizations.dart from app_es.arb
```

`flutter pub get` runs `gen-l10n` automatically because `generate: true` is
set in `pubspec.yaml`. Requires Flutter SDK 3.4+ (`intl` needs the version
`flutter_localizations` pulls in — see ADR-009 if `pub get` fails on `intl`).

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
