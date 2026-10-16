const $ = id => document.getElementById(id);
const worker = new Worker(new URL('./pdf-worker.mjs', import.meta.url), { type: 'module' });
let seq = 0;
const pendingCalls = new Map();
worker.onmessage = ({data}) => {
  const pending = pendingCalls.get(data.id);
  if (!pending) return;
  if (data.progress) { pending.progress?.(data.progress); return; }
  clearTimeout(pending.timer); pendingCalls.delete(data.id);
  if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data.result);
};
worker.onerror = () => {
  for (const entry of pendingCalls.values()) { clearTimeout(entry.timer); entry.reject(new Error('PDF 처리 엔진을 불러오지 못했습니다. 페이지를 새로고침해 주세요.')); }
  pendingCalls.clear();
};
function rpc(method, args, progress) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pendingCalls.delete(id); reject(new Error('처리 시간이 오래 걸리고 있습니다. 더 작은 PDF로 다시 시도해 주세요.')); }, 600000);
    pendingCalls.set(id, { resolve, reject, progress, timer });
    worker.postMessage({ id, method, args });
  });
}

let file = null, pageCount = 0, currentPage = 0, zoom = 1, areas = [], nextAreaId = 1;
let busy = false, exporting = false, dirty = false, documentToken = 0, renderToken = 0, reviewToken = 0;
let review = null, drawing = null, toastTimer, resizeTimer;
let ocrWorker = null, ocrInit = null, ocrRunning = false, passwordFile = null;
const thumbs = new Set();
function toast(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 8000 : 4500);
}
function setBusy(value, message = '') {
  busy = value; document.body.classList.toggle('busy', value); $('loading').hidden = !value;
  if (message) $('loadingText').textContent = message;
  ['prevPage','nextPage','zoomIn','zoomOut','fitBtn','pageInput','openBtn','sampleBtn'].forEach(id => $(id).disabled = value);
  updateExport();
}
function updateExport() {
  $('exportBtn').disabled = busy || !areas.length;
  $('exportMode').disabled = busy;
  $('confirmedCount').textContent = areas.length + '개';
  $('areaCount').textContent = areas.length;
  $('exportBtn').querySelector('span').textContent = exporting ? 'PDF를 만드는 중…' : '삭제 적용 · PDF 저장';
}
function paintCanvas(canvas, result) {
  canvas.width = result.width; canvas.height = result.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.pixels), result.width, result.height), 0, 0);
}
function createPageButtons() {
  $('pageList').replaceChildren();
  for (let i = 0; i < pageCount; i++) {
    const btn = document.createElement('button'); btn.className = 'page-card'; btn.dataset.page = i; btn.setAttribute('aria-label', (i + 1) + '페이지로 이동');
    const mini = document.createElement('div'); mini.className = 'mini-page';
    const num = document.createElement('span'); num.textContent = String(i + 1).padStart(2, '0'); mini.append(num);
    const label = document.createElement('span'); label.textContent = (i + 1) + ' 페이지'; btn.append(mini, label);
    btn.onclick = () => { if (!busy) goPage(i); }; $('pageList').append(btn);
  }
}
function drawThumbnail(index, result) {
  const mini = $('pageList').querySelector('[data-page="' + index + '"] .mini-page');
  if (!mini) return;
  const canvas = document.createElement('canvas'); paintCanvas(canvas, result);
  const scaled = document.createElement('canvas');
  const scale = Math.min(78 / canvas.width, 109 / canvas.height);
  scaled.width = Math.round(canvas.width * scale); scaled.height = Math.round(canvas.height * scale);
  scaled.getContext('2d').drawImage(canvas, 0, 0, scaled.width, scaled.height);
  mini.replaceChildren(scaled); thumbs.add(index); updatePageDots();
}
async function fillThumbnails(token) {
  for (let i = 0; i < Math.min(pageCount, 24); i++) {
    if (token !== documentToken || exporting) return;
    if (thumbs.has(i)) continue;
    try { const result = await rpc('render', { page: i, width: 90 }); if (token !== documentToken) return; drawThumbnail(i, result); } catch { return; }
  }
}
async function openFile(nextFile, password = '', retry = false) {
  if (busy) return;
  if (nextFile.size > 100 * 1024 * 1024) { toast('100 MB 이하의 PDF 파일을 선택해 주세요.', true); return; }
  if (!retry && dirty && !window.confirm('새 문서를 열면 현재 선택한 영역이 사라집니다. 계속하시겠습니까?')) return;
  const token = ++documentToken;
  setBusy(true, 'PDF를 여는 중입니다…');
  try {
    const bytes = await nextFile.arrayBuffer();
    const result = await rpc('open', { bytes, password });
    file = nextFile; pageCount = result.count; currentPage = 0; zoom = 1; areas = []; nextAreaId = 1; dirty = false; thumbs.clear();
    $('fileName').textContent = file.name; $('fileName').title = file.name;
    $('fileMeta').textContent = pageCount + ' 페이지 · ' + (file.size < 1048576 ? Math.max(1,Math.round(file.size / 1024)) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB');
    $('pageCount').textContent = pageCount; $('totalPages').textContent = '/ ' + pageCount;
    $('pageInput').max = pageCount; $('tools').hidden = false; $('welcome').hidden = true; $('documentArea').hidden = false;
    createPageButtons(); renderAreaList();
    $('passwordDialog').close(); passwordFile = null;
    await renderCurrent();
    setBusy(false); fillThumbnails(token);
    toast('문서를 열었습니다. 지울 영역을 드래그하세요.');
  } catch (e) {
    setBusy(false);
    if (e.message === 'PASSWORD_REQUIRED') {
      passwordFile = nextFile; $('passwordError').textContent = retry ? '비밀번호가 맞지 않습니다. 다시 입력해 주세요.' : '';
      $('passwordInput').value = ''; if (!$('passwordDialog').open) $('passwordDialog').showModal(); $('passwordInput').focus();
    } else toast('PDF를 열지 못했습니다. ' + e.message, true);
  }
}
function viewWidth() { return Math.max(250, $('viewer').clientWidth - (window.innerWidth <= 620 ? 28 : 60)); }
async function renderCurrent() {
  const request = ++renderToken, token = documentToken, index = currentPage;
  const cssWidth = Math.min(viewWidth(), 860) * zoom;
  const result = await rpc('render', { page: index, width: Math.round(cssWidth * Math.min(window.devicePixelRatio || 1, 2)) });
  if (request !== renderToken || token !== documentToken) return;
  paintCanvas($('pdfCanvas'), result);
  $('pdfCanvas').style.width = cssWidth + 'px'; $('pdfCanvas').style.height = (cssWidth * result.height / result.width) + 'px';
  $('canvasShell').style.width = cssWidth + 'px';
  $('pageInput').value = index + 1; $('fitBtn').textContent = Math.round(zoom * 100) + '%';
  $('pageCaption').textContent = (index + 1) + ' / ' + pageCount + ' 페이지 · 드래그해서 삭제할 영역을 선택하세요';
  $('workspaceHint').textContent = '● 영역을 드래그하고 삭제할 내용을 확인하세요';
  for (const btn of $('pageList').children) { const active = Number(btn.dataset.page) === index; btn.classList.toggle('active', active); btn.setAttribute('aria-current', active ? 'page' : 'false'); }
  if (!thumbs.has(index)) drawThumbnail(index, result);
  drawSelections();
}
async function goPage(index) {
  if (busy || !file || !Number.isInteger(index) || index < 0 || index >= pageCount) { $('pageInput').value = currentPage + 1; return; }
  currentPage = index; setBusy(true, '페이지를 표시하는 중…');
  try { await renderCurrent(); $('viewer').scrollTo({ top: 0, left: 0 }); }
  catch (e) { toast(e.message, true); } finally { setBusy(false); }
}
async function setZoom(value) {
  if (!file || busy) return;
  zoom = Math.min(2, Math.max(0.5, value)); setBusy(true, '문서를 확대하는 중…');
  try { await renderCurrent(); } catch (e) { toast(e.message, true); } finally { setBusy(false); }
}
function boxElement(rect, className = '') {
  const box = document.createElement('div'); box.className = 'selection-box ' + className;
  Object.assign(box.style, { left: (rect[0]*100) + '%', top: (rect[1]*100) + '%', width: ((rect[2]-rect[0])*100) + '%', height: ((rect[3]-rect[1])*100) + '%' });
  return box;
}
function drawSelections() {
  const layer = $('selectionLayer'); layer.replaceChildren();
  areas.forEach((area, i) => {
    if (area.page !== currentPage) return;
    const box = boxElement(area.rect); const num = document.createElement('span'); num.className = 'selection-number'; num.textContent = String(i + 1).padStart(2, '0'); box.append(num); layer.append(box);
  });
}
function point(event) {
  const b = $('selectionLayer').getBoundingClientRect();
  return [Math.min(1, Math.max(0, (event.clientX-b.left)/b.width)), Math.min(1, Math.max(0, (event.clientY-b.top)/b.height))];
}
function normalizedRect(a, b) { return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]; }
function cancelDrawing() { drawing = null; drawSelections(); }
$('selectionLayer').addEventListener('pointerdown', event => {
  if (busy || !file || event.button !== 0 || !event.isPrimary) return;
  event.preventDefault(); const start = point(event); const box = boxElement([start[0],start[1],start[0],start[1]], 'drawing');
  $('selectionLayer').append(box); drawing = { start, end:start, pointer:event.pointerId, box }; $('selectionLayer').setPointerCapture(event.pointerId);
});
$('selectionLayer').addEventListener('pointermove', event => {
  if (!drawing || event.pointerId !== drawing.pointer) return;
  drawing.end = point(event); const rect = normalizedRect(drawing.start, drawing.end); const b = drawing.box;
  b.style.left = rect[0]*100 + '%'; b.style.top = rect[1]*100 + '%'; b.style.width = (rect[2]-rect[0])*100 + '%'; b.style.height = (rect[3]-rect[1])*100 + '%';
});
$('selectionLayer').addEventListener('pointerup', event => {
  if (!drawing || event.pointerId !== drawing.pointer) return;
  const rect = normalizedRect(drawing.start, point(event)); drawing = null;
  if ($('selectionLayer').hasPointerCapture(event.pointerId)) $('selectionLayer').releasePointerCapture(event.pointerId);
  drawSelections();
  const b = $('selectionLayer').getBoundingClientRect();
  if ((rect[2]-rect[0])*b.width < 6 || (rect[3]-rect[1])*b.height < 6) return;
  showReview({ page: currentPage, rect, text:'', confirmed:false });
});
$('selectionLayer').addEventListener('pointercancel', cancelDrawing);

