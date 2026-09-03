// ═══════════════════════════════════════════════════════════
// 촬영실 — 동작이 조건에 맞으면 카메라가 저절로 찍는다
// ═══════════════════════════════════════════════════════════
// 센스 랩과 다른 점: 여기서는 학습이 목적이 아니라 "찍는 것"이 목적이다.
// 인식 결과는 화면에 숫자로 늘어놓지 않고 셔터 하나로 모인다.
//
//  · 카메라는 항상 필요하다 (사진을 찍어야 하니까).
//    트리거가 '소리' 일 때는 마이크도 같이 켠다.
//  · 판정은 두 갈래다 — 배우지 않아도 되는 내장 신호,
//    그리고 제스처 만들기에서 가르친 내 모델의 종류.
//  · 배경 효과가 켜져 있으면 화면에 보이는 그대로(합성된 캔버스)를 찍는다.

import { loadLandmarker, drawResult, accentColor } from './landmarker.js';
import {
  extract, computeSignals, sigMatch, soundSignals,
  SIG_NEAR_CM, SIG_FAR_CM, dimOf,
} from './features.js';
import { createSoundEngine, preloadSound } from './sound.js';
import { createBgFx } from './bgfx.js';
import { predictProbs } from './trainer.js';
import { Store } from './store.js';
import { Photos } from './photos.js';
import { createShutter } from './shutter.js';

const $ = id => document.getElementById(id);
const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);

// 내 모델로 찍을 때, 이 확률을 넘어야 그 종류로 본다
const MODEL_THRESHOLD = 0.75;
// 화면 스트립에 남겨 두는 최근 사진 수
const STRIP_MAX = 6;

// 트리거로 쓸 만한 내장 신호만 고른다.
// '보여요/안 보여요/조용해요' 는 동작이 아니라 상태라서 뺀다 — 계속 찍힌다.
const TRIGGERS = {
  hand: [
    ['f0', '주먹'], ['f1', '손가락 1개'], ['f2', '브이(손가락 2개)'],
    ['f3', '손가락 3개'], ['f4', '손가락 4개'], ['f5', '손바닥(보)'],
  ],
  face: [
    ['smile', '웃기'], ['mouth', '입 벌리기'],
    ['near', '가까이 오기'], ['far', '멀리 가기'],
    ['left', '왼쪽 보기'], ['right', '오른쪽 보기'],
    ['up', '위 보기'], ['down', '아래 보기'],
  ],
  pose: [['up1', '한 손 들기'], ['up2', '두 손 들기']],
  sound: [['clap', '박수'], ['whistle', '휘파람'], ['speech', '말소리'], ['sound', '아무 소리']],
};

let source = 'hand';
let lm = null, lmLoading = false;
let stream = null;
let lastResult = null;
let bg = null;
const snd = createSoundEngine();
const isSound = () => source === 'sound';

// 지금 고른 트리거: { kind:'builtin', token, label } | { kind:'model', name, idx, label, meta }
let trig = null;
let trigOptions = [];
let modelCache = {};          // name → { model, meta }
let activeModel = null;
let lastProbs = null;

// 스트립(방금 찍은 사진) — objectURL 은 반드시 되돌려준다
let strip = [];

// ── 알림 ──
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// ═══ 셔터 ═══
const shutter = createShutter({
  holdMs: 800,
  countdownSec: 0,
  burst: 1,
  cooldownMs: 1500,
  onFire: fire,
  onState: renderGauge,
});

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
      try { await getLm(s); } catch (e) { /* 무시 — 누를 때 다시 시도한다 */ }
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
  } catch (e) {
    console.error(e);
    $('engine').textContent = T('불러오지 못했어요');
    toast(T('AI를 불러오지 못했어요. 새로고침해 주세요'));
  }
  setSrcSpin(next, false);
  lmLoading = false;
  renderSrc();
  await buildTriggers();
  applySrcUI();
  preloadRest();
}

async function pickSource(next) {
  if (next === source || lmLoading) return;
  shutter.cancel();
  // 소리 트리거는 마이크를 함께 쓴다. 소스를 벗어나면 마이크는 끈다.
  if (next !== 'sound') micStop();
  await useSource(next);
  if (isSound()) micOn();
}

