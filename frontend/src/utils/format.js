/**
 * Display helpers used across the app.
 */

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

/** Format an ISO datetime as "19 Feb 2026, 14:32". */
export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return d.toLocaleString('en-GB', opts);
}

/** Format an ISO date or datetime as "19 Feb 2026". */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Today as "Tuesday, 19 February 2026". */
export function todayLong() {
  const d = new Date();
  return d.toLocaleDateString('en-GB', {
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
