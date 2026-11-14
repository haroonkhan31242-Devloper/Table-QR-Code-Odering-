/**
 * Single source of truth for QR label artwork. The on-screen preview and the
 * downloaded PNG/PDF are drawn by the same `drawLabel` function, so what the
 * admin sees is exactly what prints.
 *
 * Scan safety: the QR is drawn from the real encoder output (vector path,
 * error correction Q), in a dark ink with ≥10:1 contrast, on a white panel with
 * a quiet zone of at least 4 modules. Templates never draw over that panel.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import type { DiningTable, Restaurant } from '@/src/types/domain';
import { buildQrUrl } from '@/src/services/qr/qrService';
import { resolveImage } from '@/src/services/images/imageStorage';
import { buildPdf, type PdfPage } from './pdf';
import {
  FORMATS,
  HEADINGS,
  TEMPLATE_INDEX,
  type LabelFormat,
  type LabelPalette,
  type LabelPreferences,
  type LabelTemplate,
} from './templates';

/* ------------------------------- QR matrix ------------------------------- */

export interface QrShape {
  path: Path2D;
  modules: number;
}

const qrCache = new Map<string, QrShape>();

/** Vector QR from the same encoder the app already uses (qrcode.react). */
export function qrShapeFor(url: string): QrShape {
  const cached = qrCache.get(url);
  if (cached) return cached;
  // Static render (safe inside React effects) → parse the SVG markup.
  const markup = renderToStaticMarkup(
    createElement(QRCodeSVG, { value: url, level: 'Q', marginSize: 0, fgColor: '#000000', bgColor: '#ffffff' })
  );
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const paths = svg ? [...svg.querySelectorAll('path')] : [];
  const modules = Number(svg?.getAttribute('viewBox')?.split(/\s+/)[2] ?? 0);
  const d = paths.find((p) => p.getAttribute('fill') === '#000000')?.getAttribute('d') ?? paths[paths.length - 1]?.getAttribute('d') ?? '';
  if (!modules || !d) throw new Error('QR code could not be generated.');
  const shape = { path: new Path2D(d), modules };
  qrCache.set(url, shape);
  return shape;
}

/* -------------------------------- assets -------------------------------- */

export interface LabelAssets {
  logo: HTMLImageElement | null;
  cover: HTMLImageElement | null;
}

function loadImage(src: string | undefined): Promise<HTMLImageElement | null> {
  const resolved = resolveImage(src);
  if (!resolved) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = resolved;
  });
}

let fontsReady: Promise<void> | null = null;

/** Make sure label fonts are loaded before drawing (preview and export match). */
export function ensureLabelFonts(): Promise<void> {
  if (!fontsReady) {
    const specs = [
      '700 60px "Playfair Display"',
      'italic 600 40px "Playfair Display"',
      '600 40px "Playfair Display"',
      '800 60px "Bricolage Grotesque"',
      '700 40px "Bricolage Grotesque"',
      '500 24px Inter',
      '600 24px Inter',
      '700 24px Inter',
    ];
    const load = Promise.all(specs.map((s) => document.fonts?.load(s).catch(() => undefined))).then(() => undefined);
    const timeout = new Promise<void>((r) => setTimeout(r, 3000));
    fontsReady = Promise.race([load, timeout]);
  }
  return fontsReady;
}

const assetCache = new Map<string, Promise<LabelAssets>>();

export function loadLabelAssets(restaurant: Restaurant): Promise<LabelAssets> {
  const key = `${restaurant.id}|${restaurant.logoImage}|${restaurant.coverImage}`;
  let p = assetCache.get(key);
  if (!p) {
    p = Promise.all([loadImage(restaurant.logoImage), loadImage(restaurant.coverImage), ensureLabelFonts()]).then(([logo, cover]) => ({ logo, cover }));
    assetCache.set(key, p);
  }
  return p;
}

/* ------------------------------ label spec ------------------------------ */

export interface LabelSpec {
  prefs: LabelPreferences;
  restaurant: Restaurant;
  table: DiningTable;
  assets: LabelAssets;
}

export function labelSizeMm(format: LabelFormat) {
  return FORMATS[format];
}

/* ---------------------------- drawing helpers ---------------------------- */

type Ctx = CanvasRenderingContext2D;

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function font(style: 'normal' | 'italic', weight: number, size: number, family: string) {
  return `${style} ${weight} ${size}px ${family}`;
}

