import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openPDF, renderPage, rectFromNormalized, selectedText, reviewArea, exportPDF, mupdf } from '../dist/pdf-core.mjs';

const bytes = new Uint8Array(fs.readFileSync(new URL('./tmp/fixture.pdf',import.meta.url)));
const areas = [
  { page:0, rect:[.09,.06,.70,.13], confirmed:true },
  { page:0, rect:[.10,.40,.35,.60], confirmed:true },
];
function pageText(doc,index) { const p=doc.loadPage(index);const s=p.toStructuredText('');try{return s.asText();}finally{s.destroy();p.destroy();} }
function rgb(doc,index,x,y){const p=doc.loadPage(index);const pix=p.toPixmap(mupdf.Matrix.identity,mupdf.ColorSpace.DeviceRGB,false,true);try{const offset=(Math.floor(y)*pix.getWidth()+Math.floor(x))*3;return [...pix.getPixels().slice(offset,offset+3)];}finally{pix.destroy();p.destroy();}}
test('selects text and normalizes coordinates with rotation',()=>{
  const doc=openPDF(bytes);
  try{
    let p=doc.loadPage(0);assert.equal(selectedText(p,rectFromNormalized(p.getBounds(),areas[0].rect)),'SECRET-12345');p.destroy();
    p=doc.loadPage(1);assert.deepEqual(p.getBounds(),[0,0,500,400]);
    assert.match(selectedText(p,[420,30,470,300]),/SECRET-12345/);p.destroy();
    assert.throws(()=>rectFromNormalized([0,0,400,500],[.4,.2,.1,.5]));
  }finally{doc.destroy();}
});
test('normal export removes target text and image pixels while preserving other pages',async()=>{
  const out=await exportPDF(bytes,'',areas,'preserve');fs.writeFileSync(new URL('./tmp/redacted-preserve.pdf',import.meta.url),out);
  const doc=openPDF(out);
  try{
    assert.equal(doc.countPages(),2);assert.doesNotMatch(pageText(doc,0),/SECRET/);assert.match(pageText(doc,0),/KEEP-ME/);assert.match(pageText(doc,1),/SECRET/);
    assert.deepEqual(rgb(doc,0,70,250),[0,0,0]);const blue=rgb(doc,0,190,250);assert.ok(blue[2]>150&&blue[0]<90);
    assert.deepEqual(doc.getEmbeddedFiles(),{});
  }finally{doc.destroy();}
});
test('review text matches actual deletion, including partial glyph boundaries',async()=>{
  const doc=openPDF(bytes);
  try{
    for(const r of [areas[0].rect,[.115,.06,.125,.13],[.1,.06,.13,.105]]){
      const text=reviewArea(doc,0,r);
      const data=await exportPDF(bytes,'',[{page:0,rect:r,confirmed:true}],'preserve');
      const edited=openPDF(data);
      try{
        const original='SECRET-12345',remaining=pageText(edited,0).split('\n')[0];
        let pos=0,deleted='';for(const char of original){if(char===remaining[pos])pos++;else deleted+=char;}
        assert.equal(text,deleted);
      }finally{edited.destroy();}
    }
    assert.match(pageText(doc,0),/SECRET-12345/);
  }finally{doc.destroy();}
});
test('safe export has no original text and contains only rebuilt page images',async()=>{
  const out=await exportPDF(bytes,'',areas,'safe');fs.writeFileSync(new URL('./tmp/redacted-safe.pdf',import.meta.url),out);
  const doc=openPDF(out);
  try{
    assert.equal(pageText(doc,0).trim(),'');assert.equal(pageText(doc,1).trim(),'');
    assert.deepEqual(rgb(doc,0,70,250),[0,0,0]);const blue=rgb(doc,0,190,250);assert.ok(blue[2]>150&&blue[0]<90);
    const page=doc.loadPage(0);const refs=page.getObject().get('Resources','XObject');let resourceCount=0;refs.forEach(()=>resourceCount++);assert.equal(resourceCount,1);
    const image=refs.get('Im0');assert.equal(image.get('Width').asNumber(),1000);assert.equal(image.get('Height').asNumber(),1250);
    refs.destroy();image.destroy();page.destroy();assert.deepEqual(doc.getEmbeddedFiles(),{});
  }finally{doc.destroy();}
});
test('safe export redacts correctly on rotated page',async()=>{
  const area={page:1,rect:[.84,.07,.94,.75],confirmed:true};
  const out=await exportPDF(bytes,'',[area],'safe');const doc=openPDF(out);
  try{const p=doc.loadPage(1);assert.deepEqual(p.getBounds(),[0,0,500,400]);p.destroy();assert.deepEqual(rgb(doc,1,450,100),[0,0,0]);}finally{doc.destroy();}
});
test('unconfirmed areas are rejected and original remains intact',async()=>{
  await assert.rejects(exportPDF(bytes,'',[{...areas[0],confirmed:false}],'safe'));
  const doc=openPDF(bytes);try{assert.match(pageText(doc,0),/SECRET-12345/);const r=renderPage(doc,0,200);assert.equal(r.width,200);assert.equal(r.pixels.length,r.width*r.height*4);}finally{doc.destroy();}
});
