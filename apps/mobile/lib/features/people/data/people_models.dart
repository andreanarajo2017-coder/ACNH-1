enum Relationship {
  child('child'),
  partner('partner'),
  family('family'),
  friend('friend'),
  other('other');

  const Relationship(this.value);
  final String value;

  static Relationship fromJson(String value) =>
      Relationship.values.firstWhere((r) => r.value == value, orElse: () => Relationship.other);
}

class Person {
  const Person({
    required this.id,
    required this.name,
    required this.relationship,
    required this.aliases,
    required this.birthday,
    required this.notes,
  });

  final String id;
  final String name;
  final Relationship relationship;
  final List<String> aliases;
  final String? birthday;
  final String? notes;

  factory Person.fromJson(Map<String, dynamic> json) => Person(
    id: json['id'] as String,
    name: json['name'] as String,
    relationship: Relationship.fromJson(json['relationship'] as String),
    aliases: (json['aliases'] as List).cast<String>(),
    birthday: json['birthday'] as String?,
    notes: json['notes'] as String?,
  );
}
