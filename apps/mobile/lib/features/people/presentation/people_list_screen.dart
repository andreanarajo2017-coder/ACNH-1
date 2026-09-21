import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/widgets/async_state_views.dart';
import '../../../l10n/app_localizations.dart';
import '../application/people_providers.dart';
import '../data/people_models.dart';
import 'relationship_label.dart';

class PeopleListScreen extends ConsumerWidget {
  const PeopleListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final people = ref.watch(peopleListProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.navPeople)),
      body: AsyncListView<Person>(
        value: people,
        emptyMessage: l10n.peopleEmpty,
        emptyIcon: Icons.people_outline,
        onRetry: () => ref.invalidate(peopleListProvider),
        itemBuilder: (context, person) => ListTile(
          leading: CircleAvatar(child: Text(person.name.isNotEmpty ? person.name[0].toUpperCase() : '?')),
          title: Text(person.name),
          subtitle: Text(relationshipLabel(l10n, person.relationship)),
          onTap: () => context.push('/people/${person.id}'),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/people/new'),
        child: const Icon(Icons.add),
      ),
    );
  }
}
