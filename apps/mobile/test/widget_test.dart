import 'package:copiloto/core/api/api_client.dart';
import 'package:copiloto/core/api/api_providers.dart';
import 'package:copiloto/main.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Widget tests never hit the real network — the health check would leave a
/// pending dio timer after the test disposes the widget tree.
class _FakeApiClient implements ApiClient {
  @override
  Future<bool> checkHealth() async => false;
}

void main() {
  testWidgets('AC-M0-04 la app arranca y muestra la pantalla de inicio', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(_FakeApiClient())],
        child: const CopilotoApp(),
      ),
    );
    await tester.pump();

    expect(find.text('¿Qué necesitas?'), findsOneWidget);
  });
}
