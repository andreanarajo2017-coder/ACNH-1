import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_providers.dart';
import '../data/me_models.dart';

final meProvider = FutureProvider<Me>((ref) => ref.watch(meApiProvider).getMe());

final settingsProvider = FutureProvider<UserSettings>((ref) => ref.watch(meApiProvider).getSettings());
