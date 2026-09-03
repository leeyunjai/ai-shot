// ═══════════════════════════════════════════════════════════
// 갤러리 — 찍은 사진 + 내가 가르친 제스처
// ═══════════════════════════════════════════════════════════
//  · 사진은 IndexedDB 에 Blob 으로 있다. 화면에 걸 때만 objectURL 을 만들고,
//    지우거나 페이지를 떠날 때 반드시 되돌려준다 (안 그러면 메모리가 샌다).
//  · 제스처(모델)는 센스 랩과 같은 저장 형식이라 zip 을 그대로 주고받는다.

import { Photos, download, downloadAllZip } from './photos.js';
import { Store, exportZip, importZip } from './store.js';
import { SOURCE_LABELS } from './features.js';

const $ = id => document.getElementById(id);
const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);

let photos = [];          // [{ rec, url }]
let viewing = null;

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// ═══ 사진 ═══
function freePhotos() {
  photos.forEach(p => URL.revokeObjectURL(p.url));
  photos = [];
}

async function loadPhotos() {
  freePhotos();
  let recs = [];
  try { recs = await Photos.list(); } catch (e) { console.error(e); }
  photos = recs.map(rec => ({ rec, url: URL.createObjectURL(rec.blob) }));
  renderPhotos();
}

function renderPhotos() {
  const grid = $('phGrid');
  grid.innerHTML = '';
  photos.forEach(p => {
    const cell = document.createElement('button');
    cell.className = 'shot';
    cell.type = 'button';
    cell.title = fmtDate(p.rec.at) + (p.rec.trigger ? ' · ' + p.rec.trigger : '');
    const im = document.createElement('img');
    im.src = p.url;
    im.alt = '';
    im.loading = 'lazy';
    cell.appendChild(im);
    if (p.rec.trigger) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = p.rec.trigger;
      cell.appendChild(tag);
    }
    cell.addEventListener('click', () => openViewer(p));
    grid.appendChild(cell);
  });
  const n = photos.length;
  $('phEmpty').style.display = n ? 'none' : '';
  $('phCount').textContent = n ? T('N장').replace('N', n) : '';
  $('phZip').disabled = !n;
  $('phClear').disabled = !n;
}

function openViewer(p) {
  viewing = p;
  $('vImg').src = p.url;
  $('vMeta').textContent = fmtDate(p.rec.at) +
    (p.rec.trigger ? ' · ' + p.rec.trigger : '') +
    (p.rec.w ? ' · ' + p.rec.w + '×' + p.rec.h : '');
  $('viewer').classList.add('on');
}

function closeViewer() {
  viewing = null;
  $('viewer').classList.remove('on');
  $('vImg').removeAttribute('src');
}

async function delPhoto(p) {
  try {
    await Photos.remove(p.rec.id);
    URL.revokeObjectURL(p.url);
    photos = photos.filter(x => x !== p);
    renderPhotos();
    toast(T('지웠어요'));
  } catch (e) {
    console.error(e);
    toast(T('지우지 못했어요'));
  }
}

