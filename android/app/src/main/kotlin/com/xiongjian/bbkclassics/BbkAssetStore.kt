package com.xiongjian.bbkclassics

import android.content.Context
import android.net.Uri
import android.util.AtomicFile
import io.flutter.FlutterInjector
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.text.Normalizer
import java.util.zip.ZipInputStream

/**
 * 原机游戏资产仓库。所有读写在运行时工作线程完成，只持有 applicationContext。
 *
 * ZIP 中的文件名仅用于匹配固定目录，输出路径完全由 catalog 和机型生成，
 * 因此不会把 ZIP 路径直接写入磁盘。每项先校验，再用 AtomicFile 替换。
 */
internal class BbkAssetStore(context: Context?) {
    private val appContext = context?.applicationContext
    private val root = appContext?.filesDir?.let { File(it, "bbk") }
    private var cachedCatalog: JSONArray? = null

    /** 读取 APK 内固定目录，出错直接报告，不能把错误目录当成空游戏库。 */
    fun catalog(): JSONArray {
        cachedCatalog?.let { return it }
        val bytes = asset("assets/bbk/catalog.json") ?: error("原机游戏目录缺失")
        return JSONObject(bytes.toString(Charsets.UTF_8)).getJSONArray("games").also { cachedCatalog = it }
    }

    fun game(id: String?): JSONObject {
        require(id != null && id.matches(Regex("rpg-[0-9]{3}"))) { "游戏标识无效" }
        val list = catalog()
        for (index in 0 until list.length()) {
            val game = list.getJSONObject(index)
            if (game.getString("id") == id) return game
        }
        error("游戏未注册")
    }

    /** 优先使用手机导入内容，其次使用构建时内置资产，不合成缺失资源。 */
    fun gameBytes(id: String?): ByteArray {
        val entry = game(id)
        val local = File(contentRoot(), "games/${entry.getString("id")}.gam")
        val bytes = readAtomic(local, 0x1e0000) ?: asset(entry.getString("assetPath"))
            ?: error("尚未导入《${entry.getString("title")}》的 GAM 文件，请在原机游戏库导入资源包")
        validateGam(bytes)
        if (!local.exists() && !entry.isNull("sha256")) {
            require(hash(bytes) == entry.getString("sha256")) { "内置 GAM 与目录哈希不一致" }
        }
        return bytes
    }

    fun romBytes(model: String?, name: String?): ByteArray {
        require(model in setOf("a4980", "a4988") && name in setOf("8.BIN", "E.BIN")) { "ROM 参数无效" }
        val local = File(contentRoot(), "roms/$model/$name")
        val bytes = readAtomic(local, 0x200000) ?: asset("assets/bbk/roms/$model/$name")
            ?: error("缺少 $model/$name，请把对应机型 ROM 放入资源包的 $model 目录")
        require(bytes.size == 0x200000) { "$model/$name 必须为 2MiB" }
        return bytes
    }

    /** 存档目录同时绑定游戏、机型、两份 ROM 哈希，不能跨改版或机型串档。 */
    fun saveDirectory(id: String?, model: String?, gam: ByteArray, font: ByteArray, os: ByteArray): File {
        val entry = game(id)
        return File(requireNotNull(root), "saves/${entry.getString("id")}/$model/${hash(gam)}/${hash(font).take(16)}-${hash(os).take(16)}")
            .also { check(it.isDirectory || it.mkdirs()) { "无法创建存档目录" } }
    }

    fun preferences(): JSONObject = readAtomic(File(requireNotNull(root), "library.json"), 1024 * 1024)
        ?.let { JSONObject(it.toString(Charsets.UTF_8)) } ?: JSONObject()

    fun setPreference(id: String?, key: String?, value: Any?) {
        val entry = game(id)
        require(key in setOf("favorite", "lastPlayed", "model")) { "设置字段无效" }
        if (key == "favorite") require(value is Boolean) { "收藏状态必须为布尔值" }
        if (key == "lastPlayed") require(value is Number && value.toLong() > 0) { "游玩时间无效" }
        if (key == "model") require(value in setOf("a4980", "a4988")) { "机型无效" }
        val preferences = preferences()
        val gameId = entry.getString("id")
        val gamePreferences = preferences.optJSONObject(gameId) ?: JSONObject()
        gamePreferences.put(key, value)
        preferences.put(gameId, gamePreferences)
        writeAtomic(File(requireNotNull(root), "library.json"), preferences.toString().toByteArray())
    }

    fun status(): Map<String, Any> {
        val list = catalog()
        val installed = mutableListOf<String>()
        for (index in 0 until list.length()) {
            val game = list.getJSONObject(index)
            val file = File(contentRoot(), "games/${game.getString("id")}.gam")
            if (file.exists() || (!game.isNull("sha256") && assetExists(game.getString("assetPath")))) {
                installed.add(game.getString("id"))
            }
        }
        val roms = mutableListOf<String>()
        for (model in listOf("a4980", "a4988")) {
            for (name in listOf("8.BIN", "E.BIN")) {
                if (File(contentRoot(), "roms/$model/$name").exists() || assetExists("assets/bbk/roms/$model/$name")) roms.add("$model/$name")
            }
        }
        return mapOf("installed" to installed, "roms" to roms, "preferences" to preferences().toString())
    }

