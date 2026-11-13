import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

/** API base URL from gradle.properties (or -Pkaalam.apiBaseUrl=... on the CLI). */
val apiBaseUrl: String = providers.gradleProperty("kaalam.apiBaseUrl")
    .getOrElse("http://10.0.2.2:3000")

// Release builds are signed with the upload key named by these variables, which
// the Release workflow (.github/workflows/release.yml) fills from GitHub secrets.
// No key or password is ever stored in the repo.
val uploadKeystore: String? = System.getenv("ANDROID_KEYSTORE_PATH")

android {
    namespace = "com.kaalam.rasipalan"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.kaalam.rasipalan"
        minSdk = 26          // java.time + adaptive widget features without desugaring
        targetSdk = 36       // Google Play minimum for new apps and updates from 31 Aug 2026
        // Set by the Release workflow: the run number and the version tag.
        versionCode = System.getenv("VERSION_CODE")?.toInt() ?: 1
        versionName = System.getenv("VERSION_NAME") ?: "1.0.0"

        buildConfigField("String", "RASI_API_BASE_URL", "\"$apiBaseUrl\"")
    }

    signingConfigs {
        if (uploadKeystore != null) {
            create("release") {
                storeFile = file(uploadKeystore)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            if (uploadKeystore != null) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true      // required by Glance (Compose runtime + compiler)
        buildConfig = true  // exposes RASI_API_BASE_URL
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // --- Jetpack Glance: widget UI written with Compose-style APIs -----------
    implementation("androidx.glance:glance-appwidget:1.1.1")
    // GlanceTheme + ColorProviders built from Material 3 color schemes
    implementation("androidx.glance:glance-material3:1.1.1")
    // lightColorScheme()/darkColorScheme() used to build the widget palette
    implementation("androidx.compose.material3:material3:1.3.1")

    // --- Local cache ---------------------------------------------------------
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // --- Networking: Ktor client on OkHttp + kotlinx.serialization JSON ------
    implementation("io.ktor:ktor-client-core:3.0.3")
    implementation("io.ktor:ktor-client-okhttp:3.0.3")
    implementation("io.ktor:ktor-client-content-negotiation:3.0.3")
    implementation("io.ktor:ktor-serialization-kotlinx-json:3.0.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // --- Coroutines + AndroidX basics ---------------------------------------
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3") // lifecycleScope in the picker
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0") // pull to refresh on the today screen

    // --- Daily widget refresh at fixed IST times (also upgrades Glance's transitive 2.7.1)
    implementation("androidx.work:work-runtime-ktx:2.11.2")

    // --- JVM unit tests (./gradlew testDebugUnitTest) --------------------------
    testImplementation("junit:junit:4.13.2")
}
