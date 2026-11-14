/**
 * Minimal, dependency-free PDF writer: one full-bleed JPEG image per page.
 * Page sizes are exact physical sizes, so labels print at true scale.
 */
export interface PdfPage {
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  widthMm: number;
  heightMm: number;
}

const MM_TO_PT = 72 / 25.4;

export function buildPdf(pages: PdfPage[], title: string): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObj = (id: number) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };

  // Object ids: 1 catalog, 2 pages, 3 info, then 3 per page (page, content, image).
  const pageIds = pages.map((_, i) => 4 + i * 3);
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);
  startObj(3);
  const safeTitle = title.replace(/[()\\]/g, '').replace(/[^\x20-\x7E]/g, '');
  push(`<< /Title (${safeTitle}) /Producer (TableCraft) >>\nendobj\n`);

  pages.forEach((page, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const w = (page.widthMm * MM_TO_PT).toFixed(2);
    const h = (page.heightMm * MM_TO_PT).toFixed(2);

    startObj(pageId);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /TrimBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
    );

    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    startObj(contentId);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    startObj(imageId);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
    );
    push(page.jpeg);
    push('\nendstream\nendobj\n');
  });

  const xrefStart = length;
  const total = 4 + pages.length * 3;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}
