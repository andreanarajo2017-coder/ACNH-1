import 'dart:async';

/// Decouples the authorized Dio's interceptor (core) from
/// `SessionController` (features/auth): the interceptor fires this signal
/// instead of importing the controller directly.
class SessionExpiredSignal {
  final _controller = StreamController<void>.broadcast();

  Stream<void> get stream => _controller.stream;

  void notify() => _controller.add(null);

  void dispose() => _controller.close();
}
