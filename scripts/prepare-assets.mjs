import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
function copy(from, to) { mkdirSync(to, {recursive:true}); copyFileSync(from, to + '/' + from.split('/').pop()); }
for (const name of ['mupdf.js','mupdf-wasm.js','mupdf-wasm.wasm']) copy('node_modules/mupdf/dist/'+name,'dist/vendor/mupdf');
copy('node_modules/mupdf/LICENSE','dist/vendor/mupdf');
for (const name of ['tesseract.esm.min.js','worker.min.js','worker.min.js.LICENSE.txt']) copy('node_modules/tesseract.js/dist/'+name,'dist/vendor/ocr');
copy('node_modules/tesseract.js/LICENSE.md','dist/vendor/ocr');
for (const name of readdirSync('node_modules/tesseract.js-core')) if (/lstm\.wasm(\.js)?$/.test(name) || name==='LICENSE') copy('node_modules/tesseract.js-core/'+name,'dist/vendor/ocr/core');
for (const lang of ['kor','eng']) copy('node_modules/@tesseract.js-data/'+lang+'/4.0.0/'+lang+'.traineddata.gz','dist/vendor/ocr/lang');
