package com.xiongjian.bbkclassics

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import java.lang.ref.WeakReference

/**
 * 用户正在运行的游戏会话对应的前台服务；从可见游戏页面启动，不开机启动、不自动复活。
 *
 * 只有应用进入后台才持有PARTIAL_WAKE_LOCK，允许熄屏但保持游戏逻辑推进。
 * CPU锁有超时并定期续期，退出游戏、移除任务或停止通知时立即释放。
 */
class GameExecutionService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private var session: Long? = null
    private val renewLock = object : Runnable {
        override fun run() {
            if (session != desiredSession || !backgroundRequested) return
            releaseWakeLock()
            acquireWakeLock()
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = WeakReference(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "游戏后台运行", NotificationManager.IMPORTANCE_LOW),
            )
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val incoming = intent?.getLongExtra(EXTRA_SESSION, -1L)
        if (incoming == null || incoming != desiredSession) {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        if (intent?.action == ACTION_STOP) {
            GameBackgroundExecution.stopCurrent()
            stopSelf()
            return START_NOT_STICKY
        }
        session = incoming
        val title = intent?.getStringExtra(EXTRA_TITLE)?.take(64) ?: "游戏"
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, GameExecutionService::class.java).setAction(ACTION_STOP)
                .putExtra(EXTRA_SESSION, incoming),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val notification = builder.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("$title · 后台继续运行")
            .setContentText("点击返回游戏，退出游戏后自动停止")
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(null, "停止后台运行", stop).build())
            .build()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            updateWakeLock()
        } catch (error: RuntimeException) {
            Log.w(TAG, "Foreground service unavailable: ${error.javaClass.simpleName}")
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        GameBackgroundExecution.stopCurrent()
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    /** 所有状态由主线程收敛；返回前台立即释放CPU锁，不影响窗口独立的常亮设置。 */
    private fun updateWakeLock() {
        handler.removeCallbacks(renewLock)
        if (session == desiredSession && backgroundRequested) acquireWakeLock() else releaseWakeLock()
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                wakeLock = (getSystemService(POWER_SERVICE) as? PowerManager)
                    ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bbk:game-background")
                    ?.also { it.setReferenceCounted(false) }
            }
            if (wakeLock?.isHeld != true) wakeLock?.acquire(LOCK_TIMEOUT_MS)
            handler.postDelayed(renewLock, LOCK_TIMEOUT_MS / 2)
        } catch (error: RuntimeException) {
            Log.w(TAG, "Wake lock unavailable: ${error.javaClass.simpleName}")
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (error: RuntimeException) {
            Log.w(TAG, "Wake lock already released: ${error.javaClass.simpleName}")
        }
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        releaseWakeLock()
        wakeLock = null
        if (instance?.get() === this) instance = null
        super.onDestroy()
    }

    companion object {
        private const val TAG = "BbkBackground"
        private const val CHANNEL_ID = "bbk-game-execution"
        private const val NOTIFICATION_ID = 1201
        private const val EXTRA_SESSION = "session"
        private const val EXTRA_TITLE = "title"
        private const val ACTION_STOP = "com.xiongjian.bbkclassics.STOP_BACKGROUND_GAME"
        private const val LOCK_TIMEOUT_MS = 10 * 60 * 1000L
        // Activity、Service回调和时钟请求统一在主线程，不跨线程读写这些会话字段。
        private var desiredSession: Long? = null
        private var backgroundRequested = false
        private var instance: WeakReference<GameExecutionService>? = null

        fun start(context: Context, session: Long, title: String): Boolean {
            desiredSession = session
            return try {
                val intent = Intent(context, GameExecutionService::class.java)
                    .putExtra(EXTRA_SESSION, session).putExtra(EXTRA_TITLE, title)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
                else context.startService(intent)
                true
            } catch (error: RuntimeException) {
                Log.w(TAG, "Cannot start background game: ${error.javaClass.simpleName}")
                desiredSession = null
                false
            }
        }

        fun isRunning(session: Long): Boolean = instance?.get()?.session == session

        fun setBackground(session: Long, enabled: Boolean) {
            if (desiredSession != session) return
            backgroundRequested = enabled
            instance?.get()?.updateWakeLock()
        }

        fun stop(context: Context, session: Long) {
            if (desiredSession != session) return
            desiredSession = null
            backgroundRequested = false
            instance?.get()?.updateWakeLock()
            context.stopService(Intent(context, GameExecutionService::class.java))
        }
    }
}
