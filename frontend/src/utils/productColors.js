function hashProductName(productName) {
  const name = String(productName || '').trim().toLowerCase();
  let hash = 2166136261;

  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function hslFromHash(hash, offset = 0) {
  const hue = (hash + offset * 47) % 360;
  const saturation = 62 + ((hash + offset * 11) % 16);
  const lightness = 38 + ((hash + offset * 7) % 12);

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function getProductColor(productName) {
  return hslFromHash(hashProductName(productName));
}

export function getProductColors(productNames = []) {
  const used = new Set();

  return productNames.map((name) => {
    const hash = hashProductName(name);
    let offset = 0;
    let color = hslFromHash(hash, offset);

    while (used.has(color)) {
      offset += 1;
      color = hslFromHash(hash, offset);
    }

    used.add(color);
    return color;
  });
}
