package com.kaalam.rasipalan.ui.tour

import android.animation.ValueAnimator
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.lifecycleScope
import com.kaalam.rasipalan.data.AppLanguage
import com.kaalam.rasipalan.data.TourScreen
import com.kaalam.rasipalan.data.TourText
import com.kaalam.rasipalan.data.markTourSeen
import com.kaalam.rasipalan.data.shouldShowTour
import com.kaalam.rasipalan.data.tourStrings
import com.kaalam.rasipalan.ui.Accent
import com.kaalam.rasipalan.ui.Kaalam
import com.kaalam.rasipalan.ui.dot
import com.kaalam.rasipalan.ui.dp
import com.kaalam.rasipalan.ui.pillButton
import com.kaalam.rasipalan.ui.text
import kotlinx.coroutines.launch

/**
 * One coachmark. [target] is looked up each time the step is shown or the
 * layout changes, because screens rebuild their views (refresh, 30 s ticks).
 * A step whose target is missing or hidden when the tour starts is left out.
 */
class TourStep(val text: TourText, val shape: SpotShape = SpotShape.ROUNDED, val target: () -> View?)

/**
 * First-visit guided tour for one screen, drawn as an overlay on the window.
 *
 *  - [startIfNeeded] runs it once per [TourScreen] version (call it after the
 *    screen has its content); [start] runs it on demand ("replay").
 *  - Finishing or skipping records the version, so it never starts by itself again.
 *  - Back goes to the previous step (skips on the first); the step survives
 *    rotation through [saveState] / the `resumeAt` of [startIfNeeded].
 *
 * [onActiveChanged] lets the screen pause things that would move the targets
 * (pull-to-refresh, swipe gestures) while the tour is up.
 */
