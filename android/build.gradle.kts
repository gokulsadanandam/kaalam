// Root build file: declares plugin versions once; modules apply them.
plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    // Kotlin 2.x ships the Compose compiler as a Kotlin plugin. Glance is built
    // on the Compose runtime, so widgets need it even without Compose UI.
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0" apply false
}