    /**
     * 从系统文件选择器导入 ZIP。压缩包条目数量、解压总量及每项长度都有上限。
     *
     * 先在独立暂存目录校验所有条目；出现冲突或损坏时，既有资产不被替换。
     */
    fun importZip(uri: Uri?): Map<String, Any> {
        require(uri != null) { "没有选择资源包" }
        val context = requireNotNull(appContext)
        val staging = File(requireNotNull(root), "import-${java.util.UUID.randomUUID()}")
        check(staging.mkdirs()) { "无法创建导入目录" }
        val mapping = mutableMapOf<String, String>()
        val list = catalog()
        for (index in 0 until list.length()) {
            val entry = list.getJSONObject(index)
            mapping[normalize(entry.getString("fileName"))] = "games/${entry.getString("id")}.gam"
        }
        var total = 0L
        var count = 0
        val hashes = mutableMapOf<String, String>()
        try {
            val source = context.contentResolver.openInputStream(uri) ?: error("无法读取资源包")
            ZipInputStream(source.buffered()).use { input ->
                while (true) {
                    val entry = input.nextEntry ?: break
                    require(++count <= 10000) { "ZIP 条目过多" }
                    if (entry.isDirectory) continue
                    val parts = entry.name.replace('\\', '/').split('/')
                    val basename = normalize(parts.last())
                    val model = parts.dropLast(1).lastOrNull { normalize(it) in setOf("a4980", "a4988", "4980", "4988") }
                        ?.let { normalize(it).removePrefix("a").let { number -> "a$number" } }
                    val relative = mapping[basename] ?: if (model != null && basename in setOf("8.bin", "e.bin")) "roms/$model/${basename.uppercase()}" else null
                    val bytes = boundedRead(input, 0x200000)
                    total += bytes.size
                    require(total <= 384L * 1024 * 1024) { "资源包解压体积过大" }
                    if (relative == null) continue
                    if (relative.endsWith(".gam")) validateGam(bytes)
                    else require(bytes.size == 0x200000) { "$relative 必须为 2MiB" }
                    val fingerprint = hash(bytes)
                    require(hashes[relative] == null || hashes[relative] == fingerprint) { "资源包中同名文件内容不同：$relative" }
                    hashes[relative] = fingerprint
                    val target = File(staging, relative)
                    check(target.parentFile?.let { it.isDirectory || it.mkdirs() } == true) { "无法准备资源目录" }
                    target.writeBytes(bytes)
                }
            }
            require(hashes.isNotEmpty()) { "没有找到目录中的 GAM 或带机型目录的 ROM，请选择原机资源 ZIP" }
            for (relative in hashes.keys) writeAtomic(File(contentRoot(), relative), File(staging, relative).readBytes())
            return status() + mapOf("imported" to hashes.size)
        } finally {
            // 只删除本次创建、位于应用私有目录的临时目录，绝不清理用户选择的源文件。
            staging.deleteRecursively()
        }
    }

    private fun contentRoot(): File = File(requireNotNull(root), "content").also { check(it.isDirectory || it.mkdirs()) }
    private fun normalize(text: String): String = Normalizer.normalize(text, Normalizer.Form.NFC).lowercase(java.util.Locale.ROOT)
    private fun assetExists(name: String): Boolean = try {
        appContext?.assets?.open(FlutterInjector.instance().flutterLoader().getLookupKeyForAsset(name))?.use { true } ?: false
    } catch (_: java.io.IOException) { false }

    private fun asset(name: String): ByteArray? = try {
        appContext?.assets?.open(FlutterInjector.instance().flutterLoader().getLookupKeyForAsset(name))?.use { boundedRead(it, 4 * 1024 * 1024) }
    } catch (_: java.io.FileNotFoundException) { null }

    companion object {
        fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }

        fun readAtomic(file: File?, limit: Int): ByteArray? {
            if (file == null) return null
            return try { AtomicFile(file).openRead().use { boundedRead(it, limit) } }
            catch (_: java.io.FileNotFoundException) { null }
        }

        /** 原子替换并保留 AtomicFile 回滚机制，不能先删除旧存档。 */
        fun writeAtomic(file: File?, bytes: ByteArray) {
            val target = requireNotNull(file)
            check(target.parentFile?.let { it.isDirectory || it.mkdirs() } == true) { "无法创建文件目录" }
            val atomic = AtomicFile(target)
            val stream = atomic.startWrite()
            try { stream.write(bytes); atomic.finishWrite(stream) }
            catch (error: Exception) { atomic.failWrite(stream); throw error }
        }

        fun boundedRead(input: InputStream, limit: Int): ByteArray {
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(16384)
            while (true) {
                val length = input.read(buffer)
                if (length < 0) break
                require(output.size() + length <= limit) { "文件大小超过限制" }
                output.write(buffer, 0, length)
            }
            return output.toByteArray()
        }

        private fun validateGam(bytes: ByteArray) {
            require(bytes.size in 0x46..0x1e0000) { "GAM 文件长度无效" }
            val buffer = java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            val entry = buffer.getShort(0x40).toInt() and 0xffff
            val offset = buffer.getInt(0x42).toLong() and 0xffffffffL
            require(entry in 0x5000 until 0xd000 && offset < bytes.size) { "GAM 入口地址或数据偏移无效" }
        }
    }
}
