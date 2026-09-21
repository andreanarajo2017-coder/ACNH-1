import '../../../l10n/app_localizations.dart';
import '../data/people_models.dart';

String relationshipLabel(AppLocalizations l10n, Relationship r) {
  switch (r) {
    case Relationship.child:
      return l10n.relationshipChild;
    case Relationship.partner:
      return l10n.relationshipPartner;
    case Relationship.family:
      return l10n.relationshipFamily;
    case Relationship.friend:
      return l10n.relationshipFriend;
    case Relationship.other:
      return l10n.relationshipOther;
  }
}