function renderSrc() {
  document.querySelectorAll('.srcpick .db').forEach(b => {
    b.classList.toggle('on', b.dataset.src === source);
  });
}

function applySrcUI() {
  $('privNote').textContent = isSound()
    ? T('찍은 사진과 들리는 소리는 이 컴퓨터 밖으로 나가지 않아요')
    : T('찍은 사진은 이 컴퓨터 밖으로 나가지 않아요');
  // 소리 트리거일 때는 뼈대가 없다
  $('skelChk').disabled = isSound();
  const cv = $('ovCv');
  const ctx = cv.getContext('2d');
  ctx && ctx.clearRect(0, 0, cv.width, cv.height);
  refreshUI();
}

// ═══ 트리거 목록 ═══
async function buildTriggers() {
  const sel = $('trigSel');
  const keep = trig && trig.kind === 'model' ? 'm:' + trig.name + ':' + trig.idx
    : (trig ? 'b:' + trig.token : null);

  trigOptions = [];
  sel.innerHTML = '';

  const g1 = document.createElement('optgroup');
  g1.label = T('배우지 않아도 되는 동작');
  (TRIGGERS[source] || []).forEach(([token, ko]) => {
    const o = document.createElement('option');
    o.value = String(trigOptions.length);
    o.textContent = T(ko);
    trigOptions.push({ kind: 'builtin', token, label: T(ko), key: 'b:' + token });
    g1.appendChild(o);
  });
  sel.appendChild(g1);

  let models = [];
  try { models = await Store.listBySource(source); } catch (e) { models = []; }
  if (models.length) {
    const g2 = document.createElement('optgroup');
    g2.label = T('내가 가르친 제스처');
    models.forEach(m => {
      (m.classes || []).forEach((cn, i) => {
        const o = document.createElement('option');
        o.value = String(trigOptions.length);
        o.textContent = cn + '  (' + m.name + ')';
        trigOptions.push({
          kind: 'model', name: m.name, idx: i, meta: m,
          label: cn, key: 'm:' + m.name + ':' + i,
        });
        g2.appendChild(o);
      });
    });
    sel.appendChild(g2);
  }
  $('noModelHint').style.display = models.length ? 'none' : '';

  // 소스를 바꾸기 전에 고르던 것이 그대로 있으면 유지한다
  let pick = trigOptions.findIndex(o => o.key === keep);
  if (pick < 0) pick = 0;
  sel.value = String(pick);
  await selectTrigger(pick);
}

async function selectTrigger(i) {
  const o = trigOptions[i];
  if (!o) { trig = null; return; }
  trig = o;
  lastProbs = null;

  if (o.kind === 'model') {
    $('trigHint').textContent = T('내가 가르친 제스처예요') + ' — ' + o.name;
    try {
      activeModel = await loadModel(o.name);
    } catch (e) {
      console.error(e);
      activeModel = null;
      toast(T('제스처를 불러오지 못했어요'));
    }
  } else {
    activeModel = null;
    $('trigHint').textContent = T('배우지 않아도 되는 동작이에요.');
  }
  $('armTxt').textContent = o.label;
  shutter.cancel();
  refreshUI();
}

async function loadModel(name) {
  if (modelCache[name]) return modelCache[name];
  const rec = await Store.load(name);
  if (!rec) throw new Error('missing');
  modelCache[name] = rec;
  return rec;
}

// ═══ 카메라 ═══
async function listCams() {
  const sel = $('camSel');
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    const cur = sel.value;
    sel.innerHTML = '';
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      const full = d.label || (T('카메라') + ' ' + (i + 1));
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
    const want = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if ($('camSel').value) want.deviceId = { exact: $('camSel').value };
    stream = await navigator.mediaDevices.getUserMedia({ video: want, audio: false });
    $('camVid').srcObject = stream;
    await $('camVid').play();
    syncAspect();
    $('camVid').addEventListener('loadedmetadata', syncAspect);
    $('camOff').style.display = 'none';
    setCamBtn(true);
    await listCams();
    if (isSound()) micOn();
    refreshUI();
    return true;
  } catch (e) {
    toast(T('카메라가 안 보여요. 연결을 확인해 주세요'));
    return false;
  }
}

