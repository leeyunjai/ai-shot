// ═══════════════════════════════════════════════════════════
// 제스처 만들기 — 예시 모으기 → 배우기 → 저장
// ═══════════════════════════════════════════════════════════
// 촬영실의 셔터로 쓸 나만의 동작을 가르친다.
//
// 셔터로 쓰려면 "그 동작"과 "그게 아닌 것" 둘 다 필요하다.
// 하나만 배운 모델은 무엇을 보든 그 하나로 답하기 때문에 계속 찍힌다.
// 그래서 종류가 2개 미만이면 배우기 버튼이 열리지 않는다.

import { loadLandmarker, drawResult, accentColor, accentRgba } from './landmarker.js';
import { extract, dimOf, VARIANTS } from './features.js';
import { createSoundEngine, preloadSound, drawLevels } from './sound.js';
import { trainModel } from './trainer.js';
import { Store } from './store.js';

const $ = id => document.getElementById(id);
const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);

let source = 'hand';
let variant = 'one';
const defVariant = src => (VARIANTS[src] ? VARIANTS[src][0][0] : null);
const snd = createSoundEngine();
const isSound = () => source === 'sound';

let lm = null, lmLoading = false;
let stream = null;
let classes = [];              // [{ name, vecs, thumbs }]
let selected = -1;
let capturing = false, lastCap = 0;
let lastVec = null;
let trained = null;
let training = false;

// ── 알림 ──
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function progress(label, pct, ratio) {
  $('prgLabel').textContent = label;
  $('prgPct').textContent = pct == null ? '' : pct;
  if (ratio != null) $('prgFill').style.width = Math.round(ratio * 100) + '%';
}

// ═══ 랜드마커 ═══
const lmCache = {};
function getLm(src) {
  if (!lmCache[src]) {
    lmCache[src] = loadLandmarker(src).catch(e => { lmCache[src] = null; throw e; });
  }
  return lmCache[src];
}

let preloaded = false;
function preloadRest() {
  if (preloaded) return;
  preloaded = true;
  setTimeout(async () => {
    for (const s of ['hand', 'face', 'pose']) {
      try { await getLm(s); } catch (e) { /* 무시 */ }
    }
    preloadSound();
  }, 1200);
}

function setSrcSpin(src, on) {
  const ic = document.querySelector('.srcpick [data-src="' + src + '"] i');
  if (!ic) return;
  if (on) {
    if (!ic.dataset.icon) ic.dataset.icon = ic.className;
    ic.className = 'fa-solid fa-spinner fa-spin';
  } else if (ic.dataset.icon) {
    ic.className = ic.dataset.icon;
  }
}

async function useSource(next) {
  if (lmLoading) return;
  lmLoading = true;
  setSrcSpin(next, true);
  $('engine').textContent = T('준비 중…');
  lm = null;
  try {
    if (next === 'sound') await preloadSound();
    else lm = await getLm(next);
    source = next;
    $('engine').textContent = T('준비 완료');
    progress(T('준비 완료'), '');
    preloadRest();
  } catch (e) {
    console.error(e);
    $('engine').textContent = T('불러오지 못했어요');
    progress(T('불러오지 못했어요. 새로고침해 주세요'), '', 0);
  }
  setSrcSpin(next, false);
  lmLoading = false;
  applySrcUI();
  refreshUI();
}

function pickSource(next) {
  if (next === source) return;
  const hasData = classes.some(c => c.vecs.length > 0);
  if (hasData && !confirm(T('보는 것을 바꾸면 모은 예시가 지워져요. 바꿀까요?'))) {
    renderSrc(); return;
  }
  if (next === 'sound') camStop();
  else if (isSound()) micStop();
  classes.forEach(c => { c.vecs = []; c.thumbs = []; });
  clearTrained();
  variant = defVariant(next);
  renderClasses(); renderSrc(next);
  useSource(next).then(() => { renderSrc(); renderVariant(); refreshUI(); });
}

