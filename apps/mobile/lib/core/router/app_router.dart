import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/session_controller.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/reset_password_screen.dart';
import '../../features/ai/data/ai_models.dart';
import '../../features/ai/presentation/parse_preview_screen.dart';
import '../../features/events/data/event_models.dart';
import '../../features/events/presentation/calendar_screen.dart';
import '../../features/events/presentation/event_form_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/inbox/presentation/inbox_screen.dart';
import '../../features/onboarding/presentation/onboarding_flow.dart';
import '../../features/people/data/people_models.dart';
import '../../features/people/presentation/people_list_screen.dart';
import '../../features/people/presentation/person_detail_screen.dart';
import '../../features/people/presentation/person_form_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/tasks/presentation/task_detail_screen.dart';
import '../../features/tasks/presentation/task_form_screen.dart';
import '../../features/tasks/presentation/tasks_screen.dart';
import '../widgets/app_shell.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

const _authRoutes = {'/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'};

/// Bridges Riverpod state changes to go_router, which needs a plain
/// [Listenable] to know when to re-run `redirect` (D-xx: session-driven
/// navigation rather than each screen navigating manually after
/// login/logout/onboarding).
class _RouterRefreshNotifier extends ChangeNotifier {
  _RouterRefreshNotifier(Ref ref) {
    ref.listen(sessionControllerProvider, (previous, next) => notifyListeners());
  }
}

String? _redirect(Ref ref, GoRouterState state) {
  final session = ref.read(sessionControllerProvider);
  final location = state.matchedLocation;

  if (session.status == AuthStatus.unknown) {
    return location == '/splash' ? null : '/splash';
  }
  if (location == '/splash') {
    return session.status == AuthStatus.authenticated ? '/' : '/auth/login';
  }
  if (session.status == AuthStatus.unauthenticated) {
    return _authRoutes.contains(location) ? null : '/auth/login';
  }
  // authenticated
  if (_authRoutes.contains(location)) return '/';
  if (!session.onboardingCompleted) {
    return location == '/onboarding' ? null : '/onboarding';
  }
  if (location == '/onboarding') return '/';
  return null;
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _RouterRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: refreshNotifier,
    redirect: (context, state) => _redirect(ref, state),
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const Scaffold(body: Center(child: CircularProgressIndicator())),
      ),
      GoRoute(path: '/auth/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/auth/register', builder: (context, state) => const RegisterScreen()),
      GoRoute(path: '/auth/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(path: '/auth/reset-password', builder: (context, state) => const ResetPasswordScreen()),
      GoRoute(path: '/onboarding', builder: (context, state) => const OnboardingFlow()),

      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/', builder: (context, state) => const HomeScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/tasks', builder: (context, state) => const TasksScreen())]),
          StatefulShellBranch(
            routes: [GoRoute(path: '/calendar', builder: (context, state) => const CalendarScreen())],
          ),
          StatefulShellBranch(routes: [GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen())]),
        ],
      ),

      // Full-screen routes pushed above the shell (no bottom nav).
      GoRoute(path: '/inbox', parentNavigatorKey: _rootNavigatorKey, builder: (context, state) => const InboxScreen()),
      GoRoute(
        path: '/capture/preview',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final args = state.extra as ParsePreviewArgs;
          return ParsePreviewScreen(initial: args.response, sourceText: args.sourceText, inboxItemId: args.inboxItemId);
        },
      ),
      GoRoute(
        path: '/tasks/new',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const TaskFormScreen(),
      ),
      GoRoute(
        path: '/tasks/:id',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => TaskDetailScreen(taskId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/people',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const PeopleListScreen(),
      ),
      GoRoute(
        path: '/people/new',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const PersonFormScreen(),
      ),
      GoRoute(
        path: '/people/:id',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => PersonDetailScreen(personId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/people/:id/edit',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => PersonFormScreen(person: state.extra as Person?),
      ),
      GoRoute(
        path: '/calendar/new',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => EventFormScreen(initialDate: state.extra as DateTime?),
      ),
      GoRoute(
        path: '/calendar/:id/edit',
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => EventFormScreen(event: state.extra as CalendarItem?),
      ),
    ],
  );
});
