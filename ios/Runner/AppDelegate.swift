import Flutter
import GameController
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var gameRuntime: GameRuntimeBridge?
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    gameRuntime = GameRuntimeBridge(messenger: engineBridge.applicationRegistrar.messenger())
  }
}

/// iOS游戏平台桥：提供前台常亮与实体手柄输入，不持有游戏页面或控制器视图。
///
/// 通道沿用Flutter侧现有名称。输入和UIKit状态统一在主线程处理；进入后台、取消订阅
/// 或设备断开时清空按住状态，避免返回前台后继续重复方向键。
private final class GameRuntimeBridge {
  private let windowChannel: FlutterMethodChannel
  private let gamepadChannel: FlutterEventChannel
  private let streamHandler = GamepadStreamHandler()
  private var eventSink: FlutterEventSink?
  private var observers: [NSObjectProtocol] = []
  private var repeatTimer: DispatchSourceTimer?
  private var nextRepeat: [String: TimeInterval] = [:]
  private var heldInputs: [ObjectIdentifier: Set<String>] = [:]
  private var attachedControllers: Set<ObjectIdentifier> = []
  private var keepScreenOnRequested = false
  private var foreground = UIApplication.shared.applicationState == .active
  private let repeatable: Set<String> = ["up", "down", "left", "right", "pageUp", "pageDown"]

  init(messenger: FlutterBinaryMessenger) {
    windowChannel = FlutterMethodChannel(
      name: "com.xiongjian.bbkclassics/window", binaryMessenger: messenger)
    gamepadChannel = FlutterEventChannel(
      name: "com.xiongjian.bbkclassics/gamepad_events", binaryMessenger: messenger)
    streamHandler.owner = self
    gamepadChannel.setStreamHandler(streamHandler)
    windowChannel.setMethodCallHandler { [weak self] call, result in
      guard call.method == "setKeepScreenOn" else {
        result(FlutterMethodNotImplemented)
        return
      }
      guard let arguments = call.arguments as? [String: Any],
        let enabled = arguments["enabled"] as? Bool
      else {
        result(FlutterError(code: "invalid_argument", message: "enabled必须为布尔值", details: nil))
        return
      }
      DispatchQueue.main.async { [weak self] in
        guard let self = self else {
          result(FlutterError(code: "engine_disposed", message: "游戏引擎已关闭", details: nil))
          return
        }
        self.keepScreenOnRequested = enabled
        self.updateIdleTimer()
        result(nil)
      }
    }
    observe(UIApplication.didBecomeActiveNotification) { [weak self] _ in
      self?.foreground = true
      self?.updateIdleTimer()
    }
    observe(UIApplication.willResignActiveNotification) { [weak self] _ in
      self?.foreground = false
      self?.heldInputs.removeAll()
      self?.stopRepeating()
      self?.updateIdleTimer()
    }
    observe(.GCControllerDidConnect) { [weak self] notification in
      guard let controller = notification.object as? GCController else { return }
      self?.attach(controller)
    }
    observe(.GCControllerDidDisconnect) { [weak self] notification in
      guard let controller = notification.object as? GCController else { return }
      self?.detach(controller)
    }
  }

  deinit {
    repeatTimer?.cancel()
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    windowChannel.setMethodCallHandler(nil)
    gamepadChannel.setStreamHandler(nil)
    DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
  }

  /// 使用主队列观察生命周期，闭包弱引用平台桥，避免通知中心延长引擎生命周期。
  private func observe(_ name: Notification.Name, action: @escaping (Notification) -> Void) {
    observers.append(NotificationCenter.default.addObserver(
      forName: name, object: nil, queue: .main, using: action))
  }

  private func updateIdleTimer() {
    UIApplication.shared.isIdleTimerDisabled = keepScreenOnRequested && foreground
  }

  func listen(_ sink: @escaping FlutterEventSink) {
    eventSink = sink
    GCController.controllers().forEach { attach($0) }
  }

  func cancelListening() {
    eventSink = nil
    GCController.controllers().forEach { detach($0) }
    heldInputs.removeAll()
    stopRepeating()
  }

