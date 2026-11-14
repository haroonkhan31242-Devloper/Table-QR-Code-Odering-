/**
 * Restaurant-branded QR label templates. Each template derives its palette
 * from the restaurant's accent colour and only decorates the space AROUND the
 * QR code — the code itself is always dark modules on a white quiet zone.
 */

export type LabelTemplateId = 'minimal' | 'luxury' | 'elegant' | 'fine-dining' | 'cafe';
export type LabelFormat = 'table-card' | 'sticker';
export type LabelHeading = 'menu' | 'order' | 'explore';

export interface LabelPreferences {
  template: LabelTemplateId;
  format: LabelFormat;
  heading: LabelHeading;
  instruction: string;
  showTable: boolean;
}

export const DEFAULT_INSTRUCTION = 'Open your phone camera, scan, and order. No app needed.';

export const DEFAULT_LABEL_PREFERENCES: LabelPreferences = {
  template: 'minimal',
  format: 'table-card',
  heading: 'explore',
  instruction: DEFAULT_INSTRUCTION,
  showTable: true,
};

export const HEADINGS: Record<LabelHeading, string> = {
  explore: 'Scan to Explore Our Menu',
  menu: 'Scan to View Menu',
  order: 'Scan to Order',
};

export const FORMATS: Record<LabelFormat, { label: string; widthMm: number; heightMm: number; hint: string }> = {
  'table-card': { label: 'Table card', widthMm: 105, heightMm: 148, hint: 'A6 · 105 × 148 mm' },
  sticker: { label: 'Square sticker', widthMm: 80, heightMm: 80, hint: '80 × 80 mm' },
};