function camStop() {
  shutter.cancel();
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('camVid').srcObject = null;
  $('camOff').style.display = '';
  setCamBtn(false);
  lastResult = null;
  refreshUI();
}

function setCamBtn(on) {
  $('camBtn').innerHTML = '<i class="fa-solid ' + (on ? 'fa-video-slash' : 'fa-video') + '"></i> ' +
    (on ? T('카메라 끄기') : T('카메라 켜기'));
}

function camReady() { return !!(stream && $('camVid').videoWidth); }

function syncAspect() {
  const v = $('camVid');
  if (v.videoWidth) $('camBox').style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
}

// ── 마이크 (소리 트리거일 때만) ──
async function micOn() {
  if (snd.running) return true;
  try {
    await snd.start();
    refreshUI();
    return true;
  } catch (e) {
    console.error(e);
    toast(T('마이크가 안 보여요. 연결을 확인해 주세요'));
    return false;
  }
}

function micStop() {
  if (snd.running) snd.stop();
}

// ═══ 감지 루프 ═══
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  if (!camReady()) { renderLive(null); return; }

  bg && bg.tick(now);

  const video = $('camVid');
  let matched = false;

  if (isSound()) {
    clearOverlay();
    const latest = snd.latest;
    if (latest) {
      const sig = soundSignals(latest.vec, latest.level);
      if (trig && trig.kind === 'builtin') {
        matched = sigMatch('sound', trig.token, sig);
      } else if (trig && trig.kind === 'model' && activeModel) {
        matched = modelMatch(latest.vec);
      }
      renderLive({ kind: 'sound', sig, top: latest.top });
    } else {
      renderLive({ kind: 'sound', sig: null });
    }
  } else if (lm) {
    let result = null;
    try { result = lm.detect(video, now); } catch (e) { result = null; }
    lastResult = result;

    const variant = trig && trig.kind === 'model' ? (trig.meta.variant || null) : null;
    drawOverlay(result, variant);

    const sig = computeSignals(source, result, video.videoWidth, video.videoHeight);
    if (trig && trig.kind === 'builtin') {
      matched = sigMatch(source, trig.token, sig);
    } else if (trig && trig.kind === 'model' && activeModel) {
      const vec = extract(source, result, trig.meta.variant || null);
      matched = vec ? modelMatch(vec) : false;
    }
    renderLive({ kind: source, sig, result });
  }

  renderGauge(shutter.tick(now, matched, trig ? trig.label : ''));
}

// 내 모델 판정 — 고른 종류의 확률이 기준을 넘으면 맞은 것으로 본다
function modelMatch(vec) {
  if (!activeModel || !trig || trig.kind !== 'model') return false;
  const dim = trig.meta.featureDim || dimOf(source, trig.meta.variant);
  if (vec.length !== dim) return false;      // 갈래가 다른 벡터가 오면 넣지 않는다
  let probs = null;
  try { probs = predictProbs(activeModel.model, vec); } catch (e) { return false; }
  lastProbs = probs;
  return (probs[trig.idx] || 0) >= MODEL_THRESHOLD;
}

function clearOverlay() {
  const cv = $('ovCv');
  const ctx = cv.getContext('2d');
  ctx && ctx.clearRect(0, 0, cv.width, cv.height);
}

function drawOverlay(result, variant) {
  const video = $('camVid');
  const cv = $('ovCv');
  if (cv.width !== video.videoWidth || cv.height !== video.videoHeight) {
    cv.width = video.videoWidth;
    cv.height = video.videoHeight;
    syncAspect();
  }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!result) return;
  const vec = extract(source, result, variant);
  if (vec) drawResult(ctx, source, result, variant);
}

// ═══ 지금 보이는 것 ═══
function renderLive(state) {
  const box = $('liveNow');
  if (!camReady()) {
    box.textContent = T('카메라를 켜 주세요');
    box.className = 'answer idk';
    return;
  }
  const txt = describe(state);
  box.textContent = txt.text;
  box.className = 'answer' + (txt.on ? ' sure' : ' idk');
}

