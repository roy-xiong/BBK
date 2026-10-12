/// 固定原机游戏目录项。使用独立字符串 ID，避免扩展现有 Web 版枚举影响其存档键。
class BbkGame {
  const BbkGame({
    required this.id,
    required this.title,
    required this.coverAsset,
    required this.model,
    required this.upstreamWarn,
  });

  final String id;
  final String title;
  final String coverAsset;
  final String model;
  final bool upstreamWarn;

  factory BbkGame.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final title = json['title'];
    final cover = json['coverAsset'];
    final model = json['model'];
    if (id is! String ||
        !RegExp(r'^rpg-\d{3}$').hasMatch(id) ||
        title is! String ||
        title.isEmpty ||
        cover is! String ||
        !cover.startsWith('assets/bbk/covers/') ||
        (model != 'a4980' && model != 'a4988')) {
      throw const FormatException('原机游戏目录项无效');
    }
    return BbkGame(
      id: id,
      title: title,
      coverAsset: cover,
      model: model as String,
      upstreamWarn: json['upstreamStatus'] == 'warn',
    );
  }
}