function cropSelection(rect) {
  const source = $('pdfCanvas'), crop = $('cropCanvas');
  const x = Math.floor(rect[0]*source.width), y = Math.floor(rect[1]*source.height);
  const w = Math.max(1, Math.ceil(rect[2]*source.width)-x), h = Math.max(1, Math.ceil(rect[3]*source.height)-y);
  crop.width = w; crop.height = h; const ctx = crop.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(source,x,y,w,h,0,0,w,h);
}
async function showReview(area) {
  review = { ...area, rect:[...area.rect] }; const token = ++reviewToken;
  $('confirmCheck').checked = false; $('confirmReview').disabled = true; $('ocrBtn').disabled = true;
  $('confirmReview').childNodes[0].textContent = area.id ? '확인 내용 업데이트 ' : '확인한 영역에 추가 ';
  $('reviewPage').textContent = (area.page+1) + ' 페이지'; $('textBadge').textContent = '텍스트 추출';
  $('extractedText').textContent = '삭제할 글자를 확인하고 있습니다…'; $('extractedText').classList.add('no-text');
  cropSelection(area.rect); $('reviewDialog').showModal();
  try {
    const result = await rpc('review', { page:area.page, rect:area.rect });
    if (token !== reviewToken || !review) return;
    review.text = result.text; review.ready = true;
    $('extractedText').textContent = result.text || '추출된 글자가 없습니다. 이미지 속 글자는 아래 OCR 기능으로 확인할 수 있습니다.';
    $('extractedText').classList.toggle('no-text', !result.text); $('ocrBtn').disabled = ocrRunning;
    $('confirmReview').disabled = !$('confirmCheck').checked;
  } catch(e) { if (token === reviewToken) { $('extractedText').textContent = '글자 확인에 실패했습니다. 영역을 다시 선택해 주세요.'; toast(e.message,true); } }
}
function closeReview() { ++reviewToken; review = null; $('reviewDialog').close(); }
$('reviewDialog').addEventListener('cancel', () => { ++reviewToken; review = null; });
$('confirmCheck').onchange = () => { $('confirmReview').disabled = !$('confirmCheck').checked || !review?.ready || ocrRunning; };
$('confirmReview').onclick = () => {
  if (!review?.ready || !$('confirmCheck').checked || ocrRunning) return;
  const area = { ...review, confirmed:true }; delete area.ready;
  if (area.id) areas = areas.map(a => a.id === area.id ? area : a); else { area.id = nextAreaId++; areas.push(area); }
  dirty = true; closeReview(); drawSelections(); renderAreaList(); toast('삭제할 영역에 추가했습니다. 저장할 때 실제 삭제됩니다.');
};
function renderAreaList() {
  $('areaList').replaceChildren();
  if (!areas.length) {
    const empty = document.createElement('div'); empty.className = 'areas-empty';
    const icon = document.createElement('span'); icon.className = 'select-icon'; icon.textContent = '⌜ ▪ ⌟';
    const title = document.createElement('strong'); title.textContent = '아직 선택한 영역이 없어요';
    const p = document.createElement('p'); p.textContent = '문서 위에서 마우스를 드래그해 지울 부분을 선택하세요.';
    empty.append(icon,title,p); $('areaList').append(empty);
  }
  areas.forEach((area,index) => {
    const card=document.createElement('div'); card.className='area-card';
    const head=document.createElement('div'); head.className='area-card-head';
    const title=document.createElement('div'); title.className='area-title';
    const num=document.createElement('span'); num.className='area-num'; num.textContent=String(index+1).padStart(2,'0');
    const label=document.createElement('span'); label.textContent=(area.page+1)+' 페이지'; title.append(num,label);
    const remove=document.createElement('button'); remove.className='icon-btn'; remove.textContent='×'; remove.disabled=busy; remove.setAttribute('aria-label',(index+1)+'번 영역 취소');
    remove.onclick=()=>{if(busy)return;areas=areas.filter(a=>a.id!==area.id);dirty=true;drawSelections();renderAreaList();}; head.append(title,remove);
    const text=document.createElement('p'); text.textContent=area.text || area.ocrText || '이미지 영역 · 추출된 글자 없음';
    const bottom=document.createElement('div'); bottom.className='area-card-bottom';
    const state=document.createElement('span'); state.textContent='✓ 내용 확인 완료';
    const revisit=document.createElement('button'); revisit.textContent='다시 확인'; revisit.disabled=busy;
    revisit.onclick=async()=>{if(busy)return;await goPage(area.page);showReview(area);}; bottom.append(state,revisit);card.append(head,text,bottom);$('areaList').append(card);
  });
  updateExport();updatePageDots();
}
function updatePageDots() {
  for (const btn of $('pageList').children) {
    const mini=btn.querySelector('.mini-page');if(!mini)continue;mini.querySelector('.page-dot')?.remove();
    if(areas.some(a=>a.page===Number(btn.dataset.page))){const dot=document.createElement('i');dot.className='page-dot';mini.append(dot);}
  }
}