const VARIANT_UI = {
  hand: { q: '몇 개 볼까요?', icons: { one: 'fa-hand', two: 'fa-hands' } },
  pose: { q: '어디까지 볼까요?', icons: { upper: 'fa-user', full: 'fa-person' } },
};
function renderVariant() {
  const box = $('variantRow');
  const opts = VARIANTS[source];
  if (!opts) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const ui = VARIANT_UI[source];
  box.style.display = '';
  box.innerHTML = '';
  const lb = document.createElement('span');
  lb.className = 'lb2';
  lb.textContent = T(ui.q);
  box.appendChild(lb);
  const seg = document.createElement('div');
  seg.className = 'seg';
  opts.forEach(([v, ko]) => {
    const b = document.createElement('button');
    b.classList.toggle('on', variant === v);
    b.innerHTML = '<i class="fa-solid ' + ui.icons[v] + '"></i>' + T(ko);
    b.addEventListener('click', () => {
      if (variant === v) return;
      const hasData = classes.some(c => c.vecs.length > 0);
      if (hasData && !confirm(T('보는 것을 바꾸면 모은 예시가 지워져요. 바꿀까요?'))) return;
      classes.forEach(c => { c.vecs = []; c.thumbs = []; });
      clearTrained();
      variant = v;
      renderClasses(); renderVariant(); refreshUI();
    });
    seg.appendChild(b);
  });
  box.appendChild(seg);
}

function applySrcUI() {
  const s = isSound();
  $('camVid').style.display = s ? 'none' : '';
  $('ovCv').style.display = s ? 'none' : '';
  $('micCv').style.display = s ? '' : 'none';
  $('camBox').style.aspectRatio = s ? '4 / 3' : '';
  $('panCTitle').textContent = s ? T('마이크 & 예시') : T('카메라 & 예시');
  $('privNote').textContent = s
    ? T('들리는 소리는 이 컴퓨터 밖으로 나가지 않아요')
    : T('찍은 영상은 이 컴퓨터 밖으로 나가지 않아요');
  const on = s ? snd.running : !!stream;
  $('camOff').style.display = on ? 'none' : '';
  $('camOff').querySelector('i').className =
    'fa-solid fa-2x ' + (s ? 'fa-microphone-slash' : 'fa-video-slash');
  $('camOff').querySelector('span').textContent =
    s ? T('마이크가 꺼져 있어요') : T('카메라가 꺼져 있어요');
  setInputBtn(on);
  $('capBtn').innerHTML = '<i class="fa-solid ' + (s ? 'fa-microphone-lines' : 'fa-camera-retro') + '"></i> ' +
    (s ? T('꾹 눌러서 소리 모으기') : T('꾹 눌러서 예시 모으기'));
  listCams();
}

function setInputBtn(on) {
  const s = isSound();
  const icon = s ? (on ? 'fa-microphone-slash' : 'fa-microphone')
    : (on ? 'fa-video-slash' : 'fa-video');
  const txt = s ? (on ? T('마이크 끄기') : T('마이크 켜기'))
    : (on ? T('카메라 끄기') : T('카메라 켜기'));
  $('camBtn').innerHTML = '<i class="fa-solid ' + icon + '"></i> ' + txt;
}

function renderSrc(pending) {
  const cur = pending || source;
  document.querySelectorAll('.srcpick .db').forEach(b => {
    b.classList.toggle('on', b.dataset.src === cur);
  });
}

// ═══ 카메라 / 마이크 ═══
async function listCams() {
  const sel = $('camSel');
  const kind = isSound() ? 'audioinput' : 'videoinput';
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === kind);
    const cur = sel.value;
    sel.innerHTML = '';
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      const full = d.label || (T(isSound() ? '마이크' : '카메라') + ' ' + (i + 1));
      const cut = full.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').trim();
      o.textContent = cut.length > 22 ? cut.slice(0, 21) + '…' : cut;
      o.title = full;
      sel.appendChild(o);
    });
    if (cur && devs.some(d => d.deviceId === cur)) sel.value = cur;
  } catch (e) { /* 무시 */ }
}

async function camOn() {
  if (stream) return true;
  try {
    const want = { width: { ideal: 640 }, height: { ideal: 480 } };
    if ($('camSel').value) want.deviceId = { exact: $('camSel').value };
    stream = await navigator.mediaDevices.getUserMedia({ video: want, audio: false });
    $('camVid').srcObject = stream;
    await $('camVid').play();
    syncAspect();
    $('camVid').addEventListener('loadedmetadata', syncAspect);
    $('camOff').style.display = 'none';
    setInputBtn(true);
    await listCams();
    refreshUI();
    return true;
  } catch (e) {
    toast(T('카메라가 안 보여요. 연결을 확인해 주세요'));
    return false;
  }
}

