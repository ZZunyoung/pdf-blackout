import { openPDF, renderPage, reviewArea, exportPDF } from './pdf-core.mjs';
let doc, original, password = '';
let serial = Promise.resolve();

self.onmessage = ({ data }) => {
  serial = serial.then(async () => {
    const { id, method, args } = data;
    try {
      let result;
      if (method === 'open') {
        const candidate = new Uint8Array(args.bytes);
        const next = openPDF(candidate, args.password || '');
        doc?.destroy(); doc = next; original = candidate; password = args.password || '';
        result = { count: doc.countPages() };
      } else if (method === 'render') {
        result = renderPage(doc, args.page, args.width);
      } else if (method === 'review') {
        result = { text: reviewArea(doc, args.page, args.rect) };
      } else if (method === 'export') {
        const bytes = await exportPDF(original, password, args.areas, args.mode, progress => self.postMessage({ id, progress }));
        result = { bytes: bytes.buffer };
      } else throw new Error('알 수 없는 작업입니다.');
      const transfer = result.pixels ? [result.pixels.buffer] : result.bytes ? [result.bytes] : [];
      self.postMessage({ id, result }, transfer);
    } catch (error) { self.postMessage({ id, error: error.message || String(error) }); }
  });
};
