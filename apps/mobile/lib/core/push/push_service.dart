import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';

import '../../features/devices/data/devices_api.dart';
import 'deep_link_resolver.dart';

/// D-06: FCM (Android) / APNs via FCM (iOS). Every Firebase call here is
/// guarded — this repo has no Firebase project configured yet (no
/// google-services.json / GoogleService-Info.plist, see
/// docs/decisions.md), so initialization fails today. That's a soft
/// failure, not a crash: the same "never a hard dependency" pattern M5's
/// capture sheet uses when the AI call fails (degrade, don't break the
/// app or its tests).
class PushService {
  PushService(this._devicesApi);

  final DevicesApi _devicesApi;
  bool _ready = false;

  /// Registers this device's push token with the API. Call once the user
  /// is authenticated (a token is only meaningful tied to a session).
  Future<void> registerDevice() async {
    try {
      await Firebase.initializeApp();
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await _devicesApi.register(platform: Platform.isIOS ? 'ios' : 'android', pushToken: token);
      _ready = true;
    } catch (error, stackTrace) {
      // No Firebase project configured, unsupported platform (desktop/web
      // dev runs), or the API call failed — none of these should crash
      // startup or login.
      debugPrint('PushService.registerDevice skipped: $error\n$stackTrace');
    }
  }

  /// Wires notification taps (app resumed from background, or a cold start
  /// from a tapped notification) to deep-link navigation. No-ops if
  /// [registerDevice] never got Firebase working.
  void listenForTaps(GoRouter router) {
    if (!_ready) return;
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      router.go(resolveDeepLinkRoute(message.data));
    });
    FirebaseMessaging.instance.getInitialMessage().then((message) {
      if (message != null) router.go(resolveDeepLinkRoute(message.data));
    });
  }
}
