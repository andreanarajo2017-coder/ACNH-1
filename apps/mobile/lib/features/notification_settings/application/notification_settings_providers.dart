import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../data/notification_settings_api.dart';
import '../data/notification_type_setting.dart';

final notificationSettingsApiProvider = Provider<NotificationSettingsApi>(
  (ref) => NotificationSettingsApi(ref.watch(authorizedDioProvider)),
);

final notificationTypeSettingsProvider = FutureProvider<List<NotificationTypeSetting>>(
  (ref) => ref.watch(notificationSettingsApiProvider).list(),
);