function describe(state) {
  if (!state) return { text: T('보고 있어요…'), on: false };

  if (state.kind === 'sound') {
    if (!snd.running) return { text: T('마이크를 켜는 중이에요'), on: false };
    const s = state.sig;
    if (!s) return { text: T('소리를 듣는 중이에요'), on: false };
    if (trig && trig.kind === 'model' && lastProbs) return modelText();
    const on = [];
    if (s.clap) on.push(T('박수'));
    if (s.whistle) on.push(T('휘파람'));
    if (s.speech) on.push(T('말소리'));
    if (on.length) return { text: on.join(' · '), on: true };
    return { text: s.quiet ? T('조용해요') : T('소리가 나요'), on: !s.quiet };
  }

  const s = state.sig;
  if (!s || !s.shown) {
    const miss = { hand: '손이 안 보여요', face: '얼굴이 안 보여요', pose: '몸이 안 보여요' };
    return { text: T(miss[state.kind] || '안 보여요'), on: false };
  }
  if (trig && trig.kind === 'model' && lastProbs) return modelText();

  if (state.kind === 'hand') {
    const n = s.fingers;
    const name = n === 0 ? T('주먹') : n === 5 ? T('손바닥(보)') : T('손가락 N개').replace('N', n);
    return { text: name, on: true };
  }
  if (state.kind === 'face') {
    const p = [];
    if (s.smile) p.push(T('웃는 중'));
    if (s.mouth) p.push(T('입 벌림'));
    if (s.distCm != null) {
      p.push(s.distCm <= SIG_NEAR_CM ? T('가까이')
        : s.distCm >= SIG_FAR_CM ? T('멀리')
        : T('약 Ncm').replace('N', s.distCm));
    }
    if (s.yaw === 'left') p.push(T('왼쪽 보기'));
    else if (s.yaw === 'right') p.push(T('오른쪽 보기'));
    if (s.pitch === 'up') p.push(T('위 보기'));
    else if (s.pitch === 'down') p.push(T('아래 보기'));
    return { text: p.join(' · ') || T('얼굴이 보여요'), on: true };
  }
  if (state.kind === 'pose') {
    const n = s.handsUp;
    return {
      text: n >= 2 ? T('두 손 들기') : n === 1 ? T('한 손 들기') : T('몸이 보여요'),
      on: true,
    };
  }
  return { text: T('보고 있어요…'), on: false };
}

function modelText() {
  if (!lastProbs || !trig || trig.kind !== 'model') return { text: T('보고 있어요…'), on: false };
  const names = (trig.meta.classes || []);
  let best = 0;
  for (let i = 1; i < lastProbs.length; i++) if (lastProbs[i] > lastProbs[best]) best = i;
  const p = lastProbs[best] || 0;
  if (p < MODEL_THRESHOLD) return { text: T('아직 모르겠어요'), on: false };
  return { text: (names[best] || '?') + ' ' + Math.round(p * 100) + '%', on: true };
}

// ═══ 게이지 / 카운트다운 ═══
function renderGauge(st) {
  const fill = $('gaugeFill'), label = $('gaugeLabel'), pct = $('gaugePct');
  const cd = $('cdown');
  const wrap = $('gaugeWrap');

  wrap.classList.toggle('armed', st.state === 'hold' || st.state === 'count');
  wrap.classList.toggle('firing', st.state === 'shoot');

  if (st.state === 'count') {
    cd.textContent = String(st.countLeft);
    cd.classList.add('on');
  } else {
    cd.classList.remove('on');
  }

  if (st.state === 'hold') {
    fill.style.width = Math.round(st.progress * 100) + '%';
    label.textContent = T('찰칵까지');
    pct.textContent = Math.round(st.progress * 100) + '%';
  } else if (st.state === 'count') {
    fill.style.width = '100%';
    label.textContent = T('곧 찍어요');
    pct.textContent = st.countLeft + T('초');
  } else if (st.state === 'shoot') {
    fill.style.width = '100%';
    label.textContent = T('찰칵!');
    pct.textContent = '';
  } else if (st.state === 'cool') {
    fill.style.width = '0%';
    label.textContent = T('잠깐 쉬는 중');
    pct.textContent = '';
  } else {
    fill.style.width = '0%';
    label.textContent = camReady() ? T('동작을 기다리는 중') : T('카메라를 켜 주세요');
    pct.textContent = '';
  }
}

