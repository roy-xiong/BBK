package com.xiongjian.bbkclassics

import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import kotlin.math.abs

/**
 * Flutter 容器 Activity，同时把 Android 手柄按键与摇杆事件转发给 Dart。
 *
 * 仅消费来源明确为 GAMEPAD、DPAD 或 JOYSTICK 的事件，手机返回键和普通键盘仍交由
 * Flutter/Android 默认流程处理，避免改变应用正常导航行为。
 */
class MainActivity : FlutterActivity() {
    private var gamepadEventSink: EventChannel.EventSink? = null
    private val lastEmissionTime = mutableMapOf<String, Long>()

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
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

        var handled = false
        handled = emitAxis(horizontal, negative = "left", positive = "right", event.eventTime) || handled
        handled = emitAxis(vertical, negative = "up", positive = "down", event.eventTime) || handled
        return handled || super.dispatchGenericMotionEvent(event)
    }

    override fun onDestroy() {
        gamepadEventSink = null
        lastEmissionTime.clear()
        super.onDestroy()
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
        const val AXIS_DEAD_ZONE = 0.18f
        const val AXIS_TRIGGER = 0.55f
        const val REPEAT_INTERVAL_MILLIS = 110L
        val REPEATABLE_ACTIONS = setOf("up", "down", "left", "right", "pageUp", "pageDown")
    }
}
