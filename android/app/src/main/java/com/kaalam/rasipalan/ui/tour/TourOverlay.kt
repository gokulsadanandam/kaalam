package com.kaalam.rasipalan.ui.tour

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Build
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout

/**
 * Full-screen layer for the tour: a ~75% scrim with a clean cutout around the
 * target, a gold ring on the cutout's edge, the coachmark card (a child view)
 * and a caret joining the card to the cutout. Every touch outside the card is
 * swallowed, so nothing behind the tour can be tapped by accident.
 */
@SuppressLint("ViewConstructor")
internal class TourOverlay(
    context: Context,
    val card: View,
    ringColor: Int,
    caretColor: Int,
    ringWidth: Float,
    private val caretSize: Float,
) : FrameLayout(context) {

    /** The cutout, in this view's pixels; null before the first step is placed. */
    private var spot: RectF? = null
    private var radius = 0f
    private var animator: ValueAnimator? = null

    /** Where the card was last placed and its measured height (for the caret). */
    var cardSpot: CardSpot? = null
    var cardHeight = 0f

    val isAnimating: Boolean get() = animator?.isRunning == true

    private val scrimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = SCRIM }
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = ringColor
        strokeWidth = ringWidth
    }
    private val caretPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = caretColor }
    private val scrimPath = Path()
    private val screenRect = RectF()
    private val caretPath = Path()

    init {
        setWillNotDraw(false)
        isClickable = true
        // The overlay itself is not a stop for TalkBack; the card is.
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun currentSpot(): RectF? = spot?.let { RectF(it) }

    /** Move the cutout to [to] (corner radius [toRadius]), animated unless [animate] is false or animations are off. */
    fun moveSpot(to: RectF, toRadius: Float, animate: Boolean) {
        animator?.cancel()
        val from = spot
        if (!animate || from == null || !ValueAnimator.areAnimatorsEnabled()) {
            spot = RectF(to)
            radius = toRadius
            invalidate()
            return
        }
        val start = RectF(from)
        val startRadius = radius
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = MOVE_MS
            interpolator = DecelerateInterpolator()
            addUpdateListener {
                val f = it.animatedFraction
                spot = RectF(
                    lerp(start.left, to.left, f),
                    lerp(start.top, to.top, f),
                    lerp(start.right, to.right, f),
                    lerp(start.bottom, to.bottom, f),
                )
                radius = lerp(startRadius, toRadius, f)
                invalidate()
            }
            start()
        }
    }

    fun cancelAnimation() = animator?.cancel()

    override fun dispatchDraw(canvas: Canvas) {
        val cutout = spot
        if (cutout == null) {
            canvas.drawColor(SCRIM)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // A rect with a rounded hole: drawn analytically by the GPU, much cheaper than a full-screen path.
            screenRect.set(0f, 0f, width.toFloat(), height.toFloat())
            canvas.drawDoubleRoundRect(screenRect, 0f, 0f, cutout, radius, radius, scrimPaint)
        } else {
            scrimPath.reset()
            scrimPath.fillType = Path.FillType.EVEN_ODD
            scrimPath.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
            scrimPath.addRoundRect(cutout, radius, radius, Path.Direction.CW)
            canvas.drawPath(scrimPath, scrimPaint)
        }
        cutout?.let { canvas.drawRoundRect(it, radius, radius, ringPaint) }

        val placed = cardSpot
        if (placed != null && card.visibility == VISIBLE && card.alpha > 0.01f && !isAnimating) {
            val p = TourGeometry.caret(placed, cardHeight, caretSize)
            caretPath.reset()
            caretPath.moveTo(p[0], p[1])
            caretPath.lineTo(p[2], p[3])
            caretPath.lineTo(p[4], p[5])
            caretPath.close()
            caretPaint.alpha = (card.alpha * 255).toInt()
            canvas.drawPath(caretPath, caretPaint)
        }
        super.dispatchDraw(canvas)
    }

    /** Swallow every touch that reaches the overlay (i.e. outside the card's buttons). */
    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean = true

    private fun lerp(a: Float, b: Float, f: Float) = a + (b - a) * f

    companion object {
        /** Warm near-black at ~75% opacity. */
        val SCRIM = Color.argb(191, 24, 12, 8)
        const val MOVE_MS = 280L
    }
}