// ═══ 촬영 ═══
let actx = null;
function beep() {
  if (!$('beepChk').checked) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(1400, actx.currentTime);
    o.frequency.exponentialRampToValueAtTime(600, actx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.22, actx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.1);
    o.connect(g); g.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + 0.11);
  } catch (e) { /* 소리는 없어도 그만 */ }
}

function flash() {
  const f = $('flash');
  f.classList.remove('on');
  void f.offsetWidth;          // 애니메이션 다시 시작
  f.classList.add('on');
}

async function fire(idx, total) {
  const v = $('camVid');
  const w = v.videoWidth, h = v.videoHeight;
  if (!w || !h) return;

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  // 화면과 같은 거울 방향으로 저장한다 (미리보기는 CSS scaleX(-1))
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  if (bg && bg.mode !== 'off') ctx.drawImage($('bgCv'), 0, 0, w, h);
  else ctx.drawImage(v, 0, 0, w, h);
  if ($('skelChk').checked && !isSound()) ctx.drawImage($('ovCv'), 0, 0, w, h);

  flash();
  beep();

  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) { toast(T('사진을 만들지 못했어요')); return; }

  try {
    const rec = await Photos.add(blob, {
      w, h,
      trigger: trig ? trig.label : '',
      effect: bg ? bg.mode : 'off',
    });
    pushStrip(rec);
    if (total > 1) toast(T('찰칵! N장 중 M장').replace('N', total).replace('M', idx + 1));
  } catch (e) {
    console.error(e);
    toast(T('사진을 저장하지 못했어요'));
  }
}

function pushStrip(rec) {
  const url = URL.createObjectURL(rec.blob);
  strip.unshift({ id: rec.id, url });
  while (strip.length > STRIP_MAX) {
    const old = strip.pop();
    URL.revokeObjectURL(old.url);
  }
  renderStrip();
}

function renderStrip() {
  const box = $('strip');
  box.innerHTML = '';
  strip.forEach(s => {
    const a = document.createElement('a');
    a.href = 'gallery.html#' + encodeURIComponent(s.id);
    a.title = T('갤러리에서 보기');
    const im = document.createElement('img');
    im.src = s.url;
    im.alt = '';
    a.appendChild(im);
    box.appendChild(a);
  });
  $('stripHint').style.display = strip.length ? 'none' : '';
}

// ═══ 버튼 상태 ═══
function refreshUI() {
  const ready = camReady() && (isSound() ? true : !!lm) && !!trig;
  $('shotBtn').disabled = !camReady();
  const armed = $('armBadge');
  armed.classList.toggle('on', ready);
  $('armTxt').textContent = trig ? trig.label : T('준비');
}

// ═══ 이벤트 ═══
document.querySelectorAll('.srcpick .db').forEach(b => {
  b.addEventListener('click', () => pickSource(b.dataset.src));
});

$('trigSel').addEventListener('change', e => selectTrigger(Number(e.target.value)));

$('holdSlider').addEventListener('input', e => {
  const ms = Number(e.target.value) * 100;
  shutter.set('holdMs', ms);
  $('holdVal').textContent = (ms / 1000).toFixed(1) + T('초');
});

$('cdSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  $('cdSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  shutter.set('countdownSec', Number(b.dataset.cd));
});

$('burstSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  $('burstSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  shutter.set('burst', Number(b.dataset.burst));
});

$('camBtn').addEventListener('click', () => (stream ? camStop() : camOn()));
$('camSel').addEventListener('change', () => { if (stream) { camStop(); camOn(); } });
$('shotBtn').addEventListener('click', () => {
  if (!camReady()) return;
  shutter.manual(performance.now());
});
$('bgSel').addEventListener('change', e => bg && bg.setMode(e.target.value));

// 다른 탭에서 제스처를 만들고 돌아오면 목록을 새로 읽는다
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) buildTriggers();
});

window.addEventListener('pagehide', () => {
  strip.forEach(s => URL.revokeObjectURL(s.url));
  micStop();
});

// ═══ 시작 ═══
bg = createBgFx($('camVid'), $('bgCv'));
setCamBtn(false);
navigator.mediaDevices && listCams();
useSource(source);
loop();
refreshUI();
