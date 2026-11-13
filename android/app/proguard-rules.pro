# kotlinx.serialization: the library ships consumer rules for @Serializable
# classes; keep our DTO's generated serializer explicitly as a safety net.
-keep,includedescriptorclasses class com.kaalam.rasipalan.data.network.**$$serializer { *; }
-keepclassmembers class com.kaalam.rasipalan.data.network.** {
    *** Companion;
}
-keepclasseswithmembers class com.kaalam.rasipalan.data.network.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Ktor references optional JVM-only classes that do not exist on Android.
-dontwarn org.slf4j.**
-dontwarn java.lang.management.**
-dontwarn io.ktor.util.debug.**

# Glance instantiates ActionCallback classes reflectively by name.
-keep class * implements androidx.glance.appwidget.action.ActionCallback { <init>(); }
