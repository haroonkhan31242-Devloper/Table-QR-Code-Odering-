import type React from 'react';

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.2;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Restaurant accent applied to the guest menu, keeping readable contrast. */
export function tenantThemeStyle(accent: string, dark: boolean): React.CSSProperties {
  const lum = luminance(accent);
  // Darken bright accents in light mode so white button text stays ≥ 4.5:1.
  const brand = dark ? accent : lum > 0.18 ? `color-mix(in srgb, ${accent} 78%, black)` : accent;
  const ink = dark ? (lum > 0.25 ? '#140904' : '#ffffff') : '#ffffff';
  return {
    ['--brand' as string]: brand,
    ['--brand-hover' as string]: `color-mix(in srgb, ${brand} 88%, ${dark ? 'white' : 'black'})`,
    ['--brand-ink' as string]: ink,
    ['--brand-strong' as string]: dark ? `color-mix(in srgb, ${accent} 75%, white)` : `color-mix(in srgb, ${accent} 70%, black)`,
    ['--brand-soft' as string]: `color-mix(in srgb, ${accent} ${dark ? 16 : 11}%, transparent)`,
  };
}