/** Shrink text to fit; ellipsize as a last resort. Returns the size used. */
function fitText(ctx: Ctx, text: string, family: string, weight: number, style: 'normal' | 'italic', max: number, min: number, maxWidth: number): { size: number; text: string } {
  let size = max;
  ctx.font = font(style, weight, size, family);
  while (ctx.measureText(text).width > maxWidth && size > min) {
    size -= 2;
    ctx.font = font(style, weight, size, family);
  }
  let out = text;
  while (ctx.measureText(out).width > maxWidth && out.length > 3) out = `${out.slice(0, -2).trimEnd()}…`;
  return { size, text: out };
}

function trackedWidth(ctx: Ctx, text: string, tracking: number) {
  return [...text].reduce((w, ch) => w + ctx.measureText(ch).width, 0) + tracking * Math.max(0, text.length - 1);
}

/** Centered text with manual letter-spacing (works in every browser). */
function fillTracked(ctx: Ctx, text: string, cx: number, y: number, tracking: number) {
  let x = cx - trackedWidth(ctx, text, tracking) / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + tracking;
  }
  ctx.textAlign = align;
}

function wrapLines(ctx: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

function initials(name: string) {
  return (
    name
      .replace(/&/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'R'
  );
}

function drawLogo(ctx: Ctx, t: LabelTemplate, pal: LabelPalette, spec: LabelSpec, cx: number, cy: number, size: number) {
  const r = size / 2;
  const ringColor = t.id === 'luxury' ? pal.accent : t.id === 'fine-dining' ? pal.accent : '#FFFFFF';
  // Ring / halo
  ctx.save();
  if (t.id === 'elegant' || t.id === 'minimal' || t.id === 'cafe') {
    ctx.shadowColor = 'rgba(0,0,0,0.14)';
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.05;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r + size * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = ringColor;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (spec.assets.logo) {
    drawCover(ctx, spec.assets.logo, cx - r, cy - r, size, size);
  } else {
    ctx.fillStyle = t.id === 'luxury' || t.id === 'fine-dining' ? pal.bg : pal.accent;
    ctx.fillRect(cx - r, cy - r, size, size);
    ctx.fillStyle = t.id === 'luxury' || t.id === 'fine-dining' ? pal.accent : pal.accentInk;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font('normal', t.fonts.nameWeight, size * 0.38, t.fonts.display);
    ctx.fillText(initials(spec.restaurant.name), cx, cy + size * 0.02);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

function ornament(ctx: Ctx, cx: number, y: number, width: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, y);
  ctx.lineTo(cx - 16, y);
  ctx.moveTo(cx + 16, y);
  ctx.lineTo(cx + width / 2, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, y - 8);
  ctx.lineTo(cx + 8, y);
  ctx.lineTo(cx, y + 8);
  ctx.lineTo(cx - 8, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function cornerBrackets(ctx: Ctx, x: number, y: number, w: number, h: number, len: number, color: string, lineWidth: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  const corners: Array<[number, number, number, number]> = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  corners.forEach(([cx, cy, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx * len, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * len);
    ctx.stroke();
  });
  ctx.restore();
}

/* ------------------------------ backgrounds ------------------------------ */

function paintBackground(ctx: Ctx, t: LabelTemplate, pal: LabelPalette, spec: LabelSpec, W: number, H: number, card: boolean): number {
  // Returns the height of a top photo band (elegant) so content can start below it.
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);

  switch (t.id) {
    case 'minimal': {
      ctx.fillStyle = pal.accent;
      ctx.fillRect(0, 0, W, card ? 18 : 14);
      return 0;
    }
    case 'luxury': {
      const g = ctx.createRadialGradient(W / 2, H * 0.22, 20, W / 2, H * 0.22, H * 0.8);
      g.addColorStop(0, '#2A2622');
      g.addColorStop(1, '#121110');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(34, 34, W - 68, H - 68);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(48, 48, W - 96, H - 96);
      cornerBrackets(ctx, 60, 60, W - 120, H - 120, 34, pal.accent, 2);
      return 0;
    }
    case 'elegant': {
      let band = 0;
      if (card) {
        band = 270;
        if (spec.assets.cover) {
          drawCover(ctx, spec.assets.cover, 0, 0, W, band);
        } else {
          ctx.fillStyle = pal.rule;
          ctx.fillRect(0, 0, W, band);
        }
        const g = ctx.createLinearGradient(0, band * 0.35, 0, band);
        g.addColorStop(0, 'rgba(251,246,238,0)');
        g.addColorStop(1, pal.bg);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, band);
      }
      ctx.strokeStyle = pal.rule;
      ctx.lineWidth = 2;
      roundRectPath(ctx, 28, 28, W - 56, H - 56, 26);
      ctx.stroke();
      return band;
    }
    case 'fine-dining': {
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2.6;
      ctx.strokeRect(32, 32, W - 64, H - 64);
      ctx.lineWidth = 1;
      ctx.strokeRect(44, 44, W - 88, H - 88);
      cornerBrackets(ctx, 58, 58, W - 116, H - 116, 46, pal.accent, 2.4);
      return 0;
    }
    case 'cafe': {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(W - 40, card ? 120 : 70, card ? 250 : 190, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(30, H - (card ? 150 : 60), card ? 200 : 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.22;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          ctx.beginPath();
          ctx.arc(W - 250 + col * 34, H - (card ? 330 : 210) + row * 34, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      return 0;
    }
  }
}

/* --------------------------------- QR ---------------------------------- */

/**
 * Panel padding that keeps a full 4-module quiet zone clear of the panel's
 * rounded corners and border stroke, so nothing dark ever touches it.
 */
function quietPad(t: LabelTemplate, module: number): number {
  const radius = t.id === 'cafe' ? 54 : t.id === 'luxury' || t.id === 'fine-dining' ? 18 : 30;
  const stroke = t.id === 'cafe' ? 6 : t.id === 'luxury' ? 4 : 3;
  // A rounded corner eats ~0.3 × radius along the diagonal.
  return Math.max(module * 4 + radius * 0.3 + stroke + 4, 36);
}

function drawQrPanel(ctx: Ctx, t: LabelTemplate, pal: LabelPalette, shape: QrShape, x: number, y: number, qrSize: number, pad: number) {
  const size = qrSize + pad * 2;
  const radius = t.id === 'cafe' ? 54 : t.id === 'luxury' || t.id === 'fine-dining' ? 18 : 30;
  ctx.save();
  if (t.id === 'elegant' || t.id === 'cafe' || t.id === 'minimal') {
    ctx.shadowColor = 'rgba(0,0,0,0.10)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 10;
  }
  roundRectPath(ctx, x, y, size, size, radius);
  ctx.fillStyle = pal.panel;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, x, y, size, size, radius);
  ctx.strokeStyle = pal.panelStroke;
  ctx.lineWidth = t.id === 'cafe' ? 6 : t.id === 'luxury' ? 4 : 3;
  ctx.stroke();
  if (t.id === 'luxury' || t.id === 'fine-dining') {
    roundRectPath(ctx, x - 14, y - 14, size + 28, size + 28, radius + 10);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();

  // The QR itself: vector modules, dark ink, nothing drawn on top.
  ctx.save();
  ctx.translate(x + pad, y + pad);
  ctx.scale(qrSize / shape.modules, qrSize / shape.modules);
  ctx.fillStyle = pal.qrInk;
  ctx.fill(shape.path);
  ctx.restore();
  return size;
}

function drawPill(ctx: Ctx, t: LabelTemplate, pal: LabelPalette, text: string, cx: number, cy: number, height: number, fontSize: number) {
  ctx.font = font('normal', 700, fontSize, t.fonts.body);
  const tracking = fontSize * 0.16;
  const w = trackedWidth(ctx, text, tracking) + height * 1.1;
  const x = cx - w / 2;
  const y = cy - height / 2;
  const outline = t.id === 'luxury' || t.id === 'fine-dining';
  roundRectPath(ctx, x, y, w, height, height / 2);
  if (outline) {
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.fillStyle = pal.accent;
  } else {
    ctx.fillStyle = pal.accent;
    ctx.fill();
    ctx.fillStyle = pal.accentInk;
  }
  ctx.textBaseline = 'middle';
  fillTracked(ctx, text, cx, cy + fontSize * 0.04, tracking);
  ctx.textBaseline = 'alphabetic';
}

/* ------------------------------ main layout ------------------------------ */

/**
 * Draw a label into `ctx` at (x, y) with pixel width `widthPx`.
 * Internally the artwork is laid out on a 1000-unit-wide grid.
 */
export interface DrawnLabel {
  /** Where the QR modules were placed, in output pixels (for verification). */
  qr: { x: number; y: number; size: number; modules: number };
  qrInk: string;
  panelColor: string;
}

export function drawLabel(ctx: Ctx, spec: LabelSpec, x: number, y: number, widthPx: number): DrawnLabel {
  const { prefs, restaurant, table } = spec;
  const t = TEMPLATE_INDEX[prefs.template];
  const pal = t.palette(restaurant.accentColor);
  const size = FORMATS[prefs.format];
  const W = 1000;
  const H = (W * size.heightMm) / size.widthMm;
  const card = prefs.format === 'table-card';
  const shape = qrShapeFor(buildQrUrl(restaurant, table));
  const k = widthPx / W;
  let placed = { x: 0, y: 0, size: 0 };

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(widthPx / W, widthPx / W);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const band = paintBackground(ctx, t, pal, spec, W, H, card);
  const cx = W / 2;
  const nameText = t.fonts.nameUppercase ? restaurant.name.toUpperCase() : restaurant.name;
  const subtitle = restaurant.tagline || restaurant.cuisine || restaurant.city;
  const heading = HEADINGS[prefs.heading];
  const tableText = `TABLE ${table.number}`;
  const serif = t.fonts.display.includes('Playfair');

  if (card) {
    const logoSize = 136;
    const logoCy = band ? band - 8 : 104 + logoSize / 2;
    const bottomLimit = H - 112;
    const minQr = 380;
    const maxQr = 580;
    const formal = t.id === 'luxury' || t.id === 'fine-dining';

    const measure = (qrSize: number, maxInstrLines = 2) => {
      const nameY = logoCy + logoSize / 2 + 96;
      const subY = nameY + 52;
      const ornY = subY + 40;
      const pad = quietPad(t, qrSize / shape.modules);
      const panelTop = (serif ? ornY + 34 : subY + 50) + 4;
      const panel = qrSize + pad * 2;
      const headingY = panelTop + panel + (formal ? 92 : 82);
      ctx.font = font('normal', 500, 27, t.fonts.body);
      const instr = prefs.instruction.trim() ? wrapLines(ctx, prefs.instruction.trim(), maxInstrLines === 1 ? 820 : 760, maxInstrLines) : [];
      const instrY = headingY + 50;
      const instrBottom = instr.length ? instrY + (instr.length - 1) * 36 : headingY;
      const pillCy = instrBottom + (instr.length ? 74 : 70);
      const contentBottom = prefs.showTable ? pillCy + 32 : instrBottom + 12;
      return { nameY, subY, ornY, pad, panelTop, panel, headingY, instr, instrY, pillCy, contentBottom };
    };

    // Fit the QR to the space: shrink if content would overflow, grow (up to a cap) if there is room.
    let qrSize = t.id === 'elegant' ? 460 : 500;
    let lines = 2;
    let L = measure(qrSize, lines);
    const over = L.contentBottom - bottomLimit;
    if (over !== 0) {
      qrSize = Math.max(minQr, Math.min(maxQr, qrSize - over));
      L = measure(qrSize, lines);
    }
    // Still too tall at the smallest scan-safe QR: keep the instruction to one line.
    if (L.contentBottom > bottomLimit && L.instr.length > 1) {
      lines = 1;
      L = measure(qrSize, lines);
      const room = bottomLimit - L.contentBottom;
      if (room > 0) {
        qrSize = Math.min(maxQr, qrSize + room);
        L = measure(qrSize, lines);
      }
    }
    // Any space left is split above and below the QR block for optical balance.
    const shift = Math.max(0, bottomLimit - L.contentBottom) / 2;

    drawLogo(ctx, t, pal, spec, cx, logoCy, logoSize);

    ctx.fillStyle = pal.ink;
    const nm = fitText(ctx, nameText, t.fonts.display, t.fonts.nameWeight, 'normal', t.fonts.nameUppercase ? 56 : 68, 34, W - 200);
    ctx.font = font('normal', t.fonts.nameWeight, nm.size, t.fonts.display);
    if (t.fonts.nameUppercase) fillTracked(ctx, nm.text, cx, L.nameY, nm.size * 0.12);
    else ctx.fillText(nm.text, cx, L.nameY);

    ctx.fillStyle = pal.muted;
    const sub = fitText(ctx, subtitle, t.fonts.body, 500, 'normal', 27, 20, W - 240);
    ctx.font = font('normal', 500, sub.size, t.fonts.body);
    ctx.fillText(sub.text, cx, L.subY);
    if (serif) ornament(ctx, cx, L.ornY, 220, pal.accent);

    drawQrPanel(ctx, t, pal, shape, cx - L.panel / 2, L.panelTop + shift, qrSize, L.pad);
    placed = { x: cx - L.panel / 2 + L.pad, y: L.panelTop + shift + L.pad, size: qrSize };

    ctx.fillStyle = t.id === 'luxury' ? pal.accent : pal.ink;
    const hd = fitText(ctx, heading, t.fonts.display, serif ? 600 : 800, t.fonts.headingStyle, serif ? 54 : 52, 34, W - 180);
    ctx.font = font(t.fonts.headingStyle, serif ? 600 : 800, hd.size, t.fonts.display);
    ctx.fillText(hd.text, cx, L.headingY + shift);

    if (L.instr.length) {
      ctx.fillStyle = pal.muted;
      ctx.font = font('normal', 500, 27, t.fonts.body);
      L.instr.forEach((line, i) => ctx.fillText(line, cx, L.instrY + shift + i * 36));
    }
    if (prefs.showTable) drawPill(ctx, t, pal, tableText, cx, L.pillCy + shift, 64, 26);

    // Branded footer
    ctx.fillStyle = pal.muted;
    const footer = `${restaurant.name}${restaurant.city ? ` · ${restaurant.city}` : ''}`.toUpperCase();
    const ft = fitText(ctx, footer, t.fonts.body, 600, 'normal', 17, 13, W - 240);
    ctx.font = font('normal', 600, ft.size, t.fonts.body);
    fillTracked(ctx, ft.text, cx, H - 66, ft.size * 0.22);
  } else {
    // Square sticker: compact header row, big QR, heading, table.
    const logoSize = 92;
    const headerCy = 112;
    ctx.font = font('normal', t.fonts.nameWeight, 46, t.fonts.display);
    const nm = fitText(ctx, nameText, t.fonts.display, t.fonts.nameWeight, 'normal', t.fonts.nameUppercase ? 40 : 48, 26, W - 2 * 70 - logoSize - 28);
    ctx.font = font('normal', t.fonts.nameWeight, nm.size, t.fonts.display);
    const nameW = t.fonts.nameUppercase ? trackedWidth(ctx, nm.text, nm.size * 0.1) : ctx.measureText(nm.text).width;
    const groupW = logoSize + 26 + nameW;
    const startX = cx - groupW / 2;
    drawLogo(ctx, t, pal, spec, startX + logoSize / 2, headerCy, logoSize);
    ctx.fillStyle = pal.ink;
    ctx.textBaseline = 'middle';
    const nameCx = startX + logoSize + 26 + nameW / 2;
    if (t.fonts.nameUppercase) fillTracked(ctx, nm.text, nameCx, headerCy + 2, nm.size * 0.1);
    else ctx.fillText(nm.text, nameCx, headerCy + 2);
    ctx.textBaseline = 'alphabetic';

    const qrSize = prefs.showTable ? 500 : 540;
    const pad = quietPad(t, qrSize / shape.modules);
    const panel = qrSize + pad * 2;
    const panelTop = 196;
    drawQrPanel(ctx, t, pal, shape, cx - panel / 2, panelTop, qrSize, pad);
    placed = { x: cx - panel / 2 + pad, y: panelTop + pad, size: qrSize };

    const headingY = panelTop + panel + 76;
    ctx.fillStyle = t.id === 'luxury' ? pal.accent : pal.ink;
    const hd = fitText(ctx, heading, t.fonts.display, serif ? 600 : 800, t.fonts.headingStyle, 46, 30, W - 160);
    ctx.font = font(t.fonts.headingStyle, serif ? 600 : 800, hd.size, t.fonts.display);
    ctx.fillText(hd.text, cx, headingY);
    if (prefs.showTable) drawPill(ctx, t, pal, tableText, cx, headingY + 62, 54, 23);
  }

  ctx.restore();
  return {
    qr: { x: x + placed.x * k, y: y + placed.y * k, size: placed.size * k, modules: shape.modules },
    qrInk: pal.qrInk,
    panelColor: pal.panel,
  };
}


/* -------------------------------- export -------------------------------- */

const DPI = 300;
const mmToPx = (mm: number, dpi = DPI) => Math.round((mm / 25.4) * dpi);

export function renderLabelCanvas(spec: LabelSpec, dpi = DPI): HTMLCanvasElement {
  const { widthMm, heightMm } = FORMATS[spec.prefs.format];
  const canvas = document.createElement('canvas');
  canvas.width = mmToPx(widthMm, dpi);
  canvas.height = mmToPx(heightMm, dpi);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.imageSmoothingQuality = 'high';
  drawLabel(ctx, spec, 0, 0, canvas.width);
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image file.'))), type, quality)
  );
}

async function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', 0.96)).arrayBuffer());
}

export function labelFileName(spec: LabelSpec, ext: string) {
  return `${spec.restaurant.slug}-table-${spec.table.number}-${spec.prefs.template}-${spec.prefs.format}.${ext}`;
}

export async function exportLabelPng(spec: LabelSpec): Promise<Blob> {
  return canvasBlob(renderLabelCanvas(spec), 'image/png');
}

/** One label per page, at its exact physical size. */
export async function exportLabelsPdf(specs: LabelSpec[], title: string): Promise<Blob> {
  const pages: PdfPage[] = [];
  for (const spec of specs) {
    const canvas = renderLabelCanvas(spec);
    const { widthMm, heightMm } = FORMATS[spec.prefs.format];
    pages.push({ jpeg: await canvasJpeg(canvas), pixelWidth: canvas.width, pixelHeight: canvas.height, widthMm, heightMm });
  }
  return buildPdf(pages, title);
}

/** Sheet layout for A4 printing with cut marks. */
export function sheetLayout(format: LabelFormat) {
  const page = { w: 210, h: 297 };
  const margin = 10;
  const gap = 6;
  const { widthMm, heightMm } = FORMATS[format];
  const cols = format === 'table-card' ? 2 : 2;
  const rows = format === 'table-card' ? 2 : 3;
  const scale = Math.min(1, (page.w - margin * 2 - gap * (cols - 1)) / (cols * widthMm), (page.h - margin * 2 - gap * (rows - 1)) / (rows * heightMm));
  const w = widthMm * scale;
  const h = heightMm * scale;
  const gridW = cols * w + (cols - 1) * gap;
  const gridH = rows * h + (rows - 1) * gap;
  return { page, cols, rows, w, h, gap, left: (page.w - gridW) / 2, top: (page.h - gridH) / 2, perPage: cols * rows, scale };
}

/** All labels on A4 sheets (2×2 table cards or 2×3 stickers) with crop marks. */
export async function exportSheetPdf(specs: LabelSpec[], title: string): Promise<Blob> {
  if (!specs.length) throw new Error('There are no labels to export.');
  const L = sheetLayout(specs[0].prefs.format);
  const pages: PdfPage[] = [];
  for (let i = 0; i < specs.length; i += L.perPage) {
    const canvas = document.createElement('canvas');
    canvas.width = mmToPx(L.page.w);
    canvas.height = mmToPx(L.page.h);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    specs.slice(i, i + L.perPage).forEach((spec, k) => {
      const col = k % L.cols;
      const row = Math.floor(k / L.cols);
      const xMm = L.left + col * (L.w + L.gap);
      const yMm = L.top + row * (L.h + L.gap);
      drawLabel(ctx, spec, mmToPx(xMm), mmToPx(yMm), mmToPx(L.w));
      // Crop marks just outside each label corner.
      ctx.strokeStyle = '#9a9a9a';
      ctx.lineWidth = mmToPx(0.2);
      const m = mmToPx(3);
      const off = mmToPx(1);
      const x0 = mmToPx(xMm);
      const y0 = mmToPx(yMm);
      const x1 = mmToPx(xMm + L.w);
      const y1 = mmToPx(yMm + L.h);
      ctx.beginPath();
      [[x0, y0, -1, -1], [x1, y0, 1, -1], [x0, y1, -1, 1], [x1, y1, 1, 1]].forEach(([cx, cy, dx, dy]) => {
        ctx.moveTo(cx + dx * off, cy);
        ctx.lineTo(cx + dx * (off + m), cy);
        ctx.moveTo(cx, cy + dy * off);
        ctx.lineTo(cx, cy + dy * (off + m));
      });
      ctx.stroke();
    });
    pages.push({ jpeg: await canvasJpeg(canvas), pixelWidth: canvas.width, pixelHeight: canvas.height, widthMm: L.page.w, heightMm: L.page.h });
  }
  return buildPdf(pages, title);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
