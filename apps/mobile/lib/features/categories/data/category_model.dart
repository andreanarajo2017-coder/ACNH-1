class Category {
  const Category({
    required this.id,
    required this.name,
    required this.color,
    required this.icon,
    required this.isDefault,
  });

  final String id;
  final String name;
  final String? color;
  final String? icon;
  final bool isDefault;

  factory Category.fromJson(Map<String, dynamic> json) => Category(
    id: json['id'] as String,
    name: json['name'] as String,
    color: json['color'] as String?,
    icon: json['icon'] as String?,
    isDefault: json['is_default'] as bool,
  );
}
