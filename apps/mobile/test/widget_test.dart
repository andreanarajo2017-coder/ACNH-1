import 'package:copiloto/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('AC-M0-04 la app arranca y muestra la pantalla de inicio', (tester) async {
    await tester.pumpWidget(const CopilotoApp());
    await tester.pump();

    expect(find.text('¿Qué necesitas?'), findsOneWidget);
  });
}
