import 'package:copiloto/core/api/api_client.dart';
import 'package:copiloto/core/api/api_providers.dart';
import 'package:copiloto/core/api/token_storage.dart';
import 'package:copiloto/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Widget tests never hit the real network or platform channels — the
/// health check would leave a pending dio timer, and secure storage has no
/// platform implementation in the test environment.
class _FakeApiClient implements ApiClient {
  @override
  Future<bool> checkHealth() async => false;
}

class _FakeTokenStorage implements TokenStorage {
  @override
  Future<String?> readAccessToken() async => null;
  @override
  Future<String?> readRefreshToken() async => null;
  @override
  Future<void> save(AuthTokens tokens) async {}
  @override
  Future<void> clear() async {}
}

void main() {
  testWidgets('AC-M0-04 la app arranca y, sin sesión, muestra la pantalla de login', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiClientProvider.overrideWithValue(_FakeApiClient()),
          tokenStorageProvider.overrideWithValue(_FakeTokenStorage()),
        ],
        child: const CopilotoApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Iniciar sesión'), findsWidgets);
  });
}
