package com.xiongjian.bbkclassics

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Paint
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.view.Surface
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.view.TextureRegistry
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference

/**
 * 原机运行时宿主。一条工作线程串行管理 CPU、按键、存档、声音和 Surface 绘制。
 *
 * 所有 Flutter 通道回复和纹理注册/释放回到主线程；JNI 句柄不跨线程并发访问。
 * Activity 仅用弱引用打开系统文件选择器，页面退出后不被模拟器持有。
 */
internal class BbkRuntimeHost(context: Context?, engine: FlutterEngine, activity: Activity?) {
    private val activityRef = WeakReference(activity)
    private val assetStore = BbkAssetStore(context)
    private val audioManager = context?.applicationContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    private val renderer = engine.renderer
    private val main = Handler(Looper.getMainLooper())
    private val thread = HandlerThread("BbkEmulator").also { it.start() }
    private val worker = Handler(thread.looper)
    private val channel = MethodChannel(engine.dartExecutor.binaryMessenger, "com.xiongjian.bbkclassics/bbk_runtime")
    private val eventChannel = EventChannel(engine.dartExecutor.binaryMessenger, "com.xiongjian.bbkclassics/bbk_runtime_events")
    private var sink: EventChannel.EventSink? = null
    private var pendingImport: MethodChannel.Result? = null
    private var opening = false
    private var detached = false
    // 下列可变字段只由 worker 访问。
    private var session: Session? = null
    private var foreground = true
    private var focusGranted = true
    private var focusRequest: AudioFocusRequest? = null
    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        worker.post {
            focusGranted = change == AudioManager.AUDIOFOCUS_GAIN
            if (focusGranted) schedule() else pauseAndCheckpoint()
        }
    }

    init {
        channel.setMethodCallHandler(::onMethodCall)
        eventChannel.setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) { sink = events }
            override fun onCancel(arguments: Any?) { sink = null }
        })
    }

    private class Session(
        val handle: Long,
        val texture: TextureRegistry.SurfaceTextureEntry,
        val surface: Surface,
        val saves: File,
    ) {
        val pixels = IntArray(159 * 96)
        val pcm = ShortArray(735)
        val bitmap: Bitmap = Bitmap.createBitmap(159, 96, Bitmap.Config.ARGB_8888)
        val paint = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
        var audio: AudioTrack? = null
        var manuallyPaused = false
        var muted = false
        var keyGeneration = 0L
        var nextFrameNanos = 0L
        var checkpointMillis = SystemClock.uptimeMillis()
        var previousSram: ByteArray? = null
    }

    private fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (detached) { result.error("disposed", "原机运行时已关闭", null); return }
        when (call.method) {
            "start" -> start(call, result)
            "importAssets" -> {
                val activity = activityRef.get()
                if (pendingImport != null || opening || activity == null || activity.isFinishing) {
                    result.error("busy", "文件选择器暂不可用", null)
                    return
                }
                pendingImport = result
                try {
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream"))
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    activity.startActivityForResult(intent, IMPORT_REQUEST)
                } catch (error: Exception) {
                    pendingImport = null
                    result.error("import_unavailable", error.message ?: "无法打开文件选择器", null)
                }
            }
            "status" -> reply(result) { assetStore.status() }
            "preference" -> reply(result) {
                assetStore.setPreference(call.argument<String>("id"), call.argument<String>("key"), call.argument<Any>("value"))
                null
            }
            "pause" -> reply(result) {
                val current = active(call)
                current.manuallyPaused = call.argument<Boolean>("paused") ?: error("缺少暂停状态")
                if (session?.manuallyPaused == true) pauseAndCheckpoint() else schedule()
                null
            }
            "mute" -> reply(result) {
                val current = active(call)
                current.muted = call.argument<Boolean>("muted") ?: error("缺少静音状态")
                if (session?.muted == true) stopAudio() else schedule()
                null
            }
            "input" -> reply(result) {
                val current = active(call)
                val code = call.argument<Number>("code")?.toInt() ?: error("缺少按键")
                require(code in 0..0x3b) { "按键无效" }
                if (!current.manuallyPaused && foreground) {
                    BbkNative.key(current.handle, code)
                    val generation = ++current.keyGeneration
                    worker.postDelayed({
                        if (session === current && generation == current.keyGeneration) {
                            runCatching { BbkNative.key(current.handle, -1) }
                                .onFailure { emit(current.handle, "error", it.message ?: "按键释放失败") }
                        }
                    }, 70)
                }
                null
            }
            "command" -> reply(result) {
                val current = active(call)
                val request = call.argument<String>("request") ?: error("缺少命令")
                val response = BbkNative.command(current.handle, request) ?: error("模拟器没有返回命令结果")
                val operation = JSONObject(request).optString("op")
                if (JSONObject(response).optBoolean("ok") && (operation in setOf("cheatAdd", "cheatImport", "cheatToggle", "cheatRemove") || JSONObject(request).optBoolean("lock"))) {
                    saveCheats(current)
                }
                response
            }
            "saveState" -> reply(result) {
                val current = active(call)
                val bytes = BbkNative.exportState(current.handle, 1) ?: error("无法生成即时状态")
                BbkAssetStore.writeAtomic(File(current.saves, "quick.bbks"), bytes)
                checkpoint(current)
                null
            }
            "loadState" -> reply(result) {
                val current = active(call)
                val bytes = BbkAssetStore.readAtomic(File(current.saves, "quick.bbks"), 8 * 1024 * 1024)
                    ?: error("当前游戏尚未保存即时状态")
                BbkNative.importState(current.handle, 1, bytes)
                BbkNative.key(current.handle, -1)
                checkpoint(current)
                null
            }
            "close" -> reply(result) {
                active(call)
                closeSession()
                null
            }
            else -> result.notImplemented()
        }
    }

    /** 注册纹理在主线程完成，读取资源和初始化系统 ROM 在 worker 完成。 */
    private fun start(call: MethodCall, result: MethodChannel.Result) {
        if (opening) { result.error("busy", "正在打开游戏", null); return }
        val id = call.argument<String>("id")
        val model = call.argument<String>("model")
        if (model !in setOf("a4980", "a4988")) { result.error("model", "机型无效", null); return }
        opening = true
        val texture = renderer.createSurfaceTexture()
        texture.surfaceTexture().setDefaultBufferSize(159, 96)
        worker.post {
            var current: Session? = null
            var looseHandle = 0L
            var looseSurface: Surface? = null
            try {
                check(session == null) { "上一局尚未关闭" }
                check(BbkNative.loadError == null) { BbkNative.loadError.orEmpty() }
                val gam = assetStore.gameBytes(id)
                val font = assetStore.romBytes(model, "8.BIN")
                val os = assetStore.romBytes(model, "E.BIN")
                looseHandle = BbkNative.create(if (model == "a4988") 4988 else 4980, gam, font, os)
                check(looseHandle > 0) { "创建模拟器失败" }
                val saves = assetStore.saveDirectory(id, model, gam, font, os)
                looseSurface = Surface(texture.surfaceTexture())
                val newSession = Session(looseHandle, texture, looseSurface, saves)
                current = newSession
                val sram = BbkAssetStore.readAtomic(File(saves, "sram.bin"), 0x14000)
                if (sram != null) BbkNative.importState(newSession.handle, 0, sram)
                newSession.previousSram = sram
                restoreCheats(newSession)
                session = newSession
                requestAudioFocus()
                assetStore.setPreference(id, "lastPlayed", System.currentTimeMillis())
                schedule()
                main.post {
                    opening = false
                    result.success(mapOf("session" to newSession.handle, "texture" to texture.id(), "width" to 159, "height" to 96))
                }
            } catch (error: Exception) {
                if (session === current) session = null
                if (looseHandle > 0) runCatching { BbkNative.destroy(looseHandle) }
                looseSurface?.release()
                current?.bitmap?.recycle()
                main.post { texture.release(); opening = false; result.error("start_failed", error.message ?: "启动失败", null) }
            } catch (error: LinkageError) {
                main.post { texture.release(); opening = false; result.error("native_unavailable", error.message, null) }
            }
        }
    }

    /** 用纳秒时钟避免 16/17ms 取整长期漂移；帧暂停时不继续补跑积压帧。 */
    private val frame = object : Runnable {
        override fun run() {
            val current = session ?: return
            if (!foreground || !focusGranted || current.manuallyPaused) return
            try {
                val running = BbkNative.frame(current.handle, current.pixels, current.pcm)
                current.bitmap.setPixels(current.pixels, 0, 159, 0, 0, 159, 96)
                if (current.surface.isValid) {
                    val canvas = current.surface.lockCanvas(null)
                    try { canvas.drawColor(Color.BLACK); canvas.drawBitmap(current.bitmap, 0f, 0f, current.paint) }
                    finally { current.surface.unlockCanvasAndPost(canvas) }
                }
                if (!current.muted) {
                    val audio = ensureAudio(current)
                    audio?.write(current.pcm, 0, current.pcm.size, AudioTrack.WRITE_NON_BLOCKING)
                }
                if (SystemClock.uptimeMillis() - current.checkpointMillis >= 15000) checkpoint(current)
                if (!running) {
                    current.manuallyPaused = true
                    pauseAndCheckpoint()
                    emit(current.handle, "stopped", "游戏已结束运行，可以返回游戏库重新开始")
                    return
                }
                current.nextFrameNanos += 16_666_667L
                val now = System.nanoTime()
                if (current.nextFrameNanos < now - 100_000_000L) current.nextFrameNanos = now
                worker.postDelayed(this, ((current.nextFrameNanos - now) / 1_000_000L).coerceAtLeast(0L))
            } catch (error: Exception) {
                current.manuallyPaused = true
                stopAudio()
                emit(current.handle, "error", error.message ?: "模拟器运行异常")
            } catch (error: LinkageError) {
                current.manuallyPaused = true
                stopAudio()
                emit(current.handle, "error", error.message ?: "原机运行时不可用")
            }
        }
    }

    private fun schedule() {
        worker.removeCallbacks(frame)
        val current = session ?: return
        if (!foreground || !focusGranted || current.manuallyPaused) return
        current.nextFrameNanos = System.nanoTime()
        worker.post(frame)
    }

    private fun active(call: MethodCall): Session {
        val current = session ?: error("游戏会话未启动")
        require(call.argument<Number>("session")?.toLong() == current.handle) { "游戏会话已过期" }
        return current
    }

    private fun reply(result: MethodChannel.Result, operation: () -> Any?) {
        worker.post {
            try {
                val response = operation()
                main.post { result.success(response) }
            } catch (error: Exception) {
                main.post { result.error("runtime_error", error.message ?: "操作失败", null) }
            } catch (error: LinkageError) {
                main.post { result.error("native_unavailable", error.message, null) }
            }
        }
    }

    private fun emit(id: Long, type: String, message: String) {
        main.post { if (!detached) sink?.success(mapOf("session" to id, "type" to type, "message" to message)) }
    }

    private fun checkpoint(current: Session) {
        val bytes = BbkNative.exportState(current.handle, 0) ?: error("原机存档导出失败")
        if (current.previousSram?.contentEquals(bytes) != true) {
            BbkAssetStore.writeAtomic(File(current.saves, "sram.bin"), bytes)
            current.previousSram = bytes
        }
        current.checkpointMillis = SystemClock.uptimeMillis()
    }

    private fun saveCheats(current: Session) {
        val list = BbkNative.command(current.handle, "{\"op\":\"cheatList\"}") ?: error("作弊列表读取失败")
        val result = JSONObject(list)
        check(result.optBoolean("ok")) { result.optString("message") }
        val cheats = result.getJSONObject("data").getJSONArray("cheats")
        BbkAssetStore.writeAtomic(File(current.saves, "cheats.json"), cheats.toString().toByteArray())
    }

    private fun restoreCheats(current: Session) {
        val bytes = BbkAssetStore.readAtomic(File(current.saves, "cheats.json"), 256 * 1024) ?: return
        val entries = JSONArray(bytes.toString(Charsets.UTF_8))
        require(entries.length() <= 1024) { "作弊条目过多" }
        for (index in 0 until entries.length()) {
            val entry = entries.getJSONObject(index)
            val request = JSONObject().put("op", "cheatAdd").put("code", entry.getString("code")).put("enabled", entry.getBoolean("enabled"))
            val response = JSONObject(BbkNative.command(current.handle, request.toString()) ?: error("无法恢复作弊"))
            check(response.optBoolean("ok")) { response.optString("message") }
        }
    }

    private fun ensureAudio(current: Session): AudioTrack? {
        current.audio?.let { return it }
        val minimum = AudioTrack.getMinBufferSize(44100, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minimum <= 0) return null
        return try {
            AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(44100).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(minimum.coerceAtLeast(735 * 2 * 4))
                .setTransferMode(AudioTrack.MODE_STREAM).build().also { audio ->
                    if (audio.state == AudioTrack.STATE_INITIALIZED) { audio.play(); current.audio = audio }
                    else audio.release()
                }.takeIf { it.state == AudioTrack.STATE_INITIALIZED }
        } catch (_: IllegalArgumentException) { null }
    }

    private fun stopAudio() {
        session?.audio?.let { audio ->
            runCatching { audio.pause(); audio.flush(); audio.release() }
        }
        session?.audio = null
    }

    private fun requestAudioFocus() {
        focusGranted = if (Build.VERSION.SDK_INT >= 26) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).build())
                .setOnAudioFocusChangeListener(focusListener, main).build()
            focusRequest = request
            audioManager?.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            val result = audioManager?.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
            result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
    }

    private fun pauseAndCheckpoint() {
        worker.removeCallbacks(frame)
        val current = session ?: return
        current.keyGeneration++
        runCatching { BbkNative.key(current.handle, -1); checkpoint(current) }
            .onFailure { emit(current.handle, "saveError", it.message ?: "原机存档保存失败") }
        stopAudio()
    }

    /** Activity 遮挡、锁屏与后台均停止 CPU，不依赖 Dart 生命周期消息及时到达。 */
    fun setForeground(value: Boolean) {
        if (detached) return
        worker.post {
            foreground = value
            if (value) { if (!focusGranted && session != null) requestAudioFocus(); schedule() }
            else pauseAndCheckpoint()
        }
    }

    private fun closeSession() {
        val current = session ?: return
        pauseAndCheckpoint()
        try { saveCheats(current) }
        finally {
            runCatching { BbkNative.destroy(current.handle) }
            current.surface.release()
            current.bitmap.recycle()
            session = null
            if (Build.VERSION.SDK_INT >= 26) focusRequest?.let { audioManager?.abandonAudioFocusRequest(it) }
            else { @Suppress("DEPRECATION") audioManager?.abandonAudioFocus(focusListener) }
            focusRequest = null
            main.post { current.texture.release() }
        }
    }

    fun onActivityResult(request: Int, result: Int, data: Intent?): Boolean {
        if (request != IMPORT_REQUEST) return false
        val pending = pendingImport ?: return true
        pendingImport = null
        if (result != Activity.RESULT_OK) { pending.success(null); return true }
        reply(pending) { check(session == null) { "请先退出游戏再导入资源" }; assetStore.importZip(data?.data) }
        return true
    }

    /** 销毁时先排队完成会话清理，再退出工作线程，不用阻塞主线程等待 join。 */
    fun dispose() {
        if (detached) return
        detached = true
        channel.setMethodCallHandler(null)
        eventChannel.setStreamHandler(null)
        pendingImport?.error("disposed", "页面已关闭", null)
        pendingImport = null
        sink = null
        activityRef.clear()
        worker.post { try { closeSession() } finally { thread.quitSafely() } }
    }

    private companion object { const val IMPORT_REQUEST = 8484 }
}
