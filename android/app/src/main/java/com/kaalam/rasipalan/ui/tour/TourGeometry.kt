package com.kaalam.rasipalan.ui.tour

/** An axis-aligned box in overlay pixels. Plain data so the geometry is unit-testable off-device. */
data class Box(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width get() = right - left
    val height get() = bottom - top
    val centerX get() = (left + right) / 2
    val centerY get() = (top + bottom) / 2
}

enum class SpotShape { ROUNDED, CIRCLE }

enum class Placement { ABOVE, BELOW }

/** Where the coachmark card goes: its top-left corner, which side of the spotlight, and the caret's x. */
data class CardSpot(val top: Float, val placement: Placement, val left: Float, val caretX: Float)

object TourGeometry {

    /** The cutout around a target: padded, and for [SpotShape.CIRCLE] a square around its centre. */
    fun spotlight(target: Box, padding: Float, shape: SpotShape): Box = when (shape) {
        SpotShape.ROUNDED -> Box(target.left - padding, target.top - padding, target.right + padding, target.bottom + padding)
        SpotShape.CIRCLE -> {
            val r = maxOf(target.width, target.height) / 2 + padding
            Box(target.centerX - r, target.centerY - r, target.centerX + r, target.centerY + r)
        }
    }

    /**
     * Put the card below the spotlight if it fits there, else above; if it fits
     * on neither side (a very tall target), on the roomier side, clamped inside
     * [safeTop]..[safeBottom]. Horizontally it is centred on the target and kept
     * [margin] from the screen edges; the caret stays [caretInset] inside the card.
     */
    fun placeCard(
        spot: Box,
        cardWidth: Float,
        cardHeight: Float,
        screenWidth: Float,
        safeTop: Float,
        safeBottom: Float,
        gap: Float,
        margin: Float,
        caretInset: Float,
    ): CardSpot {
        val below = safeBottom - (spot.bottom + gap)
        val above = (spot.top - gap) - safeTop
        val placement = when {
            cardHeight <= below -> Placement.BELOW
            cardHeight <= above -> Placement.ABOVE
            below >= above -> Placement.BELOW
            else -> Placement.ABOVE
        }
        val wanted = if (placement == Placement.BELOW) spot.bottom + gap else spot.top - gap - cardHeight
        val top = wanted.coerceIn(safeTop, maxOf(safeTop, safeBottom - cardHeight))
        val left = (spot.centerX - cardWidth / 2).coerceIn(margin, maxOf(margin, screenWidth - margin - cardWidth))
        val caretX = spot.centerX.coerceIn(left + caretInset, maxOf(left + caretInset, left + cardWidth - caretInset))
        return CardSpot(top, placement, left, caretX)
    }

    /**
     * How far to scroll (positive = content moves up) so the spotlight and the
     * card both fit inside the visible part of a scrolling container
     * ([viewportTop]..[viewportBottom]). 0 when they already fit. Otherwise the
     * target is brought to [margin] below the viewport top, leaving the rest of
     * the viewport for the card; the scroll view clamps the delta at either end.
     */
    fun scrollDelta(spot: Box, cardHeight: Float, viewportTop: Float, viewportBottom: Float, gap: Float, margin: Float): Int {
        val inside = spot.top >= viewportTop && spot.bottom <= viewportBottom
        val roomBelow = viewportBottom - spot.bottom - gap
        val roomAbove = spot.top - gap - viewportTop
        if (inside && (cardHeight <= roomBelow || cardHeight <= roomAbove)) return 0
        return (spot.top - (viewportTop + margin)).toInt()
    }

    /** The caret triangle (tip x, y, then the two base corners) pointing from the card edge to the spotlight. */
    fun caret(card: CardSpot, cardHeight: Float, size: Float): FloatArray = when (card.placement) {
        Placement.BELOW -> floatArrayOf(card.caretX, card.top - size, card.caretX - size, card.top + 1, card.caretX + size, card.top + 1)
        Placement.ABOVE -> {
            val bottom = card.top + cardHeight
            floatArrayOf(card.caretX, bottom + size, card.caretX - size, bottom - 1, card.caretX + size, bottom - 1)
        }
    }
}
