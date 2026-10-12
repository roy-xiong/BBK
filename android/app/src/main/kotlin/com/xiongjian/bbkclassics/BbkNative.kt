package com.xiongjian.bbkclassics

/**
 * 原机模拟器 JNI 边界。只允许 BbkRuntimeHost 的专用工作线程调用。
 *
 * 加载失败保留错误信息，由页面展示；不在 Application/Activity 初始化时抛出异常。
 */
internal object BbkNative {
    val loadError: String? = try {
        System.loadLibrary("bbk_runtime")
        null
    } catch (error: LinkageError) {
        "原机运行时尚未构建：${error.message.orEmpty()}"
    }

    external fun create(model: Int, gam: ByteArray?, fontRom: ByteArray?, osRom: ByteArray?): Long
    external fun frame(handle: Long, pixels: IntArray?, pcm: ShortArray?): Boolean
    external fun key(handle: Long, code: Int)
    external fun command(handle: Long, request: String?): String?
    external fun exportState(handle: Long, kind: Int): ByteArray?
    external fun importState(handle: Long, kind: Int, bytes: ByteArray?)
    external fun destroy(handle: Long)
}