function camStop() {
  stopCap();
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('camVid').srcObject = null;
  if (!isSound()) { $('camOff').style.display = ''; setInputBtn(false); }
  lastVec = null;
  refreshUI();
}

async function micOn() {
  if (snd.running) return true;
  try {
    await snd.start($('camSel').value || undefined);
    $('camOff').style.display = 'none';
    setInputBtn(true);
    await listCams();
    refreshUI();
    return true;
  } catch (e) {
    console.error(e);
    toast(T('마이크가 안 보여요. 연결을 확인해 주세요'));
    return false;
  }
}

function micStop() {
  stopCap();
  snd.stop();
  if (isSound()) { $('camOff').style.display = ''; setInputBtn(false); }
  lastVec = null;
  refreshUI();
}

snd.onTick = latest => {
  if (training || !isSound()) return;
  lastVec = latest.vec;
  if (capturing && selected >= 0) addSample(lastVec);
};

function camReady() { return !!(stream && $('camVid').videoWidth); }

function syncAspect() {
  const v = $('camVid');
  if (v.videoWidth) $('camBox').style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
}

// ═══ 감지 루프 ═══
function loop() {
  requestAnimationFrame(loop);
  if (training) return;
  if (isSound()) {
    if (snd.running) drawLevels($('micCv'), snd.levels, accentColor());
    return;
  }
  if (!camReady() || !lm) return;
  const video = $('camVid');
  let result = null;
  try { result = lm.detect(video, performance.now()); } catch (e) { return; }
  lastVec = extract(source, result, variant);

  const cv = $('ovCv');
  if (cv.width !== video.videoWidth || cv.height !== video.videoHeight) {
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    syncAspect();
  }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (lastVec) drawResult(ctx, source, result, variant);

  const now = performance.now();
  if (capturing && lastVec && selected >= 0 && now - lastCap > 100) {
    lastCap = now;
    addSample(lastVec);
  }
}

// ═══ 동작(클래스) ═══
function addClass() {
  const name = $('clsName').value.trim();
  if (!name) return;
  if (classes.some(c => c.name === name)) { toast(T('같은 이름이 이미 있어요')); return; }
  if (classes.length >= 6) { toast(T('동작은 6개까지 만들 수 있어요')); return; }
  classes.push({ name, vecs: [], thumbs: [] });
  $('clsName').value = '';
  selected = classes.length - 1;
  clearTrained();
  renderClasses(); refreshUI();
}

function delClass(i) {
  classes.splice(i, 1);
  if (selected >= classes.length) selected = classes.length - 1;
  clearTrained();
  renderClasses(); refreshUI();
}

function delSample(ci, si) {
  const c = classes[ci];
  if (!c || !c.vecs[si]) return;
  c.vecs.splice(si, 1);
  c.thumbs.splice(si, 1);
  renderClasses(); refreshUI();
}

function renderClasses() {
  const box = $('clsList');
  box.innerHTML = '';
  classes.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'cls' + (i === selected ? ' on' : '');
    el.addEventListener('click', ev => {
      if (ev.target.closest('.del')) return;
      selected = i; renderClasses(); refreshUI();
    });
    const top = document.createElement('div');
    top.className = 'top';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = c.name;
    const ct = document.createElement('span'); ct.className = 'ct'; ct.textContent = c.vecs.length + T('장');
    const del = document.createElement('button');
    del.className = 'del'; del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.title = T('지우기');
    del.addEventListener('click', () => delClass(i));
    top.appendChild(nm); top.appendChild(ct); top.appendChild(del);
    el.appendChild(top);

    if (c.thumbs.length) {
      const th = document.createElement('div'); th.className = 'thumbs';
      c.thumbs.forEach((src, si) => {
        const im = document.createElement('img');
        im.src = src;
        im.title = T('누르면 이 예시를 지워요');
        im.addEventListener('click', ev => { ev.stopPropagation(); delSample(i, si); });
        th.appendChild(im);
      });
      el.appendChild(th);
    }
    box.appendChild(el);
  });
  $('clsHint').style.display = classes.length ? 'none' : '';
}

