plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

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

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    sourceSets.getByName("main").jniLibs.srcDir(layout.buildDirectory.dir("generated/bbk/jniLibs"))
}

// 用户主动在 IDE/Flutter 发起构建时才构建 Rust，日常源码编辑不运行编译。
val buildBbkRuntime by tasks.registering(Exec::class) {
    val repository = rootProject.projectDir.parentFile
    val output = layout.buildDirectory.dir("generated/bbk/jniLibs")
    inputs.dir(repository.resolve("third_party/bbkemu"))
    inputs.file(repository.resolve("tool/build_bbk_runtime.sh"))
    outputs.dir(output)
    doFirst {
        commandLine("bash", repository.resolve("tool/build_bbk_runtime.sh").absolutePath,
            output.get().asFile.absolutePath,
            android.sdkComponents.sdkDirectory.get().asFile.resolve("ndk/${android.ndkVersion}").absolutePath)
    }
}
tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(buildBbkRuntime) }

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
