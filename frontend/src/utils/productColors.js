// FNV-1a hash — deterministic, no collision shifting,
// so a product always gets the same colour across every chart in the app.
function hashProductName(productName) {
  const name = String(productName || '').trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// H, S, L are pulled from three non-overlapping bit windows so they don't
// correlate with each other and produce genuinely independent variation.
//   hue        — bits  0..8   (0–359°, full wheel)
//   saturation — bits 12..15  (65–80 %, vivid — never muted)
//   lightness  — bits 20..23  (45–56 %, bright — never dark or washed-out)
function hslFromHash(hash) {
  const hue        =  hash          % 360;
  const saturation = (hash >>> 12)  % 16 + 65;
  const lightness  = (hash >>> 20)  % 12 + 45;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

// Single product → one stable HSL colour string.
export function getProductColor(productName) {
  return hslFromHash(hashProductName(productName));
}

// Array of names → array of stable HSL colour strings (one-to-one, no shifting).
export function getProductColors(productNames = []) {
  return productNames.map(getProductColor);
}
