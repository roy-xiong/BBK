import 'dart:typed_data';

import '../rendering/baye_canvas.dart';
import '../resources/baye_picture.dart';

/// PlcMovie的可暂停迭代状态，保留清除延时与推进延时两个独立计数。
///
/// step只推进一次原版循环，不创建Timer。会话根据返回的等待时间调度，输入、
/// 暂停或读档可以同步取消播放器，不会留下持有旧页面的异步回调。
final class BayeMoviePlayer {
  BayeMoviePlayer(
    this.animation, {
    this.x = 0,
    this.y = 0,
    this.keepBackground = false,
    int first = 0,
    int? last,
  }) {
    _frames = animation.frames.sublist(
      first.clamp(0, animation.endFrame),
      (last ?? animation.endFrame).clamp(
            first.clamp(0, animation.endFrame),
            animation.endFrame,
          ) +
          1,
    );
    _clear = Uint8List.fromList([
      for (final frame in _frames) frame.clearDelay,
    ]);
    _next = Uint8List.fromList([for (final frame in _frames) frame.nextDelay]);
  }

  final BayeAnimation animation;
  final int x;
  final int y;
  final bool keepBackground;
  late final List<BayeAnimationFrame> _frames;
  late final Uint8List _clear;
  late final Uint8List _next;
  int _current = 0;
  int _previous = 0;
  bool _clearRequested = true;
  bool _showRequested = true;
  bool finished = false;

  /// 返回(是否提交新画面, 下次迭代前等待微秒)。每个无绘制循环等待10毫秒。
  (bool, int) step(BayeCanvas canvas) {
    if (finished) return (false, 0);
    for (var i = 0; i <= _current; i++) {
      if (_clear[i] == 1) {
        if (!keepBackground) {
          final frame = _frames[i];
          final bitmap = animation.pictures[frame.pictureIndex];
          canvas.fill(
            x + frame.x,
            y + frame.y,
            x + frame.x + bitmap.width ~/ canvas.scale - 1,
            y + frame.y + bitmap.height ~/ canvas.scale - 1,
          );
        }
        _clearRequested = true;
      }
      if (_clear[i] != 0) _clear[i]--;
    }
    if (_clearRequested) {
      for (var i = 0; i <= _previous; i++) {
        if (_clear[i] != 0) _draw(canvas, i);
      }
    }
    if (_showRequested) {
      for (var i = _previous + 1; i <= _current; i++) {
        if (_clear[i] != 0) _draw(canvas, i);
      }
      _previous = _current;
    }
    final changed = _showRequested || _clearRequested;
    _showRequested = false;
    _clearRequested = false;
    if (_next[_current] > 0) _next[_current]--;
    while (_next[_current] <= 1 && _current < _frames.length - 1) {
      _current++;
      _showRequested = true;
    }
    if (_current >= _frames.length - 1) {
      finished = true;
      for (var i = 0; i <= _current; i++) {
        if (_clear[i] > 1) {
          finished = false;
          break;
        }
      }
    }
    return (changed, changed ? 0 : 10000);
  }

  void _draw(BayeCanvas canvas, int index) {
    final frame = _frames[index];
    canvas.drawBitmap(
      animation.pictures[frame.pictureIndex],
      x + frame.x,
      y + frame.y,
    );
  }
}