$('ocrBtn').onclick = async () => {
  if (!review || ocrRunning || !review.ready) return;
  const target=review, token=reviewToken; ocrRunning=true; $('ocrBtn').disabled=true; $('confirmReview').disabled=true;
  $('confirmCheck').checked=false;
  const status = value => { if(token===reviewToken)$('textBadge').textContent=value; };
  try {
    status('OCR 준비 중…');
    if(!ocrWorker){
      if(!ocrInit)ocrInit=(async()=>{
        const {default:Tesseract}=await import('./vendor/ocr/tesseract.esm.min.js');
        return Tesseract.createWorker('kor+eng',1,{
          workerPath:new URL('./vendor/ocr/worker.min.js',location.href).href,
          corePath:new URL('./vendor/ocr/core/',location.href).href,
          langPath:new URL('./vendor/ocr/lang/',location.href).href,
          workerBlobURL:false,cacheMethod:'none',
          logger:m=>{if(token===reviewToken&&m.status==='recognizing text')status('OCR '+Math.round(m.progress*100)+'%');}
        });
      })();
      ocrWorker=await ocrInit;
    }
    // Render independently at up to 216 dpi for small scanned glyphs.
    const rendered=await rpc('render',{page:target.page,width:2400});
    const full=document.createElement('canvas');paintCanvas(full,rendered);
    const crop=document.createElement('canvas'), r=target.rect;
    const x=Math.floor(r[0]*full.width),y=Math.floor(r[1]*full.height);
    crop.width=Math.max(1,Math.ceil(r[2]*full.width)-x);crop.height=Math.max(1,Math.ceil(r[3]*full.height)-y);
    const ctx=crop.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,crop.width,crop.height);ctx.drawImage(full,x,y,crop.width,crop.height,0,0,crop.width,crop.height);
    const result=await ocrWorker.recognize(crop);
    if(token!==reviewToken||review!==target)return;
    target.ocrText=result.data.text.trim();
    $('extractedText').textContent=(target.text?target.text+'\n\n[이미지 OCR · 참고]\n':'')+(target.ocrText||'OCR로 인식된 글자가 없습니다. 원본 이미지를 확인하세요.');
    $('extractedText').classList.toggle('no-text',!target.ocrText&&!target.text);status('OCR 완료 · 참고용');
  } catch(e) { ocrInit=null; if(token===reviewToken){status('OCR 실패');toast('이미지 글자 인식에 실패했습니다. 원본 영역을 확인해 주세요.',true);} }
  finally {ocrRunning=false;$('ocrBtn').disabled=false;if(review)$('confirmReview').disabled=!$('confirmCheck').checked||!review.ready;}
};