// ═══ 예시 수집 ═══
function thumb() {
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 96;
  const ctx = cv.getContext('2d');
  if (isSound()) {
    ctx.fillStyle = '#0C1114';
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = accentColor();
    snd.levels.slice(-16).forEach((v, i) => {
      const h = Math.max(3, Math.min(1, v * 6) * 80);
      ctx.fillRect(i * 6 + 2, (96 - h) / 2, 4, h);
    });
    return cv.toDataURL('image/png');
  }
  const video = $('camVid');
  ctx.translate(96, 0); ctx.scale(-1, 1);
  const s = Math.min(video.videoWidth, video.videoHeight) || 1;
  const sx = (video.videoWidth - s) / 2, sy = (video.videoHeight - s) / 2;
  ctx.drawImage(video, sx, sy, s, s, 0, 0, 96, 96);
  return cv.toDataURL('image/jpeg', 0.7);
}

function addSample(vec) {
  const c = classes[selected];
  if (!c || c.vecs.length >= 200) return;
  c.vecs.push(Float32Array.from(vec));
  c.thumbs.push(thumb());
  clearTrained();
  renderClasses(); refreshUI();
}

function startCap() {
  const ready = isSound() ? snd.running : camReady();
  if (selected < 0 || !ready || capturing) return;
  capturing = true; lastCap = 0;
}
function stopCap() { capturing = false; }

// ═══ 배우기 ═══
function clearTrained() {
  if (trained) { trained.model.dispose(); trained = null; }
  $('resultSec').style.display = 'none';
  $('chartBox').style.display = 'none';
  refreshUI();
}

async function train() {
  const usable = classes.filter(c => c.vecs.length > 0);
  if (usable.length < 2) { toast(T('동작 2개에 예시가 있어야 해요')); return; }
  if (training) return;
  training = true;
  refreshUI();

  const dim = dimOf(source, variant);
  const vecs = [], labels = [];
  usable.forEach((c, i) => c.vecs.forEach(v => { vecs.push(v); labels.push(i); }));

  $('chartBox').style.display = '';
  const hist = [];
  try {
    const out = await trainModel(vecs, labels, usable.length, dim, (ep, total, rec) => {
      hist.push(rec);
      progress(T('배우는 중') + ' ' + ep + '/' + total,
        T('맞힌 비율') + ' ' + Math.round((rec.acc || 0) * 100) + '%', ep / total);
      drawChart(hist);
    });
    trained = Object.assign(out, { classes: usable.map(c => c.name), saved: false });
    progress(T('다 배웠어요'), T('맞힌 비율') + ' ' + Math.round(out.accuracy * 100) + '%', 1);
    showResult(out);
  } catch (e) {
    console.error(e);
    progress(T('배우다가 멈췄어요. 다시 해 보세요'), '', 0);
  }
  training = false;
  refreshUI();
}

function showResult(out) {
  $('resultSec').style.display = '';
  $('accBig').textContent = Math.round(out.accuracy * 100) + '%';
  $('accWord').textContent = T('맞힌 비율');
  const good = out.accuracy >= 0.9;
  $('accNote').textContent = good
    ? T('잘 배웠어요! 이름을 붙여 저장하고 촬영실에서 써 보세요.')
    : T('아직 헷갈려 해요. 예시를 더 모으거나, 동작을 더 다르게 해 보세요.');
  toast(good ? T('잘 배웠어요!') : T('아직 헷갈려 해요. 예시를 더 모아 볼까요?'));
}