  /// 仅在Flutter游戏输入通道订阅期间接管手柄；回到启动页后解除回调。
  private func attach(_ controller: GCController) {
    let identifier = ObjectIdentifier(controller)
    guard eventSink != nil, !attachedControllers.contains(identifier) else { return }
    controller.handlerQueue = .main
    if let gamepad = controller.extendedGamepad {
      gamepad.valueChangedHandler = { [weak self] pad, _ in
        // PS与Xbox均使用GameController规范化键位：A/×确认，B/○返回。
        var inputs = Set<String>()
        if pad.buttonA.isPressed || pad.buttonMenu.isPressed { inputs.insert("confirm") }
        if pad.buttonB.isPressed || pad.buttonOptions?.isPressed == true { inputs.insert("cancel") }
        if pad.buttonX.isPressed { inputs.insert("search") }
        if pad.buttonY.isPressed { inputs.insert("help") }
        if pad.leftShoulder.isPressed { inputs.insert("pageUp") }
        if pad.rightShoulder.isPressed { inputs.insert("pageDown") }
        self?.addDirections(to: &inputs, dpad: pad.dpad, stick: pad.leftThumbstick)
        self?.updateInputs(identifier, inputs: inputs)
      }
    } else if let gamepad = controller.microGamepad {
      gamepad.valueChangedHandler = { [weak self] pad, _ in
        var inputs = Set<String>()
        if pad.buttonA.isPressed || pad.buttonMenu.isPressed { inputs.insert("confirm") }
        if pad.buttonX.isPressed { inputs.insert("cancel") }
        self?.addDirections(to: &inputs, dpad: pad.dpad, stick: nil)
        self?.updateInputs(identifier, inputs: inputs)
      }
    } else {
      return
    }
    attachedControllers.insert(identifier)
  }

  private func detach(_ controller: GCController) {
    let identifier = ObjectIdentifier(controller)
    guard attachedControllers.remove(identifier) != nil else { return }
    controller.extendedGamepad?.valueChangedHandler = nil
    controller.microGamepad?.valueChangedHandler = nil
    heldInputs.removeValue(forKey: identifier)
    if currentInputs().intersection(repeatable).isEmpty { stopRepeating() }
  }

  /// 十字键优先，左摇杆设置0.55触发阈值，避免摇杆中心噪声产生移动。
  ///
  /// GameController纵轴向上为正，与Android坐标方向相反，统一转换成同一动作名。
  private func addDirections(
    to inputs: inout Set<String>, dpad: GCControllerDirectionPad,
    stick: GCControllerDirectionPad?
  ) {
    let x = abs(dpad.xAxis.value) > 0.55 ? dpad.xAxis.value : (stick?.xAxis.value ?? 0)
    let y = abs(dpad.yAxis.value) > 0.55 ? dpad.yAxis.value : (stick?.yAxis.value ?? 0)
    if x <= -0.55 { inputs.insert("left") }
    if x >= 0.55 { inputs.insert("right") }
    if y <= -0.55 { inputs.insert("down") }
    if y >= 0.55 { inputs.insert("up") }
  }

  private func currentInputs() -> Set<String> {
    heldInputs.values.reduce(into: Set<String>()) { $0.formUnion($1) }
  }

  /// 合并多个控制器的状态，只在按下边沿发送确认等动作，按住方向键才重复。
  private func updateInputs(_ controller: ObjectIdentifier, inputs: Set<String>) {
    guard eventSink != nil, foreground else { return }
    let previous = currentInputs()
    heldInputs[controller] = inputs
    let current = currentInputs()
    let now = ProcessInfo.processInfo.systemUptime
    for action in current.subtracting(previous).sorted() {
      eventSink?(action)
      if repeatable.contains(action) { nextRepeat[action] = now + 0.32 }
    }
    for action in previous.subtracting(current) { nextRepeat.removeValue(forKey: action) }
    if current.intersection(repeatable).isEmpty { stopRepeating() }
    else { startRepeating() }
  }

  private func startRepeating() {
    guard repeatTimer == nil else { return }
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + .milliseconds(55), repeating: .milliseconds(55))
    timer.setEventHandler { [weak self] in
      guard let self = self, self.foreground, self.eventSink != nil else { return }
      let now = ProcessInfo.processInfo.systemUptime
      for action in self.currentInputs().intersection(self.repeatable).sorted() {
        if now >= (self.nextRepeat[action] ?? now + 0.32) {
          self.eventSink?(action)
          self.nextRepeat[action] = now + 0.11
        }
      }
    }
    repeatTimer = timer
    timer.resume()
  }

  private func stopRepeating() {
    repeatTimer?.setEventHandler {}
    repeatTimer?.cancel()
    repeatTimer = nil
    nextRepeat.removeAll()
  }
}

/// 通道仅强持有此代理；代理弱持有运行桥，避免messenger→handler→bridge的循环引用。
private final class GamepadStreamHandler: NSObject, FlutterStreamHandler {
  weak var owner: GameRuntimeBridge?

  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
    owner?.listen(events)
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    owner?.cancelListening()
    return nil
  }
}