$('exportMode').onchange=()=>{ $('modeHint').textContent=$('exportMode').value==='safe'?'전체 페이지를 이미지로 재구성합니다.\n180dpi · 글자 검색·복사 불가':'선택 영역을 실제 삭제하고 나머지 글자는 유지합니다. 공유 이미지·레이어 문서는 안전 저장을 권장합니다.'; };
$('exportBtn').onclick=async()=>{
  if(busy||!areas.length)return;
  exporting=true;setBusy(true,'삭제를 적용하고 PDF를 만드는 중…');
  try{
    const result=await rpc('export',{areas:areas.map(a=>({page:a.page,rect:a.rect,confirmed:a.confirmed})),mode:$('exportMode').value},p=>{$('loadingText').textContent='삭제 적용 · '+p.done+' / '+p.total+' 페이지 처리 중';});
    const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
    const a=document.createElement('a');a.href=url;a.download=file.name.replace(/\.pdf$/i,'').replace(/[<>:"/\\|?*]/g,'_')+'_redacted.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    dirty=false;toast('삭제를 적용한 PDF를 저장했습니다. 다운로드 폴더를 확인하세요.');
  }catch(e){toast('PDF 저장에 실패했습니다. '+e.message,true);}
  finally{exporting=false;setBusy(false);renderAreaList();}
};

for(const id of ['openBtn','dropzone'])$(id).onclick=()=>{if(!busy)$('fileInput').click();};
$('fileInput').onchange=()=>{const f=$('fileInput').files[0];$('fileInput').value='';if(f)openFile(f);};
$('sampleBtn').onclick=async()=>{if(busy)return;try{const response=await fetch('./sample.pdf');if(!response.ok)throw new Error();const blob=await response.blob();await openFile(new File([blob],'샘플_공유용_문서.pdf',{type:'application/pdf'}));}catch{toast('샘플 문서를 열지 못했습니다.',true);}};
$('prevPage').onclick=()=>goPage(currentPage-1);$('nextPage').onclick=()=>goPage(currentPage+1);$('pageInput').onchange=()=>goPage(Number($('pageInput').value)-1);
$('zoomOut').onclick=()=>setZoom(zoom-.25);$('zoomIn').onclick=()=>setZoom(zoom+.25);$('fitBtn').onclick=()=>setZoom(1);
$('closeReview').onclick=closeReview;$('cancelReview').onclick=closeReview;
$('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
$('passwordForm').onsubmit=event=>{event.preventDefault();if(passwordFile)openFile(passwordFile,$('passwordInput').value,true);};
$('cancelPassword').onclick=()=>{$('passwordDialog').close();passwordFile=null;};
$('passwordDialog').addEventListener('cancel',()=>{passwordFile=null;});
let dragDepth=0;
window.addEventListener('dragenter',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();dragDepth++;if(!busy)$('dropOverlay').hidden=false;}});
window.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect=busy?'none':'copy';});
window.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropOverlay').hidden=true;});
window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('dropOverlay').hidden=true;if(busy)return;const f=e.dataTransfer.files[0];if(f){if(!/\.pdf$/i.test(f.name)&&f.type!=='application/pdf'){toast('PDF 파일을 선택해 주세요.',true);return;}openFile(f);}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawing)cancelDrawing();if(document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||busy)return;if(e.key==='ArrowLeft'){e.preventDefault();goPage(currentPage-1);}if(e.key==='ArrowRight'){e.preventDefault();goPage(currentPage+1);}});
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(file&&!busy&&!$('reviewDialog').open)renderCurrent().catch(()=>{});},200);});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
