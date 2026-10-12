package com.xiongjian.bbkclassics

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Android 外置 ROM 的权限与目录扫描通道。
 *
 * UI 与权限申请只在主线程执行，目录遍历和流式 SHA-256 在单独的 IO 执行器执行。
 * 扫描只访问主共享存储的 BBK，不跟随指向目录外的链接；释放时取消任务与平台回调。
 */
class RomStorageChannel(activity: Activity, messenger: BinaryMessenger) {
    private val assets = activity.applicationContext.assets
    private var activity: Activity? = activity
    private val channel = MethodChannel(messenger, "com.xiongjian.bbkclassics/rom_storage")
    private val mainHandler = Handler(Looper.getMainLooper())
    private val ioExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var closed = false
    private var pendingPermission: MethodChannel.Result? = null

    init {
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "requestPermission" -> requestPermission(result)
                "scan" -> {
                    if (!hasPermission()) {
                        result.success(mapOf("authorized" to false, "root" to rootDirectory().path))
                    } else {
                        ioExecutor.execute {
                            try {
                                val snapshot = scan()
                                mainHandler.post { if (!closed) result.success(snapshot) }
                            } catch (error: Exception) {
                                mainHandler.post {
                                    if (!closed) result.error("scan_failed", error.message ?: "扫描 BBK 目录失败", null)
                                }
                            }
                        }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    /** 返回当前用户的主共享存储，不硬编码 user 0，也不使用 Android/data。 */
    @Suppress("DEPRECATION")
    private fun rootDirectory(): File = File(Environment.getExternalStorageDirectory(), "BBK")

    /** Android 11+ 特殊权限与旧版运行时权限分别检查，不能以 Manifest 声明代替授权。 */
    private fun hasPermission(): Boolean {
        val host = activity ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            host.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED &&
                host.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }
    }

    /** 一次只保留一个授权请求，拒绝后返回 false，由用户主动重试。 */
    private fun requestPermission(result: MethodChannel.Result) {
        val host = activity
        if (host == null || host.isFinishing || host.isDestroyed) {
            result.error("activity_unavailable", "页面已关闭", null)
            return
        }
        if (hasPermission()) {
            result.success(true)
            return
        }
        if (pendingPermission != null) {
            result.error("permission_pending", "请先完成当前权限申请", null)
            return
        }
        pendingPermission = result
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:${host.packageName}"))
                try {
                    @Suppress("DEPRECATION")
                    host.startActivityForResult(intent, PERMISSION_REQUEST)
                } catch (_: android.content.ActivityNotFoundException) {
                    @Suppress("DEPRECATION")
                    host.startActivityForResult(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION), PERMISSION_REQUEST)
                }
            } else {
                host.requestPermissions(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE), PERMISSION_REQUEST)
            }
        } catch (error: Exception) {
            pendingPermission = null
            result.error("permission_unavailable", error.message ?: "无法打开存储权限设置", null)
        }
    }

    /** Activity 返回或旧版权限回调后重新检查实际授权值，取消也必须结束 pending 请求。 */
    fun onPermissionResult(requestCode: Int) {
        if (requestCode != PERMISSION_REQUEST) return
        val result = pendingPermission
        pendingPermission = null
        result?.success(hasPermission())
    }

    /**
     * 创建公共目录并扫描根目录、NES 与 ARCADE 的文件。
     *
     * SHA 缓存只减少重复读盘，不影响路径边界检查。单文件读失败会形成 issue；目录不能
     * 读取则整体报告失败，避免把权限撤销或存储卸载误显示为“没有游戏”。
     */
    private fun scan(): Map<String, Any> {
        val root = rootDirectory().canonicalFile
        if (Environment.getExternalStorageState(root) != Environment.MEDIA_MOUNTED) {
            throw IllegalStateException("共享存储不可写，请检查 SD 卡挂载状态")
        }
        if (!root.exists() && !root.mkdirs()) throw IllegalStateException("无法创建 ${root.path}")
        if (!root.isDirectory || !root.canRead() || !root.canWrite()) throw IllegalStateException("BBK 目录不可读写")
        for (name in listOf("NES", "ARCADE", "BIOS", "CHEATS", "SAVES", "STATES")) {
            val directory = checkedFile(root, File(root, name))
            if (!directory.exists() && !directory.mkdirs()) throw IllegalStateException("无法创建 $name 目录")
            if (!directory.isDirectory) throw IllegalStateException("$name 已存在但不是文件夹")
        }
        val cacheFile = checkedFile(root, File(root, ".bbk-index.json"))
        val cache = try {
            if (cacheFile.exists() && cacheFile.length() <= 4 * 1024 * 1024) JSONObject(cacheFile.readText()) else JSONObject()
        } catch (_: Exception) { JSONObject() }
        val nextCache = JSONObject()
        // ROM set 名称索引取官方 DAT 与固定 WASM 的交集；具体 CRC/芯片缺失仍由内核校验。
        val arcadeCatalogue = assets.open("flutter_assets/assets/games/emulator/fbneo-romsets.json")
            .bufferedReader().use { JSONObject(it.readText()).getJSONObject("games") }
        val games = mutableListOf<Map<String, Any>>()
        val issues = mutableListOf<Map<String, String>>()
        val visited = mutableSetOf<String>()
        var fileCount = 0
        fun visit(directory: File, depth: Int) {
            if (Thread.currentThread().isInterrupted) throw InterruptedException()
            if (depth > 4 || !visited.add(directory.canonicalPath)) return
            val files = directory.listFiles() ?: throw IllegalStateException("无法读取 ${directory.name}")
            for (candidate in files.sortedBy { it.name.lowercase() }) {
                if (++fileCount > 4000) throw IllegalStateException("BBK 扫描文件超过 4000 个，请精简目录")
                try {
                    val file = checkedFile(root, candidate)
                    if (file.isDirectory) {
                        if (depth > 0 || file.name == "NES" || file.name == "ARCADE") visit(file, depth + 1)
                        continue
                    }
                    val extension = file.extension.lowercase()
                    val family = when (extension) {
                        "nes", "fds", "unf", "unif" -> "nes"
                        "zip", "7z" -> "arcade"
                        else -> continue
                    }
                    if (file.name.equals("neogeo.zip", ignoreCase = true) || file.name.equals("gamegenie.nes", ignoreCase = true)) continue
                    if (file.length() < 16 || file.length() > 512L * 1024 * 1024) throw IllegalStateException("ROM 大小需在 16 字节到 512 MB 之间")
                    if (family == "arcade" && !file.name.matches(Regex("[A-Za-z0-9_+.-]+\\.(zip|7z)", RegexOption.IGNORE_CASE))) {
                        throw IllegalStateException("街机 ROM 请保留原始 ROM set 名称，例如 mslug.zip")
                    }
                    if (family == "arcade" && !arcadeCatalogue.has(file.nameWithoutExtension)) {
                        throw IllegalStateException("固定 FBNeo 内核未识别该 ROM set 名称，请保留原文件名")
                    }
                    validateHeader(file, extension)
                    val size = file.length()
                    val modified = file.lastModified()
                    val cached = cache.optJSONObject(file.path)
                    val oldHash = cached?.optString("sha256")
                    val hash = if (cached != null && cached.optLong("size") == size && cached.optLong("modified") == modified &&
                        oldHash != null && oldHash.matches(Regex("[a-f0-9]{64}"))) oldHash else hashFile(file)
                    if (file.length() != size || file.lastModified() != modified) throw IllegalStateException("文件在扫描期间被修改，请重新扫描")
                    val item = mutableMapOf<String, Any>("path" to file.path, "name" to file.name, "family" to family,
                        "size" to size, "modified" to modified, "sha256" to hash)
                    if (family == "arcade" && !arcadeCatalogue.isNull(file.nameWithoutExtension)) {
                        item["parent"] = arcadeCatalogue.getString(file.nameWithoutExtension)
                    }
                    games.add(item)
                    nextCache.put(file.path, JSONObject(item))
                } catch (error: Exception) {
                    if (error is InterruptedException) throw error
                    issues.add(mapOf("name" to candidate.name, "message" to (error.message ?: "读取失败")))
                }
            }
        }
        visit(root, 0)
        val temporary = checkedFile(root, File(root, ".bbk-index.json.tmp"))
        temporary.writeText(nextCache.toString())
        if (!temporary.renameTo(cacheFile)) temporary.delete()
        return mapOf("authorized" to true, "root" to root.path, "games" to games, "issues" to issues)
    }

    /** canonicalPath 边界比较带分隔符，BBK-else 和目录外的符号链接不能通过检查。 */
    private fun checkedFile(root: File, candidate: File): File {
        val file = candidate.canonicalFile
        if (!file.path.startsWith(root.path + File.separator)) throw IllegalStateException("文件不在 BBK 目录内")
        return file
    }

    /** 检查容器魔数；mapper、街机 ROM set 与 BIOS 的完整兼容性由固定内核最终校验。 */
    private fun validateHeader(file: File, extension: String) {
        val header = ByteArray(16)
        file.inputStream().use { if (it.read(header) != header.size) throw IllegalStateException("ROM 文件头不完整") }
        fun starts(vararg values: Int): Boolean = values.indices.all { header[it].toInt() and 0xff == values[it] }
        val valid = when (extension) {
            "nes" -> starts(0x4e, 0x45, 0x53, 0x1a)
            "unf", "unif" -> starts(0x55, 0x4e, 0x49, 0x46)
            "fds" -> starts(0x46, 0x44, 0x53, 0x1a) || file.length() % 65500L == 0L
            "zip" -> starts(0x50, 0x4b, 0x03, 0x04)
            "7z" -> starts(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)
            else -> false
        }
        if (!valid) throw IllegalStateException("文件内容与 .$extension 格式不符")
    }

    /** 固定大小缓冲区流式计算 hash，避免把大 ROM 完整放入 Java heap。 */
    private fun hashFile(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered(64 * 1024).use { stream ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                if (Thread.currentThread().isInterrupted) throw InterruptedException()
                val count = stream.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }

    /** 页面销毁后不持有 Activity、不交付旧扫描结果，也不留下未完成的授权请求。 */
    fun close() {
        closed = true
        channel.setMethodCallHandler(null)
        pendingPermission?.error("activity_closed", "页面已关闭", null)
        pendingPermission = null
        ioExecutor.shutdownNow()
        mainHandler.removeCallbacksAndMessages(null)
        activity = null
    }

    companion object { const val PERMISSION_REQUEST = 6842 }
}
