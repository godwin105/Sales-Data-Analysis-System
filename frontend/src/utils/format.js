/**
 * Display helpers used across the app.
 *
 * Date helpers accept an optional `locale` (e.g. 'sw' or 'en') so they
 * render in the user's chosen language. Pass `i18n.language` from
 * react-i18next when calling. Defaults to English (en-GB) for stability
 * when locale data is missing.
 */

/** Map app language codes to BCP-47 locale strings used by Intl. */
function resolveLocale(locale) {
  if (!locale) return 'en-GB';
  const code = String(locale).slice(0, 2).toLowerCase();
  if (code === 'sw') return 'sw-TZ';   // Swahili (Tanzania)
  return 'en-GB';
}

/** Format a number as Tanzanian shillings (TZS) with thousand separators. */
export function formatTZS(value) {
  const n = Number(value || 0);
  return `TZS ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Format a number with commas, no currency. */
export function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** "AJ" from "Amina Juma" — for the avatar circle. */
export function initials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Format an ISO datetime as "19 Feb 2026, 14:32" (or Swahili equivalent). */
export function formatDateTime(iso, locale) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(resolveLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format an ISO date or datetime as "19 Feb 2026" (or Swahili equivalent). */
export function formatDate(iso, locale) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(resolveLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Today as "Tuesday, 19 February 2026" (or Swahili equivalent). */
export function todayLong(locale) {
  const d = new Date();
  return d.toLocaleDateString(resolveLocale(locale), {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** YYYY-MM-DD for input[type=date]. */
export function toIsoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