class AppTour(
    private val activity: ComponentActivity,
    private val screen: TourScreen,
    private val language: () -> AppLanguage,
    private val steps: () -> List<TourStep>,
    private val onActiveChanged: (active: Boolean) -> Unit = {},
) {
    var isActive = false
        private set

    private var all: List<TourStep> = emptyList()
    private var shown: List<Int> = emptyList() // indices into [all] whose targets were available at the start
    private var position = 0 // index into [shown]
    private var overlay: TourOverlay? = null
    private var generation = 0
    private var autoChecked = false
    private val scrolled = mutableSetOf<ScrollView>()
    private var hiddenContent: View? = null
    private var hiddenImportance = View.IMPORTANT_FOR_ACCESSIBILITY_AUTO

    private lateinit var cardTitle: TextView
    private lateinit var cardBody: TextView
    private lateinit var cardProgress: TextView
    private lateinit var cardDots: LinearLayout
    private lateinit var backButton: TextView
    private lateinit var nextButton: TextView

    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            if (position == 0) end() else show(position - 1, direction = -1)
        }
    }

    private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener {
        val o = overlay ?: return@OnGlobalLayoutListener
        if (isActive && !o.isAnimating) place(generation, animate = false, onlyIfMoved = true)
    }

    init {
        activity.onBackPressedDispatcher.addCallback(activity, backCallback)
    }

    /**
     * Start automatically if this screen's tour has not been seen (or resume at
     * [resumeAt] after a configuration change). Checked once per screen instance.
     */
    fun startIfNeeded(resumeAt: Int = -1) {
        if (isActive || autoChecked) return
        autoChecked = true
        activity.lifecycleScope.launch {
            if (resumeAt >= 0 || activity.shouldShowTour(screen)) start(resumeAt.coerceAtLeast(0))
        }
    }

    /** Start now (e.g. replay), at the step with index [fromStep] or the next available one. */
    fun start(fromStep: Int = 0) {
        if (isActive || activity.isFinishing) return
        val decor = activity.window.decorView as? FrameLayout ?: return
        // After the current layout pass, so every target has its final size.
        decor.post { begin(decor, fromStep) }
    }

    /** Keep the current step across rotation; pass it back as `resumeAt`. */
    fun saveState(out: Bundle) {
        if (isActive) out.putInt(STATE_STEP, shown.getOrElse(position) { 0 })
    }

    // --- Lifecycle ------------------------------------------------------------------

    private fun begin(decor: FrameLayout, fromStep: Int, attempt: Int = 0) {
        if (isActive || activity.isFinishing || activity.isDestroyed) return
        all = steps()
        shown = all.indices.filter { isAvailable(all[it].target()) }
        // Started straight after the screen was (re)built: wait for layout to give the targets a size.
        val layoutPending = decor.isLayoutRequested || all.any { it.target()?.isLayoutRequested == true }
        if ((layoutPending || shown.isEmpty()) && attempt < MAX_LAYOUT_WAITS) {
            decor.postDelayed({ begin(decor, fromStep, attempt + 1) }, LAYOUT_WAIT_MS)
            return
        }
        if (shown.isEmpty()) return

        activity.currentFocus?.clearFocus()
        WindowCompat.getInsetsController(activity.window, decor).hide(WindowInsetsCompat.Type.ime())

        val o = TourOverlay(
            activity,
            card = buildCard(),
            ringColor = Kaalam.GOLD,
            caretColor = Kaalam.CARD,
            ringWidth = activity.dp(2).toFloat(),
            caretSize = activity.dp(CARET_DP).toFloat(),
        )
        o.addView(o.card, FrameLayout.LayoutParams(cardWidth(decor.width), FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START))
        decor.addView(o, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        overlay = o
        isActive = true
        backCallback.isEnabled = true
        hideContentFromAccessibility()
        decor.viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
        onActiveChanged(true)

        if (ValueAnimator.areAnimatorsEnabled()) {
            o.alpha = 0f
            o.animate().alpha(1f).setDuration(FADE_MS).start()
        }
        show(shown.indexOfFirst { it >= fromStep }.coerceAtLeast(0), direction = 1)
    }

    private fun end() {
        val o = overlay ?: return
        isActive = false
        generation++
        backCallback.isEnabled = false
        activity.window.decorView.viewTreeObserver.removeOnGlobalLayoutListener(layoutListener)
        restoreContentAccessibility()
        o.cancelAnimation()
        activity.lifecycleScope.launch { activity.markTourSeen(screen) }
        val remove = {
            (o.parent as? ViewGroup)?.removeView(o)
            overlay = null
        }
        if (ValueAnimator.areAnimatorsEnabled()) o.animate().alpha(0f).setDuration(FADE_MS).withEndAction(remove).start() else remove()
        scrolled.forEach { it.smoothScrollTo(0, 0) }
        scrolled.clear()
        onActiveChanged(false)
    }

    // --- Steps ------------------------------------------------------------------------

    /** Show step [index] of the available ones; if its target has since gone, move on in [direction]. */
    private fun show(index: Int, direction: Int) {
        val o = overlay ?: return
        var i = index
        while (i in shown.indices && !isAvailable(all[shown[i]].target())) i += direction
        if (i !in shown.indices) {
            if (direction < 0) i = shown.indices.firstOrNull { isAvailable(all[shown[it]].target()) } ?: -1
            if (i !in shown.indices) return end()
        }
        position = i
        val gen = ++generation
        bindCard(all[shown[i]].text)

        val target = all[shown[i]].target() ?: return end()
        val scroll = scrollParentOf(target)
        if (scroll != null) {
            val spot = spotFor(all[shown[i]], target, o)
            val viewport = boxOf(scroll, o)
            val delta = TourGeometry.scrollDelta(
                spot, measureCard(o), viewport.top, viewport.bottom,
                gap = activity.dp(GAP_DP).toFloat(), margin = activity.dp(SCROLL_MARGIN_DP).toFloat(),
            )
            if (delta != 0) {
                scrolled += scroll
                o.card.alpha = 0f
                if (ValueAnimator.areAnimatorsEnabled()) {
                    scroll.smoothScrollBy(0, delta)
                    o.postDelayed({ place(gen, animate = true) }, SCROLL_SETTLE_MS)
                } else {
                    scroll.scrollBy(0, delta)
                    o.post { place(gen, animate = false) }
                }
                return
            }
        }
        place(gen, animate = true)
    }

    /** Spotlight the current target and put the card beside it. Ignored if a newer step has started. */
    private fun place(gen: Int, animate: Boolean, onlyIfMoved: Boolean = false) {
        val o = overlay ?: return
        if (gen != generation || !isActive) return
        val step = all.getOrNull(shown.getOrElse(position) { -1 }) ?: return
        val target = step.target()?.takeIf { isAvailable(it) } ?: return
        // The window, not the overlay: on the first step the overlay has not been laid out yet.
        val host = o.parent as? View ?: return
        val screenWidth = host.width
        val screenHeight = host.height
        if (screenWidth == 0 || screenHeight == 0) return

        val spot = spotFor(step, target, o)
        val rect = RectF(spot.left, spot.top, spot.right, spot.bottom)
        if (onlyIfMoved && o.currentSpot()?.let { near(it, rect) } == true) return

        val radius = if (step.shape == SpotShape.CIRCLE) spot.width / 2 else activity.dp(SPOT_RADIUS_DP).toFloat()
        o.moveSpot(rect, radius, animate)

        val cardWidth = cardWidth(screenWidth)
        (o.card.layoutParams as FrameLayout.LayoutParams).let {
            if (it.width != cardWidth) {
                it.width = cardWidth
                o.card.layoutParams = it
            }
        }
        val height = measureCard(o, cardWidth)
        val insets = ViewCompat.getRootWindowInsets(host)?.getInsets(WindowInsetsCompat.Type.systemBars())
        val edge = activity.dp(EDGE_DP).toFloat()
        val placed = TourGeometry.placeCard(
            spot = spot,
            cardWidth = cardWidth.toFloat(),
            cardHeight = height,
            screenWidth = screenWidth.toFloat(),
            safeTop = (insets?.top ?: 0) + edge,
            safeBottom = screenHeight - (insets?.bottom ?: 0) - edge,
            gap = activity.dp(GAP_DP).toFloat(),
            margin = edge,
            caretInset = activity.dp(CARET_INSET_DP).toFloat(),
        )
        o.cardSpot = placed
        o.cardHeight = height
        o.card.translationX = placed.left
        o.card.translationY = placed.top
        if (onlyIfMoved) {
            o.invalidate()
            return
        }
        if (ValueAnimator.areAnimatorsEnabled()) {
            o.card.alpha = 0f
            o.card.animate().alpha(1f).setStartDelay(if (animate) CARD_DELAY_MS else 0L).setDuration(FADE_MS)
                .setUpdateListener { o.invalidate() }.start()
        } else {
            o.card.alpha = 1f
            o.invalidate()
        }
    }

    private fun spotFor(step: TourStep, target: View, o: View): Box =
        TourGeometry.spotlight(textBounds(target, boxOf(target, o)), activity.dp(SPOT_PADDING_DP).toFloat(), step.shape)

    /**
     * A single-line TextView stretched wider than its text (e.g. the rasi title
     * filling the header row) is spotlit around the text only, so the cutout
     * does not run into neighbouring buttons.
     */
    private fun textBounds(view: View, box: Box): Box {
        val layout = (view as? TextView)?.takeIf { it.background == null }?.layout ?: return box
        if (layout.lineCount != 1) return box
        val textWidth = layout.getLineWidth(0) + view.compoundPaddingLeft + view.compoundPaddingRight
        if (textWidth >= box.width) return box
        return when (Gravity.getAbsoluteGravity(view.gravity, view.layoutDirection) and Gravity.HORIZONTAL_GRAVITY_MASK) {
            Gravity.LEFT -> box.copy(right = box.left + textWidth)
            Gravity.RIGHT -> box.copy(left = box.right - textWidth)
            Gravity.CENTER_HORIZONTAL -> box.copy(left = box.centerX - textWidth / 2, right = box.centerX + textWidth / 2)
            else -> box
        }
    }

    // --- Card -------------------------------------------------------------------------

    private fun buildCard(): LinearLayout = with(activity) {
        val t = tourStrings(language())
        cardProgress = text("", 12f, Kaalam.INK_SOFT, bold = true)
        cardDots = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        cardTitle = text("", 18f, Kaalam.MAROON, bold = true)
        cardBody = text("", 15f, Kaalam.INK)
        val skip = text(t.skip, 14f, Kaalam.INK_SOFT, bold = true).apply {
            setPadding(dp(4), dp(12), dp(12), dp(12))
            setOnClickListener { this@AppTour.end() }
        }
        backButton = compact(pillButton(t.back, filled = false) { this@AppTour.show(position - 1, direction = -1) })
        nextButton = compact(pillButton(t.next, filled = true) {
            if (position >= shown.lastIndex) this@AppTour.end() else this@AppTour.show(position + 1, direction = 1)
        })

        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                setColor(Kaalam.CARD)
                setStroke(dp(1), Kaalam.GOLD)
                cornerRadius = dp(16).toFloat()
            }
            elevation = dp(8).toFloat()
            setPadding(dp(18), dp(14), dp(14), dp(10))
            isClickable = true // taps on the card's padding must not fall through to the overlay
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
            addView(LinearLayout(this@with).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(cardProgress, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                addView(cardDots)
            })
            addView(cardTitle, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6) })
            addView(cardBody, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(4) })
            addView(LinearLayout(this@with).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(skip)
                addView(View(this@with), LinearLayout.LayoutParams(0, 1, 1f))
                addView(backButton)
                addView(nextButton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { marginStart = dp(8) })
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
        }
    }

    private fun compact(button: TextView): TextView = button.apply {
        minWidth = 0
        minimumWidth = 0
        textSize = 14f
        setPadding(activity.dp(16), activity.dp(6), activity.dp(16), activity.dp(6))
    }

    private fun bindCard(text: TourText) {
        val t = tourStrings(language())
        val total = shown.size
        cardProgress.text = t.progress(position + 1, total)
        cardTitle.text = text.title
        cardBody.text = text.body
        backButton.visibility = if (position == 0) View.GONE else View.VISIBLE
        nextButton.text = if (position == shown.lastIndex) t.finish else t.next
        cardDots.removeAllViews()
        if (total <= MAX_DOTS) {
            for (i in 0 until total) {
                cardDots.addView(activity.dot(if (i == position) Kaalam.MAROON else Accent.DIVIDER, if (i == position) 8 else 6).apply {
                    (layoutParams as LinearLayout.LayoutParams).marginStart = activity.dp(4)
                })
            }
        }
        cardDots.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    private fun measureCard(o: TourOverlay, width: Int = cardWidth((o.parent as? View)?.width ?: o.width)): Float {
        o.card.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        return o.card.measuredHeight.toFloat()
    }

    private fun cardWidth(screenWidth: Int): Int =
        minOf(screenWidth - 2 * activity.dp(EDGE_DP), activity.dp(MAX_CARD_DP)).coerceAtLeast(activity.dp(200))

    // --- Accessibility -----------------------------------------------------------------

    /** While the tour is up, TalkBack reads only the card. */
    private fun hideContentFromAccessibility() {
        val content = activity.findViewById<View>(android.R.id.content) ?: return
        hiddenContent = content
        hiddenImportance = content.importantForAccessibility
        content.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }

    private fun restoreContentAccessibility() {
        hiddenContent?.importantForAccessibility = hiddenImportance
        hiddenContent = null
    }

    // --- Helpers ----------------------------------------------------------------------

    private fun isAvailable(view: View?): Boolean =
        view != null && view.isAttachedToWindow && view.isShown && view.width > 0 && view.height > 0

    private fun scrollParentOf(view: View): ScrollView? {
        var p = view.parent
        while (p is View) {
            if (p is ScrollView) return p
            p = p.parent
        }
        return null
    }

    private val location = IntArray(2)

    /** [view]'s bounds in [relativeTo]'s coordinates. */
    private fun boxOf(view: View, relativeTo: View): Box {
        relativeTo.getLocationInWindow(location)
        val ox = location[0]
        val oy = location[1]
        view.getLocationInWindow(location)
        val left = (location[0] - ox).toFloat()
        val top = (location[1] - oy).toFloat()
        return Box(left, top, left + view.width, top + view.height)
    }

    private fun near(a: RectF, b: RectF) =
        kotlin.math.abs(a.left - b.left) < 1 && kotlin.math.abs(a.top - b.top) < 1 &&
            kotlin.math.abs(a.right - b.right) < 1 && kotlin.math.abs(a.bottom - b.bottom) < 1

    companion object {
        const val STATE_STEP = "app_tour_step"
        private const val FADE_MS = 200L
        private const val CARD_DELAY_MS = 120L
        private const val SCROLL_SETTLE_MS = 380L
        private const val SPOT_PADDING_DP = 6
        private const val SPOT_RADIUS_DP = 14
        private const val GAP_DP = 16
        private const val CARET_DP = 9
        private const val CARET_INSET_DP = 24
        private const val EDGE_DP = 16
        private const val SCROLL_MARGIN_DP = 24
        private const val MAX_CARD_DP = 420
        private const val MAX_DOTS = 8
        private const val MAX_LAYOUT_WAITS = 20
        private const val LAYOUT_WAIT_MS = 50L
    }
}