// ═══ 내가 가르친 동작 ═══
// 폰에서 표는 못 읽는다. 카드 한 줄에 이름·요약·버튼만 둔다.
async function loadModels() {
  let list = [];
  try { list = await Store.list(); } catch (e) { console.error(e); }
  const box = $('mdList');
  box.innerHTML = '';
  $('mdEmpty').style.display = list.length ? 'none' : '';

  list.forEach(m => {
    const total = (m.sampleCount || []).reduce((a, b) => a + b, 0);
    const card = document.createElement('div');
    card.className = 'mdcard';

    const info = document.createElement('div');
    info.className = 'mi';
    const nm = document.createElement('div');
    nm.className = 'mn';
    nm.textContent = m.name;
    const sub = document.createElement('div');
    sub.className = 'ms';
    sub.textContent = [
      T(SOURCE_LABELS[m.source] || m.source || ''),
      (m.classes || []).join(' · '),
      total + T('장'),
      m.accuracy != null ? Math.round(m.accuracy * 100) + '%' : null,
    ].filter(Boolean).join(' | ');
    info.appendChild(nm);
    info.appendChild(sub);
    card.appendChild(info);

    const acts = document.createElement('div');
    acts.className = 'ma';
    const mk = (icon, title, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'db' + (cls ? ' ' + cls : '');
      b.type = 'button';
      b.title = T(title);
      b.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
      b.addEventListener('click', fn);
      acts.appendChild(b);
    };

    mk('fa-graduation-cap', '이어서 배우기', '', () => {
      location.href = 'index.html?load=' + encodeURIComponent(m.name);
    });
    mk('fa-file-export', '내보내기', '', async () => {
      try { await exportZip(m.name); } catch (e) { console.error(e); toast(T('내보내지 못했어요')); }
    });
    mk('fa-pen', '이름 바꾸기', '', async () => {
      const to = prompt(T('새 이름'), m.name);
      if (!to || to.trim() === m.name) return;
      try { await Store.rename(m.name, to.trim()); toast(T('이름을 바꿨어요')); loadModels(); }
      catch (e) { toast(e && e.message === 'exists' ? T('같은 이름이 이미 있어요') : T('바꾸지 못했어요')); }
    });
    mk('fa-trash', '지우기', 'danger', async () => {
      if (!confirm(T('정말 지울까요?') + '\n' + m.name)) return;
      try { await Store.remove(m.name); toast(T('지웠어요')); loadModels(); }
      catch (e) { console.error(e); toast(T('지우지 못했어요')); }
    });

    card.appendChild(acts);
    box.appendChild(card);
  });
}

// ═══ zip 불러오기 ═══
async function takeFile(file) {
  if (!file) return;
  if (!/\.zip$/i.test(file.name)) { toast(T('zip 파일만 넣을 수 있어요')); return; }
  try {
    const rec = await importZip(file);
    toast(T('불러왔어요') + ': ' + rec.name);
    loadModels();
  } catch (e) {
    console.error(e);
    toast(T('불러오지 못했어요. 내보낸 zip 이 맞나요?'));
  }
}

// ═══ 이벤트 ═══
$('phZip').addEventListener('click', async () => {
  if (!photos.length) return;
  try { await downloadAllZip(photos.map(p => p.rec)); }
  catch (e) { console.error(e); toast(T('내보내지 못했어요')); }
});

$('phClear').addEventListener('click', async () => {
  if (!photos.length) return;
  if (!confirm(T('사진을 전부 지울까요? 되돌릴 수 없어요.'))) return;
  try {
    await Photos.clear();
    freePhotos();
    renderPhotos();
    toast(T('전부 지웠어요'));
  } catch (e) { console.error(e); toast(T('지우지 못했어요')); }
});

$('vClose').addEventListener('click', closeViewer);
$('viewer').addEventListener('click', e => { if (e.target === $('viewer')) closeViewer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });
$('vDown').addEventListener('click', () => { if (viewing) download(viewing.rec); });
$('vDel').addEventListener('click', async () => {
  if (!viewing) return;
  if (!confirm(T('이 사진을 지울까요?'))) return;
  const p = viewing;
  closeViewer();
  await delPhoto(p);
});

const dz = $('dropZone');
dz.addEventListener('click', () => $('impFile').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('over');
  takeFile(e.dataTransfer.files && e.dataTransfer.files[0]);
});
$('impFile').addEventListener('change', e => {
  takeFile(e.target.files && e.target.files[0]);
  e.target.value = '';
});

window.addEventListener('pagehide', freePhotos);

// ═══ 시작 ═══
loadPhotos().then(() => {
  // 촬영실에서 "#사진id" 로 넘어오면 그 사진을 바로 크게 연다
  const want = decodeURIComponent((location.hash || '').slice(1));
  if (!want) return;
  const hit = photos.find(p => p.rec.id === want);
  if (hit) openViewer(hit);
});
loadModels();