/* ----------------------------- colour maths ----------------------------- */

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xc93f15;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function luminance(hex: string): number {
  const c = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Darkest brand-tinted ink that still scans perfectly on white (≥ 10:1). */
export function qrInkFor(accent: string): string {
  for (const t of [0.72, 0.8, 0.88]) {
    const ink = mix(accent, '#000000', t);
    if (contrast(ink, '#ffffff') >= 10) return ink;
  }
  return '#111111';
}

/** Readable text colour for a filled surface. */
export function onColor(bg: string): string {
  return contrast(bg, '#ffffff') >= 4.5 ? '#ffffff' : '#141414';
}

/** Accent darkened until it is legible on a light background. */
export function accentOnLight(accent: string, bg = '#ffffff'): string {
  let c = accent;
  for (let i = 0; i < 8 && contrast(c, bg) < 4.5; i++) c = mix(c, '#000000', 0.15);
  return c;
}

/* ------------------------------- palettes ------------------------------- */

export interface LabelPalette {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
  panel: string;
  panelStroke: string;
  qrInk: string;
  rule: string;
}

export interface LabelFonts {
  display: string;
  body: string;
  nameWeight: number;
  headingStyle: 'normal' | 'italic';
  nameUppercase: boolean;
}

export interface LabelTemplate {
  id: LabelTemplateId;
  name: string;
  description: string;
  fonts: LabelFonts;
  palette: (accent: string) => LabelPalette;
}

const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
const GROTESK = '"Bricolage Grotesque", Inter, system-ui, sans-serif';
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

const GOLD = '#C9A24A';

export const LABEL_TEMPLATES: LabelTemplate[] = [
  {
    id: 'minimal',
    name: 'Modern Minimal',
    description: 'Clean white card, crisp type and a single accent bar.',
    fonts: { display: GROTESK, body: SANS, nameWeight: 800, headingStyle: 'normal', nameUppercase: false },
    palette: (accent) => ({
      bg: '#FFFFFF',
      ink: '#141414',
      muted: '#6B6B6B',
      accent: accentOnLight(accent),
      accentInk: onColor(accentOnLight(accent)),
      panel: '#FFFFFF',
      panelStroke: '#E6E3DD',
      qrInk: qrInkFor(accent),
      rule: '#ECE9E3',
    }),
  },
  {
    id: 'luxury',
    name: 'Premium Luxury',
    description: 'Deep charcoal, gold detailing and a refined serif.',
    fonts: { display: SERIF, body: SANS, nameWeight: 700, headingStyle: 'italic', nameUppercase: false },
    palette: (accent) => {
      const gold = mix(GOLD, accent, 0.18);
      return {
        bg: '#141312',
        ink: '#F5EFE3',
        muted: '#B9AF9C',
        accent: gold,
        accentInk: '#141312',
        panel: '#FFFFFF',
        panelStroke: gold,
        qrInk: '#111111',
        rule: mix(gold, '#141312', 0.35),
      };
    },
  },
  {
    id: 'elegant',
    name: 'Elegant Restaurant',
    description: 'Warm ivory, your cover photo and graceful ornaments.',
    fonts: { display: SERIF, body: SANS, nameWeight: 700, headingStyle: 'italic', nameUppercase: false },
    palette: (accent) => ({
      bg: '#FBF6EE',
      ink: '#231C15',
      muted: '#75695C',
      accent: accentOnLight(accent, '#FBF6EE'),
      accentInk: onColor(accentOnLight(accent, '#FBF6EE')),
      panel: '#FFFFFF',
      panelStroke: '#E9DFD0',
      qrInk: qrInkFor(accent),
      rule: mix(accent, '#FBF6EE', 0.55),
    }),
  },
  {
    id: 'fine-dining',
    name: 'Classic Fine Dining',
    description: 'Rich brand-colour card with an ivory double frame.',
    fonts: { display: SERIF, body: SANS, nameWeight: 600, headingStyle: 'italic', nameUppercase: true },
    palette: (accent) => {
      let bg = mix(accent, '#000000', 0.55);
      if (contrast(bg, '#F6F1E7') < 7) bg = mix(accent, '#000000', 0.72);
      return {
        bg,
        ink: '#F6F1E7',
        muted: mix('#F6F1E7', bg, 0.3),
        accent: '#E9D8B4',
        accentInk: bg,
        panel: '#FBF8F2',
        panelStroke: '#E9D8B4',
        qrInk: '#111111',
        rule: mix('#E9D8B4', bg, 0.35),
      };
    },
  },
  {
    id: 'cafe',
    name: 'Creative Cafe',
    description: 'Playful shapes, bold type and a friendly badge.',
    fonts: { display: GROTESK, body: SANS, nameWeight: 800, headingStyle: 'normal', nameUppercase: false },
    palette: (accent) => {
      const bg = mix(accent, '#FFFFFF', 0.86);
      const strong = accentOnLight(accent, bg);
      return {
        bg,
        ink: '#1B1712',
        muted: '#5E554B',
        accent: strong,
        accentInk: onColor(strong),
        panel: '#FFFFFF',
        panelStroke: mix(accent, '#FFFFFF', 0.55),
        qrInk: qrInkFor(accent),
        rule: mix(accent, '#FFFFFF', 0.6),
      };
    },
  },
];

export const TEMPLATE_INDEX = Object.fromEntries(LABEL_TEMPLATES.map((t) => [t.id, t])) as Record<LabelTemplateId, LabelTemplate>;

export function normalizePreferences(input?: Partial<LabelPreferences> | null): LabelPreferences {
  const p = { ...DEFAULT_LABEL_PREFERENCES, ...(input ?? {}) };
  return {
    template: TEMPLATE_INDEX[p.template] ? p.template : DEFAULT_LABEL_PREFERENCES.template,
    format: FORMATS[p.format] ? p.format : DEFAULT_LABEL_PREFERENCES.format,
    heading: HEADINGS[p.heading] ? p.heading : DEFAULT_LABEL_PREFERENCES.heading,
    instruction: (p.instruction ?? '').slice(0, 80),
    showTable: Boolean(p.showTable),
  };
}
