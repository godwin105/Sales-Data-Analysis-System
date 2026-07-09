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

export function formatQuantity(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** "AJ" from "Amina Juma" — for the avatar circle. */
export function initials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const EAT = 'Africa/Nairobi'; // UTC+3, Tanzania / East Africa Time

/** Treat a naive ISO string (no TZ offset) as UTC — server stores in UTC. */
function toUtcDate(iso) {
  if (!iso) return null;
  const s = String(iso);
  // If the string already carries TZ info (Z or ±HH:MM) leave it as-is
  const hasOffset = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s);
  const d = new Date(hasOffset ? s : s + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format an ISO datetime as "19 Feb 2026, 14:32" (or Swahili equivalent). */
export function formatDateTime(iso, locale) {
  if (!iso) return '—';
  const d = toUtcDate(iso);
  if (!d) return '—';
  return d.toLocaleString(resolveLocale(locale), {
    timeZone: EAT,
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
  const d = toUtcDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString(resolveLocale(locale), {
    timeZone: EAT,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Today as "Tuesday, 19 February 2026" (or Swahili equivalent). */
export function todayLong(locale) {
  const d = new Date();
  return d.toLocaleDateString(resolveLocale(locale), {
    timeZone: EAT,
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
