import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/api_providers.dart';
import '../../../l10n/app_localizations.dart';
import '../application/people_providers.dart';
import '../data/people_models.dart';
import 'relationship_label.dart';

/// Create when [person] is null, edit otherwise.
class PersonFormScreen extends ConsumerStatefulWidget {
  const PersonFormScreen({super.key, this.person});

  final Person? person;

  @override
  ConsumerState<PersonFormScreen> createState() => _PersonFormScreenState();
}

class _PersonFormScreenState extends ConsumerState<PersonFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _nameController = TextEditingController(text: widget.person?.name ?? '');
  late Relationship _relationship = widget.person?.relationship ?? Relationship.family;
  bool _submitting = false;
  String? _errorMessage;

  bool get _isEditing => widget.person != null;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });
    try {
      if (_isEditing) {
        await ref
            .read(peopleApiProvider)
            .update(widget.person!.id, name: _nameController.text.trim(), relationship: _relationship);
      } else {
        await ref
            .read(peopleApiProvider)
            .create(name: _nameController.text.trim(), relationship: _relationship);
      }
      ref.invalidate(peopleListProvider);
      if (_isEditing) ref.invalidate(personProvider(widget.person!.id));
      if (mounted) context.pop();
    } on ApiException {
      if (mounted) setState(() => _errorMessage = AppLocalizations.of(context)!.genericError);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(_isEditing ? l10n.peopleEditPerson : l10n.onboardingAddPerson)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _nameController,
                  autofocus: !_isEditing,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(labelText: l10n.onboardingPersonName),
                  validator: (value) => (value == null || value.trim().isEmpty) ? l10n.peopleNameRequired : null,
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<Relationship>(
                  initialValue: _relationship,
                  decoration: InputDecoration(labelText: l10n.onboardingPersonRelationship),
                  items: Relationship.values
                      .map((r) => DropdownMenuItem(value: r, child: Text(relationshipLabel(l10n, r))))
                      .toList(),
                  onChanged: (value) => setState(() => _relationship = value ?? _relationship),
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 16),
                  Text(_errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(l10n.save),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
