package com.xiongjian.bbkclassics

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * 当前游戏WebView的后台时钟。只在Android主线程切换会话和操作WebView。
 *
 * 后台浏览器会限制setTimeout/setInterval；这里按网页请求的最近到期时间唤醒JS，
 * 不注入游戏按键、不补算离线回合。只弱引用WebView，页面退出立即取消排队任务。
 * @param context 仅保留applicationContext，不持有Activity。
 */
internal class GameBackgroundExecution(context: Context?) {
    private val appContext = context?.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private val background = AtomicBoolean(false)
    private var webView: WeakReference<WebView>? = null
    private var identifier: Long? = null
    @Volatile private var generation = 0L
    private var requested = false
    private var title = "游戏"
    private var previousPriority: Pair<Int, Boolean>? = null
    private val tick = Runnable {
        if (requested && background.get()) evaluate("window.BbkBackgroundRuntime&&window.BbkBackgroundRuntime.tick();")
    }

    /** 绑定已创建的游戏视图。必须在页面加载前安装桥，供引擎最早的定时器使用。 */
    fun attach(view: WebView?, id: Long, gameTitle: String?): Boolean {
        check(Looper.myLooper() == Looper.getMainLooper())
        close()
        val context = appContext ?: return false
        if (view == null) return false
        identifier = id
        title = gameTitle?.take(64)?.ifBlank { null } ?: "游戏"
        webView = WeakReference(view)
        requested = true
        val epoch = sequence.incrementAndGet()
        generation = epoch
        view.addJavascriptInterface(TimerBridge(WeakReference(this), epoch), BRIDGE_NAME)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            previousPriority = view.rendererRequestedPriority to view.rendererPriorityWaivedWhenNotVisible
            view.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        }
        current = WeakReference(this)
        // 加载途中切后台可能受系统启动限制；保留视图请求，onResume会重试服务。
        return GameExecutionService.start(context, epoch, title)
    }

    /** 页面销毁请求带上视图ID，旧页面迟到的释放不能停止刚进入的新游戏。 */
    fun detach(id: Long?) {
        if (id != null && identifier == id) close()
    }

    /** 返回前台恢复浏览器调度；后台保留原游戏时钟并按需申请CPU锁。 */
    fun setBackground(enabled: Boolean) {
        check(Looper.myLooper() == Looper.getMainLooper())
        background.set(enabled)
        handler.removeCallbacks(tick)
        if (!requested) return
        val context = appContext ?: return
        if (!enabled && !GameExecutionService.isRunning(generation)) {
            GameExecutionService.start(context, generation, title)
        }
        GameExecutionService.setBackground(generation, enabled)
        evaluate("window.BbkBackgroundRuntime&&window.BbkBackgroundRuntime.setBackground($enabled);")
    }

    /** JS桥在WebView专用线程调用；投递到主线程后再核对会话代数，丢弃旧页面请求。 */
    private fun schedule(epoch: Long, delay: Double) {
        handler.post {
            if (!requested || generation != epoch || !background.get()) return@post
            handler.removeCallbacks(tick)
            if (delay.isFinite() && delay >= 0) {
                handler.postDelayed(tick, delay.toLong().coerceIn(4L, 60_000L))
            }
        }
    }

    private fun evaluate(script: String) {
        val view = webView?.get() ?: return
        try {
            view.evaluateJavascript(script, null)
        } catch (error: RuntimeException) {
            Log.w(TAG, "WebView unavailable: ${error.javaClass.simpleName}")
        }
    }

    /** 退出游戏、销毁Activity或点击停止后台运行时，及时释放桥、通知和CPU锁。 */
    fun close() {
        handler.removeCallbacksAndMessages(null)
        if (requested) {
            evaluate("window.BbkBackgroundRuntime&&window.BbkBackgroundRuntime.setBackground(false);")
            webView?.get()?.let { view ->
                try {
                    view.removeJavascriptInterface(BRIDGE_NAME)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        previousPriority?.let { view.setRendererPriorityPolicy(it.first, it.second) }
                    }
                } catch (error: RuntimeException) {
                    // 平台视图可能先于Dart页面销毁；仍须继续释放服务与CPU锁。
                    Log.w(TAG, "WebView already disposed: ${error.javaClass.simpleName}")
                }
            }
            appContext?.let { GameExecutionService.stop(it, generation) }
        }
        requested = false
        background.set(false)
        generation = sequence.incrementAndGet()
        identifier = null
        webView?.clear()
        webView = null
        previousPriority = null
        if (current?.get() === this) current = null
    }

    /** 只暴露计时请求和原子状态查询，不向网页开放Context、文件或系统命令。 */
    @androidx.annotation.Keep
    private class TimerBridge(
        private val owner: WeakReference<GameBackgroundExecution>,
        private val epoch: Long,
    ) {
        @JavascriptInterface
        fun schedule(delay: Double) { owner.get()?.schedule(epoch, delay) }

        @JavascriptInterface
        fun isBackground(): Boolean = owner.get()?.let {
            it.background.get() && it.generation == epoch
        } ?: false
    }

    companion object {
        private const val TAG = "BbkBackground"
        private const val BRIDGE_NAME = "BbkBackgroundClock"
        private val sequence = AtomicLong()
        private var current: WeakReference<GameBackgroundExecution>? = null

        /** 通知按钮和任务移除均在主线程分发，不持有Activity或WebView强引用。 */
        fun stopCurrent() { current?.get()?.close() }
    }
}
