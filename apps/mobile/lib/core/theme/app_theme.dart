import 'package:flutter/material.dart';

/// Material 3 theme. No graphic design system is defined yet (section 9 of
/// the spec) — this is a neutral seed theme, not a final brand.
class AppTheme {
  AppTheme._();

  static const Color _seedColor = Color(0xFF3D5AFE);

  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _seedColor,
        brightness: Brightness.light,
      ),
      visualDensity: VisualDensity.adaptivePlatformDensity,
    );
  }

  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _seedColor,
        brightness: Brightness.dark,
      ),
      visualDensity: VisualDensity.adaptivePlatformDensity,
    );
  }
}
