package com.kaalam.rasipalan.ui.tour

import com.kaalam.rasipalan.data.TourScreen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TourGeometryTest {

    // A 400 x 800 screen with a 24 px status bar and a 48 px navigation bar, 16 px edges.
    private fun place(spot: Box, cardHeight: Float = 200f, cardWidth: Float = 368f) = TourGeometry.placeCard(
        spot = spot, cardWidth = cardWidth, cardHeight = cardHeight, screenWidth = 400f,
        safeTop = 40f, safeBottom = 736f, gap = 16f, margin = 16f, caretInset = 24f,
    )

    @Test
    fun `card goes below a target near the top`() {
        val card = place(Box(20f, 60f, 200f, 120f))
        assertEquals(Placement.BELOW, card.placement)
        assertEquals(136f, card.top) // target bottom + gap
    }

    @Test
    fun `card goes above a target near the bottom and never overlaps it`() {
        val spot = Box(20f, 600f, 380f, 680f)
        val card = place(spot)
        assertEquals(Placement.ABOVE, card.placement)
        assertEquals(384f, card.top) // 600 - 16 - 200
        assertTrue(card.top + 200f <= spot.top)
    }

    @Test
    fun `a target taller than the room on both sides keeps the card on screen`() {
        val card = place(Box(20f, 200f, 380f, 600f), cardHeight = 300f)
        assertTrue(card.top >= 40f)
        assertTrue(card.top + 300f <= 736f)
    }

    @Test
    fun `card is centred on the target but kept inside the screen edges, with the caret over the target`() {
        val icon = Box(340f, 60f, 384f, 104f) // a header icon at the right edge
        val card = place(icon)
        assertEquals(16f, card.left) // 400 - 16 - 368
        assertEquals(360f, card.caretX) // held 24 px inside the card's edge, still over the icon (340..384)

        val narrow = place(Box(150f, 60f, 250f, 104f), cardWidth = 200f)
        assertEquals(100f, narrow.left) // centred: 200 - 100
        assertEquals(200f, narrow.caretX)
    }

    @Test
    fun `caret stays inside the card when the target is at the very edge`() {
        val card = place(Box(0f, 60f, 10f, 70f))
        assertEquals(card.left + 24f, card.caretX)
    }

    @Test
    fun `circle spotlight is a padded square around the target centre`() {
        val spot = TourGeometry.spotlight(Box(100f, 100f, 144f, 124f), 6f, SpotShape.CIRCLE)
        assertEquals(Box(94f, 84f, 150f, 140f), spot) // radius 22 + 6 around (122, 112)
        assertEquals(Box(94f, 94f, 150f, 130f), TourGeometry.spotlight(Box(100f, 100f, 144f, 124f), 6f, SpotShape.ROUNDED))
    }

    @Test
    fun `no scroll when target and card already fit, otherwise bring the target near the top`() {
        assertEquals(0, TourGeometry.scrollDelta(Box(0f, 200f, 400f, 260f), 200f, 100f, 736f, gap = 16f, margin = 24f))
        // Below the fold: scroll so the target sits 24 px under the viewport top.
        assertEquals(1076, TourGeometry.scrollDelta(Box(0f, 1200f, 400f, 1260f), 200f, 100f, 736f, gap = 16f, margin = 24f))
        // Visible but squeezed against the bottom with no room for the card either side.
        assertEquals(476, TourGeometry.scrollDelta(Box(0f, 600f, 400f, 730f), 600f, 100f, 736f, gap = 16f, margin = 24f))
    }

    @Test
    fun `tour version decides whether the tour shows again`() {
        assertTrue(TourScreen.needsTour(null, 1)) // never seen
        assertFalse(TourScreen.needsTour(1, 1)) // seen this version
        assertTrue(TourScreen.needsTour(1, 2)) // tour updated for a new feature
    }
}
