import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// 本地签名读取未跟踪的 android/key.properties；云端可使用同名配置对应的环境变量。
// 配置缺失仅阻止 release 构建，debug 构建仍使用原调试签名，不输出密码内容。
val releaseSigningPropertiesFile = rootProject.file("key.properties")
val releaseSigningProperties = Properties()
if (releaseSigningPropertiesFile.exists()) {
    FileInputStream(releaseSigningPropertiesFile).use { releaseSigningProperties.load(it) }
}
fun releaseSigningValue(propertyName: String, environmentName: String): String? =
    providers.environmentVariable(environmentName).orNull?.takeIf { it.isNotBlank() }
        ?: releaseSigningProperties.getProperty(propertyName)?.takeIf { it.isNotBlank() }

val releaseKeyAlias = releaseSigningValue("keyAlias", "BBK_RELEASE_KEY_ALIAS")
val releaseKeyPassword = releaseSigningValue("keyPassword", "BBK_RELEASE_KEY_PASSWORD")
val releaseStorePassword = releaseSigningValue("storePassword", "BBK_RELEASE_STORE_PASSWORD")
val releaseStorePath = releaseSigningValue("storeFile", "BBK_RELEASE_STORE_FILE")

android {
    namespace = "com.xiongjian.bbkclassics"
    compileSdk = flutter.compileSdkVersion
    // 与同目录已成功运行的 my_zhihu 保持一致，复用本机完整安装的 NDK。
    ndkVersion = "27.2.12479018"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.xiongjian.bbkclassics"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
            storePassword = releaseStorePassword
            storeFile = releaseStorePath?.let { rootProject.file(it) }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

// 发布前明确检查必需配置，防止误发未签名包或临时 debug 签名包。
val validateBbkReleaseSigning by tasks.registering {
    doLast {
        val missing = listOf(
            "keyAlias" to releaseKeyAlias,
            "keyPassword" to releaseKeyPassword,
            "storePassword" to releaseStorePassword,
            "storeFile" to releaseStorePath,
        ).filter { it.second == null }.map { it.first }
        check(missing.isEmpty()) {
            "缺少 Android release 签名配置：${missing.joinToString()}，请配置 android/key.properties 或 BBK_RELEASE_* 环境变量。"
        }
        check(releaseStorePath?.let { rootProject.file(it).isFile } == true) {
            "Android release keystore 文件不存在，请检查 storeFile 配置。"
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn(validateBbkReleaseSigning)
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
