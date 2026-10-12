package com.xiongjian.bbkclassics

import android.view.InputDevice
import android.content.Intent
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowManager
import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import kotlin.math.abs

/**
 * Flutter 容器 Activity，同时把 Android 手柄按键与摇杆事件转发给 Dart。
 *
 * 仅消费来源明确为 GAMEPAD、DPAD 或 JOYSTICK 的事件，手机返回键和普通键盘仍交由
 * Flutter/Android 默认流程处理，避免改变应用正常导航行为。
 */
class MainActivity : FlutterActivity() {
    private var gamepadEventSink: EventChannel.EventSink? = null
    private var windowMethodChannel: MethodChannel? = null
    private var romStorageChannel: RomStorageChannel? = null
    private var emulatorEventSink: EventChannel.EventSink? = null
    private val emulatorPressedSources = mutableMapOf<String, Int>()
    private var keepScreenOnRequested = false
    private var activityResumed = false
    private val lastEmissionTime = mutableMapOf<String, Long>()

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        romStorageChannel?.close()
        romStorageChannel = RomStorageChannel(this, flutterEngine.dartExecutor.binaryMessenger)
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, EMULATOR_EVENT_CHANNEL)
            .setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    emulatorPressedSources.clear()
                    emulatorEventSink = events
                }
                override fun onCancel(arguments: Any?) {
                    emulatorPressedSources.clear()
                    emulatorEventSink = null
                }
            })
        windowMethodChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            WINDOW_METHOD_CHANNEL,
        ).also { channel ->
            // Flutter 平台通道在 Android 主线程分发，窗口标志也只在主线程修改。
            channel.setMethodCallHandler { call, result ->
                if (call.method != "setKeepScreenOn") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val enabled = call.argument<Boolean>("enabled")
                if (enabled == null) {
                    result.error("invalid_argument", "enabled 必须为布尔值", null)
                    return@setMethodCallHandler
                }
                keepScreenOnRequested = enabled
                applyKeepScreenOn()
                result.success(null)
            }
        }
        EventChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            GAMEPAD_EVENT_CHANNEL,
        ).setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    gamepadEventSink = events
                }

                override fun onCancel(arguments: Any?) {
                    gamepadEventSink = null
                }
            },
        )
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (!isControllerSource(event.source)) return super.dispatchKeyEvent(event)
        if (emulatorEventSink != null) {
            val button = mapEmulatorKey(event.keyCode) ?: return super.dispatchKeyEvent(event)
            if (event.action == KeyEvent.ACTION_DOWN || event.action == KeyEvent.ACTION_UP) {
                setEmulatorButton("key:${event.deviceId}:${event.keyCode}", button,
                    event.action == KeyEvent.ACTION_DOWN)
            }
            return true
        }
        val action = mapKeyCode(event.keyCode) ?: return super.dispatchKeyEvent(event)
        if (event.action == KeyEvent.ACTION_DOWN) {
            val repeatable = action in REPEATABLE_ACTIONS
            if (event.repeatCount == 0 || (repeatable && shouldEmit(action, event.eventTime))) {
                emit(action)
            }
        }
        return true
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        val isJoystick =
            event.action == MotionEvent.ACTION_MOVE &&
                event.source and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK
        if (!isJoystick) return super.dispatchGenericMotionEvent(event)

        val horizontalHat = centeredAxis(event, MotionEvent.AXIS_HAT_X)
        val verticalHat = centeredAxis(event, MotionEvent.AXIS_HAT_Y)
        val horizontal =
            if (horizontalHat != 0f) horizontalHat else centeredAxis(event, MotionEvent.AXIS_X)
        val vertical =
            if (verticalHat != 0f) verticalHat else centeredAxis(event, MotionEvent.AXIS_Y)

        if (emulatorEventSink != null) {
            setEmulatorButton("axis:${event.deviceId}:left", 6, horizontal <= -AXIS_TRIGGER)
            setEmulatorButton("axis:${event.deviceId}:right", 7, horizontal >= AXIS_TRIGGER)
            setEmulatorButton("axis:${event.deviceId}:up", 4, vertical <= -AXIS_TRIGGER)
            setEmulatorButton("axis:${event.deviceId}:down", 5, vertical >= AXIS_TRIGGER)
            return true
        }

        var handled = false
        handled = emitAxis(horizontal, negative = "left", positive = "right", event.eventTime) || handled
        handled = emitAxis(vertical, negative = "up", positive = "down", event.eventTime) || handled
        return handled || super.dispatchGenericMotionEvent(event)
    }

    /**
     * 游戏页面仍在栈中时恢复常亮，防止后台返回后沿用普通页面的熄屏状态。
     */
    override fun onResume() {
        super.onResume()
        activityResumed = true
        applyKeepScreenOn()
    }

    /**
     * 后台和系统遮挡期间释放窗口常亮；保留页面请求，返回前台时重新应用。
     */
    override fun onPause() {
        releaseEmulatorButtons()
        activityResumed = false
        applyKeepScreenOn()
        super.onPause()
    }

    /**
     * 按游戏页面请求及 Activity 可见状态设置窗口标志。
     *
     * 不持有 WakeLock，不改系统设置；窗口为空或已经销毁时忽略，避免生命周期崩溃。
     */
    private fun applyKeepScreenOn() {
        val activityWindow = window ?: return
        val enabled = keepScreenOnRequested && activityResumed && !isFinishing && !isDestroyed
        if (enabled) {
            activityWindow.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            activityWindow.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        Log.d("BbkWindow", "keepScreenOn=$enabled requested=$keepScreenOnRequested")
    }

    override fun onDestroy() {
        keepScreenOnRequested = false
        activityResumed = false
        applyKeepScreenOn()
        windowMethodChannel?.setMethodCallHandler(null)
        windowMethodChannel = null
        gamepadEventSink = null
        releaseEmulatorButtons()
        emulatorEventSink = null
        romStorageChannel?.close()
        romStorageChannel = null
        lastEmissionTime.clear()
        super.onDestroy()
    }

    /** 特殊文件权限通过系统 Activity 返回；不能假定设置页面 RESULT_OK 表示已授权。 */
    @Deprecated("使用旧回调与 FlutterActivity 的权限分发保持兼容")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        romStorageChannel?.onPermissionResult(requestCode)
    }

    /** Android 6～10 存储权限申请完成后重新检查，保持取消/拒绝路径可恢复。 */
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        romStorageChannel?.onPermissionResult(requestCode)
    }

    /** 实体键与摇杆分别保留来源，某个来源释放不会误释放另一个来源仍按住的按钮。 */
    private fun setEmulatorButton(source: String, button: Int, pressed: Boolean) {
        if (pressed) {
            if (emulatorPressedSources.put(source, button) == button) return
        } else if (emulatorPressedSources.remove(source) == null) return
        emulatorEventSink?.success(mapOf("source" to source, "button" to button, "pressed" to pressed))
    }

    /** 退后台释放全部真实输入，避免恢复后方向/射击永久按住。 */
    private fun releaseEmulatorButtons() {
        emulatorPressedSources.toMap().forEach { (source, button) -> setEmulatorButton(source, button, false) }
        emulatorPressedSources.clear()
    }

    /** 模拟器独立保留 Start/Select、A/B/X/Y，与旧游戏离散业务动作互不混用。 */
    private fun mapEmulatorKey(keyCode: Int): Int? = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_UP -> 4
        KeyEvent.KEYCODE_DPAD_DOWN -> 5
        KeyEvent.KEYCODE_DPAD_LEFT -> 6
        KeyEvent.KEYCODE_DPAD_RIGHT -> 7
        KeyEvent.KEYCODE_BUTTON_A -> 8
        KeyEvent.KEYCODE_BUTTON_B -> 0
        KeyEvent.KEYCODE_BUTTON_X -> 9
        KeyEvent.KEYCODE_BUTTON_Y -> 1
        KeyEvent.KEYCODE_BUTTON_START -> 3
        KeyEvent.KEYCODE_BUTTON_SELECT -> 2
        KeyEvent.KEYCODE_BUTTON_L1 -> 10
        KeyEvent.KEYCODE_BUTTON_R1 -> 11
        else -> null
    }

    private fun isControllerSource(source: Int): Boolean {
        return source and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD ||
            source and InputDevice.SOURCE_DPAD == InputDevice.SOURCE_DPAD ||
            source and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK
    }

    private fun centeredAxis(event: MotionEvent, axis: Int): Float {
        val range = event.device?.getMotionRange(axis, event.source) ?: return 0f
        val value = event.getAxisValue(axis)
        return if (abs(value) > range.flat.coerceAtLeast(AXIS_DEAD_ZONE)) value else 0f
    }

    private fun emitAxis(value: Float, negative: String, positive: String, eventTime: Long): Boolean {
        val action = when {
            value <= -AXIS_TRIGGER -> negative
            value >= AXIS_TRIGGER -> positive
            else -> return false
        }
        if (shouldEmit(action, eventTime)) emit(action)
        return true
    }

    private fun shouldEmit(action: String, eventTime: Long): Boolean {
        val previous = lastEmissionTime[action]
        if (previous != null && eventTime - previous < REPEAT_INTERVAL_MILLIS) return false
        lastEmissionTime[action] = eventTime
        return true
    }

    private fun emit(action: String) {
        gamepadEventSink?.success(action)
    }

    private fun mapKeyCode(keyCode: Int): String? {
        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> "up"
            KeyEvent.KEYCODE_DPAD_DOWN -> "down"
            KeyEvent.KEYCODE_DPAD_LEFT -> "left"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
            KeyEvent.KEYCODE_BUTTON_A,
            KeyEvent.KEYCODE_BUTTON_START,
            KeyEvent.KEYCODE_ENTER,
            -> "confirm"
            KeyEvent.KEYCODE_BUTTON_B,
            KeyEvent.KEYCODE_BUTTON_SELECT,
            KeyEvent.KEYCODE_ESCAPE,
            KeyEvent.KEYCODE_BACK,
            -> "cancel"
            KeyEvent.KEYCODE_BUTTON_L1,
            KeyEvent.KEYCODE_PAGE_UP,
            -> "pageUp"
            KeyEvent.KEYCODE_BUTTON_R1,
            KeyEvent.KEYCODE_PAGE_DOWN,
            -> "pageDown"
            KeyEvent.KEYCODE_BUTTON_X -> "search"
            KeyEvent.KEYCODE_BUTTON_Y -> "help"
            else -> null
        }
    }

    private companion object {
        const val GAMEPAD_EVENT_CHANNEL = "com.xiongjian.bbkclassics/gamepad_events"
        const val WINDOW_METHOD_CHANNEL = "com.xiongjian.bbkclassics/window"
        const val EMULATOR_EVENT_CHANNEL = "com.xiongjian.bbkclassics/emulator_gamepad_events"
        const val AXIS_DEAD_ZONE = 0.18f
        const val AXIS_TRIGGER = 0.55f
        const val REPEAT_INTERVAL_MILLIS = 110L
        val REPEATABLE_ACTIONS = setOf("up", "down", "left", "right", "pageUp", "pageDown")
    }
}
