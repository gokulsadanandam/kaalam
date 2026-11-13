/**
 * Where to compute for: explicit coordinates and timezone, or a documented
 * reference location. Never mixes a valid and an invalid coordinate, and
 * always reports when the fallback was used and why.
 */
import { DEFAULT_TIME_ZONE, isValidTimeZone } from './time.js';

/** Reference location when none (or an unusable one) is given: Chennai. */
export const REFERENCE_LOCATION = Object.freeze({
  name: 'Chennai',
  lat: 13.0827,
  lon: 80.2707,
  timezone: DEFAULT_TIME_ZONE,
});

/** Beyond the polar circles the Sun may not rise or set, so the day cannot be divided. */
const MAX_ABS_LATITUDE = 66.5;

/**
 * @param query request query: lat, lon, tz (IANA), and optionally location (free text; not geocoded)
 * @param reference fallback location (overridable through DEFAULT_LAT / DEFAULT_LON)
 * @returns { name, lat, lon, timezone, isFallback, reason? }
 */
export function resolveLocation(query, reference = REFERENCE_LOCATION) {
  const present = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const hasLat = present(query.lat);
  const hasLon = present(query.lon);
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const tzGiven = present(query.tz);
  const tzValid = tzGiven && isValidTimeZone(String(query.tz));

  const coordsValid = hasLat && hasLon && Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= MAX_ABS_LATITUDE && Math.abs(lon) <= 180;

  if (coordsValid) {
    return {
      name: null,
      lat,
      lon,
      timezone: tzValid ? String(query.tz) : reference.timezone,
      isFallback: false,
      ...(tzGiven && !tzValid ? { reason: 'invalid_timezone' } : {}),
    };
  }
  let reason = 'missing_coordinates';
  if (hasLat || hasLon) reason = hasLat && hasLon ? 'invalid_coordinates' : 'incomplete_coordinates';
  else if (present(query.location)) reason = 'unresolved_place';
  return { ...reference, isFallback: true, reason };
}

/** Tamil Nadu and Puducherry (approximate bounding box): where newspaper Nalla Neram applies. */
export function inTamilNadu({ lat, lon }) {
  return lat >= 8.0 && lat <= 13.6 && lon >= 76.2 && lon <= 80.4;
}
