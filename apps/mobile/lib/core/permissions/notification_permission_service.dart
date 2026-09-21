import 'package:permission_handler/permission_handler.dart';

class NotificationPermissionService {
  Future<PermissionStatus> request() => Permission.notification.request();
  Future<PermissionStatus> status() => Permission.notification.status;
  Future<bool> openSettings() => openAppSettings();
}
