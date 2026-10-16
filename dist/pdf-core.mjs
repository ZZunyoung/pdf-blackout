import * as mupdf from './vendor/mupdf/mupdf.js';

export { mupdf };
export function openPDF(bytes, password = '') {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  if (doc.needsPassword() && !doc.authenticatePassword(password)) {
    doc.destroy();
    throw new Error('PASSWORD_REQUIRED');
  }
  if (!doc.isPDF() || !doc.countPages()) {
    doc.destroy();
    throw new Error('읽을 수 있는 PDF 페이지가 없습니다.');
  }
  return doc;
}

export function rectFromNormalized(bounds, rect) {
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some(v => !Number.isFinite(v) || v < 0 || v > 1) || rect[2] <= rect[0] || rect[3] <= rect[1]) {
    throw new Error('잘못된 선택 영역입니다.');
  }
  return [bounds[0] + rect[0] * (bounds[2] - bounds[0]), bounds[1] + rect[1] * (bounds[3] - bounds[1]), bounds[0] + rect[2] * (bounds[2] - bounds[0]), bounds[1] + rect[3] * (bounds[3] - bounds[1])];
}

export function intersects(a, b) {
  return Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);
}

export function selectedText(page, rect) {
  const stext = page.toStructuredText('preserve-whitespace');
  const lines = [];
  let line = '';
  try {
    stext.walk({
      onChar(c, origin, font, size, q) {
        const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
        if (intersects(rect, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])) line += c;
      },
      endLine() { if (line.trim()) lines.push(line.trim()); line = ''; }
    });
    if (line.trim()) lines.push(line.trim());
    return lines.join('\n');
  } finally { stext.destroy(); }
}

// Compare an isolated copy before and after the actual deletion engine runs.
// This avoids differences between selection bounding boxes and redaction rules.
export function reviewArea(doc, index, normalizedRect) {
  const copy = new mupdf.PDFDocument();
  let page;
  function collect(p) {
    const lines = [], st = p.toStructuredText('preserve-whitespace');
    let line = [];
    try {
      st.walk({
        onChar(c, origin) {
          line.push({ c, key: c + ':' + origin.map(v => Math.round(v * 100)).join(',') });
        },
        endLine() { lines.push(line); line = []; }
      });
      if (line.length) lines.push(line);
      return lines;
    } finally { st.destroy(); }
  }
  try {
    copy.graftPage(-1, doc, index); page = copy.loadPage(0);
    const before = collect(page);
    applyAreas(page, [{ rect: normalizedRect }]);
    const remaining = new Map();
    for (const char of collect(page).flat()) remaining.set(char.key, (remaining.get(char.key) || 0) + 1);
    return before.map(line => line.filter(char => {
      const n = remaining.get(char.key) || 0;
      if (n) { remaining.set(char.key, n - 1); return false; }
      return true;
    }).map(char => char.c).join('').trim()).filter(Boolean).join('\n');
  } finally { page?.destroy(); copy.destroy(); }
}

export function renderPage(doc, index, width, maxScale = 3) {
  const page = doc.loadPage(index);
  let pix;
  try {
    const bounds = page.getBounds();
    const scale = Math.min(maxScale, width / (bounds[2] - bounds[0]), Math.sqrt(18000000 / ((bounds[2]-bounds[0])*(bounds[3]-bounds[1]))));
    pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, true, true);
    return { width: pix.getWidth(), height: pix.getHeight(), pixels: new Uint8ClampedArray(pix.getPixels()), bounds };
  } finally { pix?.destroy(); page.destroy(); }
}

export function applyAreas(page, areas) {
  const bounds = page.getBounds();
  for (const area of areas) {
    const annot = page.createAnnotation('Redact');
    annot.setRect(rectFromNormalized(bounds, area.rect));
    annot.update();
  }
  if (areas.length) page.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_PIXELS, mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE);
}

export async function exportPDF(bytes, password, areas, mode, onProgress = () => {}) {
  if (!areas.length || areas.some(a => !a.confirmed)) throw new Error('삭제 내용을 확인한 영역만 저장할 수 있습니다.');
  if (!['safe', 'preserve'].includes(mode)) throw new Error('잘못된 저장 방식입니다.');
  const source = openPDF(bytes, password);
  const output = new mupdf.PDFDocument();
  try {
    const count = source.countPages();
    if (areas.some(a => !Number.isInteger(a.page) || a.page < 0 || a.page >= count)) throw new Error('잘못된 페이지입니다.');
    // Flatten existing visible annotations/widgets before applying new redactions.
    // This prevents a removable annotation from concealing unrevised content.
    source.bake(true, true);
    for (let i = 0; i < count; i++) {
      const page = source.loadPage(i);
      let pix, image, imageRef, added;
      try {
        applyAreas(page, areas.filter(a => a.page === i));
        if (mode === 'safe') {
          const b = page.getBounds(), w = b[2]-b[0], h = b[3]-b[1];
          const scale = Math.min(2.5, Math.sqrt(18000000/(w*h)));
          pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
          image = new mupdf.Image(pix);
          imageRef = output.addImage(image);
          added = output.addPage([0, 0, w, h], 0, { XObject: { Im0: imageRef } }, 'q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q');
          output.insertPage(-1, added);
        } else {
          // Only copy page trees into a new file: discard old revisions, document
          // metadata, attachments and document-level scripts.
          output.graftPage(-1, source, i);
        }
      } finally { added?.destroy(); imageRef?.destroy(); image?.destroy(); pix?.destroy(); page.destroy(); }
      onProgress({ done: i + 1, total: count });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    output.setMetaData('info:Producer', 'PDF Blackout');
    const buf = output.saveToBuffer('garbage=4,compress=yes,clean=yes');
    try { return new Uint8Array(buf.asUint8Array()); } finally { buf.destroy(); }
  } finally { source.destroy(); output.destroy(); }
}
