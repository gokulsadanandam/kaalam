/**
 * Clock and calendar for any place: IANA timezone offsets (DST-aware, via
 * Intl) and rigorous sunrise / sunset / solar noon from astronomy-engine.
 *
 * Times of day are "minutes after local midnight" for the requested day;
 * values >= 1440 belong to the next day.
 */
import Astronomy from './astronomy.js';

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

const formatters = new Map();

/** Is this an IANA timezone name the runtime knows? */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** UTC offset of [timeZone] at instant [utcMs], in minutes (IST = 330). */
export function tzOffsetMinutes(timeZone, utcMs) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    formatters.set(timeZone, format);
  }
  const parts = format.formatToParts(new Date(utcMs));
  const n = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'));
  return Math.round((asUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

/**
 * Offset in force on a local calendar day (taken at local noon, so a DST
 * switch in the small hours does not affect the day's daylight times).
 */
export function offsetForDay({ year, month, day }, timeZone) {
  const guess = tzOffsetMinutes(timeZone, Date.UTC(year, month - 1, day, 12));
  return tzOffsetMinutes(timeZone, Date.UTC(year, month - 1, day, 12) - guess * 60_000);
}

/** Calendar date and weekday "now" in [timeZone]. */
export function localDateIn(timeZone, now = Date.now()) {
  const shifted = new Date(now + tzOffsetMinutes(timeZone, now) * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return {
    year,
    month,
    day,
    weekday: shifted.getUTCDay(), // 0 = Sunday
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

/**
 * Sunrise, sunset and solar noon for a local calendar day, as minutes after
 * local midnight. Upper limb on the horizon with standard refraction (the
 * convention used by drikpanchang). Null when the Sun does not rise or set
 * that day (polar day / night).
 *
 * @param offsetMinutes UTC offset of the place that day (see offsetForDay)
 */
export function solarTimes({ year, month, day }, lat, lon, offsetMinutes, elevationMeters = 0) {
  const midnightMs = Date.UTC(year, month - 1, day) - offsetMinutes * 60_000;
  const observer = new Astronomy.Observer(lat, lon, elevationMeters);
  const start = Astronomy.MakeTime(new Date(midnightMs));
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, start, 1);
  if (!rise) return null;
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, rise, 1);
  if (!set) return null;
  const noon = Astronomy.SearchHourAngle(Astronomy.Body.Sun, observer, 0, rise);
  const minutes = (time) => (time.date.getTime() - midnightMs) / 60_000;
  return { sunrise: minutes(rise), sunset: minutes(set), solarNoon: minutes(noon.time) };
}