function drawChart(hist) {
  const cv = $('chart');
  const W = cv.clientWidth || 280, H = cv.clientHeight || 110;
  if (cv.width !== W * 2) { cv.width = W * 2; cv.height = H * 2; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!hist.length) return;
  const pad = 6;
  const maxLoss = Math.max(0.001, ...hist.map(h => h.loss || 0));
  const px = i => pad + (W - 2 * pad) * (hist.length === 1 ? 1 : i / (hist.length - 1));
  const line = (get, color) => {
    ctx.beginPath();
    hist.forEach((h, i) => {
      const y = pad + (H - 2 * pad) * (1 - Math.max(0, Math.min(1, get(h))));
      i ? ctx.lineTo(px(i), y) : ctx.moveTo(px(i), y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  };
  const warn = (getComputedStyle(document.documentElement).getPropertyValue('--warn') || '').trim() || '#E2574C';
  line(h => (h.loss || 0) / maxLoss, warn);
  line(h => h.acc || 0, accentColor());
}

// ═══ 저장 ═══
async function saveModel() {
  if (!trained) return;
  const name = $('mdlName').value.trim();
  if (!name) { toast(T('이름을 적어 주세요')); return; }
  try {
    const exists = await Store.meta(name);
    if (exists && !confirm(T('같은 이름이 있어요. 바꿔 쓸까요?'))) return;
    const usable = classes.filter(c => c.vecs.length > 0);
    await Store.save(name, trained.model, {
      source,
      variant,
      featureDim: dimOf(source, variant),
      classes: trained.classes,
      sampleCount: usable.map(c => c.vecs.length),
      accuracy: trained.accuracy,
      examples: usable.map(c => ({
        name: c.name,
        vecs: c.vecs.map(v => Array.from(v)),
        thumbs: c.thumbs.slice(),
      })),
      createdAt: new Date().toISOString(),
      version: 2,
    });
    trained.saved = true;
    toast(T('저장했어요') + ': ' + name);
  } catch (e) {
    console.error(e);
    toast(T('저장하지 못했어요'));
  }
}

// ═══ 버튼 상태 ═══
function refreshUI() {
  const ready = isSound() ? snd.running : (camReady() && lm);
  $('capBtn').disabled = !(ready && selected >= 0);
  $('selInfo').textContent = selected >= 0
    ? T('고른 동작') + ': ' + classes[selected].name
    : T('동작을 골라 주세요');
  $('selInfo').classList.toggle('on', selected >= 0);
  const shot = classes.filter(c => c.vecs.length > 0).length;
  $('trainBtn').disabled = training || shot < 2;
  $('mdlSave').disabled = !trained;
}

// ═══ 이벤트 ═══
document.querySelectorAll('.srcpick .db').forEach(b => {
  b.addEventListener('click', () => pickSource(b.dataset.src));
});
$('clsAdd').addEventListener('click', addClass);
$('clsName').addEventListener('keydown', e => { if (e.key === 'Enter') addClass(); });
$('camBtn').addEventListener('click', () => {
  if (isSound()) return snd.running ? micStop() : micOn();
  return stream ? camStop() : camOn();
});
$('camSel').addEventListener('change', () => {
  if (isSound()) { if (snd.running) { micStop(); micOn(); } }
  else if (stream) { camStop(); camOn(); }
});
const cap = $('capBtn');
cap.addEventListener('pointerdown', e => { cap.setPointerCapture(e.pointerId); startCap(); });
cap.addEventListener('pointerup', stopCap);
cap.addEventListener('pointercancel', stopCap);
cap.addEventListener('contextmenu', e => e.preventDefault());
$('trainBtn').addEventListener('click', train);
$('mdlSave').addEventListener('click', saveModel);

// ═══ 이어서 배우기 (?load=이름) ═══
async function restoreWork(name) {
  try {
    const meta = await Store.meta(name);
    if (!meta || !meta.examples || !meta.examples.length) {
      toast(T('이어 할 예시가 없어요'));
      return;
    }
    variant = meta.variant || defVariant(source);
    renderVariant();
    classes = meta.examples.map(e => ({
      name: e.name,
      vecs: (e.vecs || []).map(v => Float32Array.from(v)),
      thumbs: (e.thumbs || []).slice(),
    }));
    selected = 0;
    $('mdlName').value = meta.name;
    renderClasses(); refreshUI();
    toast(T('이어서 시작해요') + ': ' + name);
  } catch (e) {
    console.error(e);
    toast(T('제스처를 불러오지 못했어요'));
  }
}

// ═══ 시작 ═══
const loadName = new URLSearchParams(location.search).get('load');
if (loadName) {
  Store.meta(loadName).then(meta => {
    if (meta && meta.source) source = meta.source;
    renderSrc();
    return useSource(source);
  }).then(() => restoreWork(loadName));
} else {
  useSource(source);
}
navigator.mediaDevices && listCams();
renderVariant();
loop();
refreshUI();
