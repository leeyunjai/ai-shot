// ═══════════════════════════════════════════════════════════
// 시험실 — 시험하기 / 순서 놀이
// ═══════════════════════════════════════════════════════════
// 하나의 정신 모델: 왼쪽에서 소스마다 [안 봐요 / 그냥 보기 / 내 모델] 을 고른다.
//  · 그냥 보기 = 학습 없이 내장 신호를 본다 (손가락 개수·거리·손 들기…)
//  · 내 모델   = 배운 종류로 답한다 (확신도 미만이면 "모르겠어요")
//  · 규칙표·순서도는 켠 소스만 조건으로 쓴다
//  · 랜드마커는 라운드로빈으로 프레임마다 하나씩만 돌린다
//  · 모델은 절대 합치지 않는다 — 소스별 독립 모델 + 규칙표 조합

import { loadLandmarker, drawResult } from './landmarker.js';
import { extract, computeSignals, sigMatch, soundSignals, BUILTIN_SIGS } from './features.js';
import { createSoundEngine } from './sound.js';
import { createBgFx } from './bgfx.js';
import { predictProbs } from './trainer.js';
import { Store } from './store.js';

const $ = id => document.getElementById(id);
const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);
const SRC_KO = { hand: '손', face: '얼굴', pose: '포즈', sound: '소리' };
const VISION = ['hand', 'face', 'pose'];              // 카메라를 쓰는 소스
const SOURCES = ['hand', 'face', 'pose', 'sound'];
const COND_SOURCES = SOURCES;   // 볼 수 있는 소스 = 배울 수 있는 소스
const WATCH = '@watch';       // srcSel 값: 그냥 보기

let mode = null;              // 'test' | 'seq'
let allMeta = [];
let threshold = 0.7;
// 소스마다 무엇을 볼지: '' 안 봐요 / '@watch' 그냥 보기 / 모델 이름
const srcSel = { hand: WATCH, face: '', pose: '', sound: '' };

// 소스별 상태
let slots = { hand: null, face: null, pose: null, sound: null };   // { name, model, meta }
const lms = { hand: null, face: null, pose: null };
const lmPending = { hand: null, face: null, pose: null };
const results = { hand: null, face: null, pose: null, sound: null }; // { state, label, prob, probs }
const lastRaw = { hand: null, face: null, pose: null };
const sigStates = { hand: null, face: null, pose: null, sound: null };

// 소리는 카메라와 따로 돈다 — 소리 소스를 켜면 마이크가 켜진다
const snd = createSoundEngine();
snd.onTick = latest => {
  sigStates.sound = soundSignals(latest.vec, latest.level);
  if (slots.sound) results.sound = classify('sound', latest.vec);
};

let stream = null;
let rr = 0;
let lastUi = 0;
let rules = [];               // { name, op:'AND'|'OR', conds:{hand,face,pose} }

// ── 순서 놀이 상태 ──
// 동작을 잠깐 유지해야 통과 — 스친 동작과 일부러 만든 동작을 구분한다.
const SEQ_HOLD_MS = 800;
const SEQ_COOLDOWN = 700;
const SEQ_MAX = 8;
let seqSteps = [];            // [{ src, cls }]  cls 는 'c:종류이름' 또는 's:신호토큰'
let seqPos = 0, seqHold = 0, seqCool = 0, seqDone = false, seqLastTick = 0;

// ── 상태 저장 (새로고침해도 이어진다) ──
const EXAM_KEY = 'senselab-exam';
let restoring = false;
let lastSavedStr = '', lastSaveAt = 0;

function saveExam() {
  if (restoring) return;
  try {
    const str = JSON.stringify({
      v: 2, mode, threshold, srcSel,
      bg: (typeof bgfx !== 'undefined') ? bgfx.mode : 'off',
      rules, seqSteps,
    });
    if (str === lastSavedStr) return;
    lastSavedStr = str;
    localStorage.setItem(EXAM_KEY, str);
  } catch (e) { /* 무시 */ }
}

async function restoreExam() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(EXAM_KEY) || 'null'); } catch (e) {}
  if (!s) return;
  restoring = true;
  try {
    if (s.threshold >= 0.3 && s.threshold <= 0.95) {
      threshold = s.threshold;
      $('thrSlider').value = Math.round(threshold * 100);
      $('thrVal').textContent = Math.round(threshold * 100) + '%';
    }
    await setMode(s.mode === 'seq' ? 'seq' : 'test');

    // 소스 선택 복원 (v2). 이전 저장 형식(모드 4개)은 최선으로 옮긴다.
    const sel = s.srcSel || {};
    if (s.v !== 2) {
      COND_SOURCES.forEach(src => { sel[src] = (s.watched && s.watched[src]) ? WATCH : ''; });
      if (s.slots) SOURCES.forEach(src => { if (s.slots[src]) sel[src] = s.slots[src]; });
    }
    for (const src of COND_SOURCES) {
      const v = typeof sel[src] === 'string' ? sel[src] : '';
      if (v && v !== WATCH) {
        if (allMeta.some(m => m.name === v && m.source === src)) await setSrc(src, v);
        else await setSrc(src, '');
      } else await setSrc(src, v);
    }

    rules = Array.isArray(s.rules) ? s.rules.map(r => ({
      name: typeof r.name === 'string' ? r.name : '',
      op: r.op === 'OR' ? 'OR' : 'AND',
      conds: Object.fromEntries(COND_SOURCES.map(src =>
        [src, (r.conds && typeof r.conds[src] === 'string') ? r.conds[src] : ''])),
    })) : [];
    seqSteps = Array.isArray(s.seqSteps)
      ? s.seqSteps.filter(x => x && COND_SOURCES.includes(x.src) && typeof x.cls === 'string').slice(0, SEQ_MAX)
      : [];
    sanitizeConds();
    if (typeof s.bg === 'string' && $('bgSel').querySelector('[value="' + s.bg + '"]')) {
      $('bgSel').value = s.bg;
      bgfx.setMode(s.bg);
    }
    refreshAll();
  } catch (e) { console.error(e); }
  restoring = false;
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

// ── 랜드마커 관리 (안 쓰면 close 로 정리) ──
function ensureLm(src) {
  if (lms[src]) return Promise.resolve(lms[src]);
  if (lmPending[src]) return lmPending[src];
  $('engine').textContent = T('준비 중…');
  lmPending[src] = loadLandmarker(src).then(l => {
    lms[src] = l; lmPending[src] = null;
    $('engine').textContent = T('준비 완료');
    return l;
  }).catch(e => {
    lmPending[src] = null;
    $('engine').textContent = T('불러오지 못했어요');
    console.error(e);
  });
  return lmPending[src];
}

function releaseExcept(keep) {
  VISION.forEach(src => {
    if (!keep.includes(src) && lms[src]) {
      lms[src].close();
      lms[src] = null;
      results[src] = null;
      lastRaw[src] = null;
    }
  });
}

// 켠 소스들 (안 봐요가 아닌 것) — 감지 대상이자 조건으로 쓸 수 있는 것
function detectSources() {
  return COND_SOURCES.filter(src => srcSel[src] !== '');
}

// 모델이 골라진 소스들
function modelSources() {
  return SOURCES.filter(src => slots[src]);
}

function syncLms() {
  const det = detectSources();
  det.filter(s => s !== 'sound').forEach(src => ensureLm(src));
  releaseExcept(det);
  COND_SOURCES.forEach(src => { if (!det.includes(src)) sigStates[src] = null; });
  syncSound(det.includes('sound'));
}

function syncSound(on) {
  if (on && !snd.running) {
    snd.start().catch(e => {
      console.error(e);
      toast(T('마이크가 안 보여요. 연결을 확인해 주세요'));
    });
  } else if (!on && snd.running) {
    snd.stop();
    results.sound = null;
    sigStates.sound = null;
  }
}

// 소스별 입력 준비 상태 (비전 = 카메라, 소리 = 마이크)
function srcReady(src) {
  return src === 'sound' ? snd.running : camReady();
}

// 켠 소스 전부의 입력이 준비됐는가 · 안 됐으면 무엇을 켜라고 할까
function inputsGate() {
  const det = detectSources();
  if (det.some(s => s !== 'sound') && !camReady()) return T('카메라를 켜 주세요');
  if (det.includes('sound') && !snd.running) return T('마이크를 확인해 주세요');
  return null;
}

// ── 소스 선택 ──
async function setSrc(src, value) {
  srcSel[src] = value;
  // 모델 슬롯 정리/로드
  if (slots[src]) { slots[src].model.dispose(); slots[src] = null; }
  results[src] = null;
  if (value && value !== WATCH) {
    try {
      const rec = await Store.load(value);
      if (rec && rec.meta.source === src) {
        slots[src] = { name: value, model: rec.model, meta: rec.meta };
      } else {
        if (rec) rec.model.dispose();
        srcSel[src] = '';
      }
    } catch (e) {
      console.error(e);
      srcSel[src] = '';
      toast(T('모델을 불러오지 못했어요'));
    }
  }
  syncLms();
}

// 왼쪽 셀렉트: 안 봐요 / 그냥 보기 / 내 모델들
function renderSrcSelects() {
  const ids = { hand: 'selHand', face: 'selFace', pose: 'selPose', sound: 'selSound' };
  COND_SOURCES.forEach(src => {
    const sel = $(ids[src]);
    sel.innerHTML = '';
    [['', T('안 봐요')], [WATCH, T('그냥 보기')]].forEach(([v, txt]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = txt;
      sel.appendChild(o);
    });
    const mine = allMeta.filter(m => m.source === src);
    if (mine.length) {
      const g = document.createElement('optgroup');
      g.label = T('내 모델');
      mine.forEach(m => {
        const o = document.createElement('option');
        o.value = m.name; o.textContent = m.name;
        g.appendChild(o);
      });
      sel.appendChild(g);
    }
    sel.value = srcSel[src];
    if (sel.value !== srcSel[src]) { srcSel[src] = ''; sel.value = ''; }
  });
  $('mdlEmpty').style.display = allMeta.length ? 'none' : '';
}

// ── 카메라 ──
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
  if (stream) return;
  try {
    const want = { width: { ideal: 640 }, height: { ideal: 480 } };
    if ($('camSel').value) want.deviceId = { exact: $('camSel').value };
    stream = await navigator.mediaDevices.getUserMedia({ video: want, audio: false });
    $('camVid').srcObject = stream;
    await $('camVid').play();
    syncAspect();
    $('camVid').addEventListener('loadedmetadata', syncAspect);
    $('camOff').style.display = 'none';
    $('camBtn').innerHTML = '<i class="fa-solid fa-video-slash"></i> ' + T('카메라 끄기');
    await listCams();
  } catch (e) {
    toast(T('카메라가 안 보여요. 연결을 확인해 주세요'));
  }
}

function camStop() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('camVid').srcObject = null;
  $('camOff').style.display = '';
  $('camBtn').innerHTML = '<i class="fa-solid fa-video"></i> ' + T('카메라 켜기');
  VISION.forEach(s => { results[s] = null; lastRaw[s] = null; sigStates[s] = null; });
}

function camReady() { return !!(stream && $('camVid').videoWidth); }

// 카메라 박스를 실제 영상 비율에 맞춘다 (폰 카메라 비율 대응)
function syncAspect() {
  const v = $('camVid');
  if (v.videoWidth) $('camBox').style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
}

// 내장 신호 상태를 화면 문구로 (소스별)
function sigText(src, s) {
  if (src === 'sound') {
    if (!s || !s.shown) return T('듣는 중');
    if (s.quiet) return T('조용해요');
    const heard = [];
    if (s.clap) heard.push(T('박수'));
    if (s.whistle) heard.push(T('휘파람'));
    if (s.speech) heard.push(T('말소리'));
    return heard.length ? heard.join(' · ') : T('소리 나요');
  }
  if (!s || !s.shown) return T('안 보여요');
  const parts = [];
  if (src === 'hand') {
    parts.push(T('손가락 N개').replace('N', s.fingers));
  } else if (src === 'face') {
    if (s.distCm != null) parts.push(T('약 Ncm').replace('N', s.distCm));
    if (s.yaw === 'left') parts.push(T('왼쪽 보기'));
    else if (s.yaw === 'right') parts.push(T('오른쪽 보기'));
    if (s.pitch === 'up') parts.push(T('위 보기'));
    else if (s.pitch === 'down') parts.push(T('아래 보기'));
    if (s.mouth) parts.push(T('입 벌리기'));
    if (s.smile) parts.push(T('웃기'));
  } else if (src === 'pose') {
    if (s.handsUp >= 2) parts.push(T('두 손 들기'));
    else if (s.handsUp >= 1) parts.push(T('한 손 들기'));
  }
  return parts.length ? parts.join(' · ') : T('보여요');
}

function classify(src, vec) {
  const slot = slots[src];
  if (!slot) return null;
  if (!vec) return { state: 'none' };
  const probs = predictProbs(slot.model, vec);
  let top = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[top]) top = i;
  const prob = probs[top];
  if (prob < threshold) return { state: 'idk', prob, probs };
  return { state: 'ok', label: slot.meta.classes[top], prob, probs };
}

// ── 감지 루프 ──
function loop() {
  requestAnimationFrame(loop);
  // 소리는 여기서 돌리지 않는다 — 마이크 쪽 타이머가 따로 돈다
  const det = detectSources().filter(s => s !== 'sound');
  const now = performance.now();

  if (camReady() && det.length) {
    // 라운드로빈: 이번 프레임에는 랜드마커 하나만 돌린다
    const src = det[rr % det.length];
    rr++;
    const l = lms[src];
    const video = $('camVid');
    if (l) {
      let raw = null;
      try { raw = l.detect(video, now); } catch (e) { /* 무시 */ }
      lastRaw[src] = raw;
      sigStates[src] = computeSignals(src, raw, video.videoWidth, video.videoHeight);
      if (slots[src]) results[src] = classify(src, raw ? extract(src, raw, slots[src].meta.variant) : null);
    }

    // 오버레이 — 각 소스의 마지막 결과를 함께 그린다
    const cv = $('ovCv');
    if (cv.width !== video.videoWidth || cv.height !== video.videoHeight) {
      cv.width = video.videoWidth; cv.height = video.videoHeight;
      syncAspect();
    }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    det.forEach(s => {
      if (lastRaw[s]) drawResult(ctx, s, lastRaw[s], slots[s] ? slots[s].meta.variant : undefined);
    });
  }

  // 배경 놀이 (켜져 있을 때만 동작)
  if (camReady()) bgfx.tick(now);

  if (now - lastUi > 120) { lastUi = now; renderLive(); }
  // 만들던 것을 주기적으로 남긴다 (내용이 바뀌었을 때만 기록)
  if (now - lastSaveAt > 1500) { lastSaveAt = now; saveExam(); }
}

// ── 실시간 표시 ──
function renderLive() {
  if (mode === 'seq') { renderLiveRows($('seqRows')); tickSeq(); }
  else if (mode === 'test') {
    renderLiveRows($('liveRows'));
    const models = modelSources();
    const single = models.length === 1 ? models[0] : null;
    if (single) renderBars(false, single);
    renderTestAnswer(single);
  }
}

// 켠 소스들의 지금 상태 (모델 → 배운 종류 답, 그냥 보기 → 내장 신호)
function renderLiveRows(box) {
  if (!box) return;
  const keys = detectSources();
  if (box.dataset.keys !== keys.join()) {
    box.dataset.keys = keys.join();
    box.innerHTML = '';
    keys.forEach(src => {
      const d = document.createElement('div');
      d.className = 'srcstate'; d.dataset.src = src;
      d.innerHTML = '<span class="sn"></span><span class="sv"></span><span class="sp2"></span>';
      d.querySelector('.sn').textContent = T(SRC_KO[src]);
      box.appendChild(d);
    });
  }
  keys.forEach(src => {
    const d = box.querySelector('[data-src="' + src + '"]');
    if (!d) return;
    const sv = d.querySelector('.sv');
    if (!srcReady(src)) {
      sv.textContent = T(src === 'sound' ? '마이크를 확인해 주세요' : '카메라를 켜 주세요');
      sv.className = 'sv none';
      d.querySelector('.sp2').textContent = '';
      return;
    }
    if (slots[src]) {
      const st = results[src];
      const w = stateWord(st);
      sv.textContent = w.txt;
      sv.className = 'sv' + (w.cls !== 'ok' ? ' ' + w.cls : '');
      d.querySelector('.sp2').textContent = st && st.prob != null ? Math.round(st.prob * 100) + '%' : '';
    } else {
      const s = sigStates[src];
      sv.textContent = sigText(src, s);
      sv.className = 'sv' + (s && s.shown ? '' : ' none');
      d.querySelector('.sp2').textContent = '';
    }
  });
}

function stateWord(st) {
  if (!st) return { txt: T('기다리는 중'), cls: 'none' };
  if (st.state === 'none') return { txt: T('안 보여요'), cls: 'none' };
  if (st.state === 'idk') return { txt: T('모르겠어요'), cls: 'idk' };
  return { txt: st.label, cls: 'ok' };
}

// 큰 답: 규칙이 있으면 규칙의 답, 없고 모델이 1개면 그 모델의 답
function renderTestAnswer(single) {
  const el = $('answer');
  if (rules.length) {
    el.style.display = '';
    evalRules();
    return;
  }
  markFired(-1);
  if (!single) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.classList.remove('sure', 'idk');
  if (!srcReady(single)) {
    el.textContent = T(single === 'sound' ? '마이크를 확인해 주세요' : '카메라를 켜 주세요');
    el.classList.add('idk');
    return;
  }
  const w = stateWord(results[single]);
  el.textContent = w.txt;
  el.classList.add(w.cls === 'ok' ? 'sure' : 'idk');
}

function renderBars(reset, src) {
  const box = $('bars');
  const slot = src ? slots[src] : null;
  if (!slot) { box.innerHTML = ''; return; }
  const labels = slot.meta.classes || [];
  if (reset || box.children.length !== labels.length) {
    box.innerHTML = '';
    labels.forEach(n => {
      const d = document.createElement('div'); d.className = 'bar';
      d.innerHTML = '<div class="bl"><span></span><span></span></div><div class="bt"><div class="bf"></div></div>';
      d.querySelector('.bl span').textContent = n;
      box.appendChild(d);
    });
  }
  const st = results[src];
  const probs = st && st.probs ? st.probs : null;
  let top = -1;
  if (probs) { top = 0; for (let i = 1; i < probs.length; i++) if (probs[i] > probs[top]) top = i; }
  labels.forEach((n, i) => {
    const d = box.children[i];
    if (!d) return;
    const p = probs ? probs[i] : 0;
    d.classList.toggle('top', i === top && st.state === 'ok');
    d.querySelectorAll('.bl span')[1].textContent = Math.round(p * 100) + '%';
    d.querySelector('.bf').style.width = (p * 100) + '%';
  });
}

// ── 규칙표 ──
function newRule() {
  return { name: '', op: 'AND', conds: { hand: '', face: '', pose: '', sound: '' } };
}

// 소스 하나가 조건으로 고를 수 있는 것: 배운 종류('c:') + 내장 신호('s:')
function condOptions(src) {
  const learned = slots[src]
    ? (slots[src].meta.classes || []).map(c => ['c:' + c, c])
    : [];
  const sigs = BUILTIN_SIGS[src].map(([v, ko]) => ['s:' + v, T(ko)]);
  return { learned, sigs };
}

// 꺼진 소스·사라진 모델의 종류를 조건에서 지운다
function sanitizeConds() {
  const ok = (src, v) => {
    if (srcSel[src] === '') return false;
    if (!v.startsWith('c:')) return true;
    const cls = slots[src] ? (slots[src].meta.classes || []) : [];
    return cls.includes(v.slice(2));
  };
  rules.forEach(r => COND_SOURCES.forEach(src => {
    if (r.conds[src] && !ok(src, r.conds[src])) r.conds[src] = '';
  }));
  seqSteps = seqSteps.filter(s => ok(s.src, s.cls));
}

function renderRules() {
  const box = $('ruleList');
  box.innerHTML = '';
  const active = detectSources();
  rules.forEach((rule, ri) => {
    const el = document.createElement('div');
    el.className = 'rule'; el.dataset.ri = ri;

    const rtop = document.createElement('div'); rtop.className = 'rtop';
    const nameInp = document.createElement('input');
    nameInp.className = 'inp'; nameInp.maxLength = 20;
    nameInp.placeholder = T('동작 이름 (예: 인사)');
    nameInp.value = rule.name;
    nameInp.addEventListener('input', () => { rule.name = nameInp.value; });
    const del = document.createElement('button');
    del.className = 'del'; del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.title = T('지우기');
    del.addEventListener('click', () => { rules.splice(ri, 1); renderRules(); });
    rtop.appendChild(nameInp); rtop.appendChild(del);
    el.appendChild(rtop);

    const conds = document.createElement('div'); conds.className = 'conds';
    active.forEach(src => {
      const rc = document.createElement('div'); rc.className = 'rcond';
      const sn = document.createElement('span'); sn.className = 'sn';
      sn.textContent = T(SRC_KO[src]);
      const sel = document.createElement('select'); sel.className = 'inp';

      const none = document.createElement('option');
      none.value = ''; none.textContent = T('상관없어요');
      sel.appendChild(none);
      const { learned, sigs } = condOptions(src);
      const addGroup = (label, items) => {
        if (!items.length) return;
        const g = document.createElement('optgroup');
        g.label = label;
        items.forEach(([v, txt]) => {
          const o = document.createElement('option');
          o.value = v; o.textContent = txt;
          g.appendChild(o);
        });
        sel.appendChild(g);
      };
      addGroup(T('배운 것'), learned);
      addGroup(T('그냥 되는 것'), sigs);

      sel.value = rule.conds[src] || '';
      if (sel.value !== (rule.conds[src] || '')) { rule.conds[src] = ''; sel.value = ''; }
      sel.addEventListener('change', () => { rule.conds[src] = sel.value; });
      rc.appendChild(sn); rc.appendChild(sel);
      conds.appendChild(rc);
    });
    if (!active.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.style.margin = '0';
      empty.textContent = T('먼저 왼쪽에서 볼 것을 골라 주세요');
      conds.appendChild(empty);
    }
    el.appendChild(conds);

    const op = document.createElement('div'); op.className = 'op';
    const lb = document.createElement('span'); lb.className = 'lb2';
    lb.textContent = T('묶는 방법');
    op.appendChild(lb);
    [['AND', T('모두 맞으면')], ['OR', T('하나만 맞아도')]].forEach(([v, txt]) => {
      const b = document.createElement('button');
      b.textContent = txt;
      b.classList.toggle('on', rule.op === v);
      b.addEventListener('click', () => {
        rule.op = v;
        op.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
      op.appendChild(b);
    });
    el.appendChild(op);

    box.appendChild(el);
  });
}

function condMatch(src, want) {
  if (want.startsWith('s:')) return sigMatch(src, want.slice(2), sigStates[src]);
  if (want.startsWith('c:')) {
    const st = results[src];
    return !!st && st.state === 'ok' && st.label === want.slice(2);
  }
  return false;
}

function evalRules() {
  const el = $('answer');
  el.classList.remove('sure', 'idk');
  if (!detectSources().length) { el.textContent = T('무엇을 볼지 골라 주세요'); el.classList.add('idk'); markFired(-1); return; }
  const gate = inputsGate();
  if (gate) { el.textContent = gate; el.classList.add('idk'); markFired(-1); return; }

  let fired = -1;
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const conds = COND_SOURCES.filter(src => r.conds[src] !== '');
    if (!conds.length) continue;
    const ok = r.op === 'OR'
      ? conds.some(src => condMatch(src, r.conds[src]))
      : conds.every(src => condMatch(src, r.conds[src]));
    if (ok) { fired = i; break; }
  }
  if (fired >= 0) {
    el.textContent = rules[fired].name || T('이름 없는 동작');
    el.classList.add('sure');
  } else {
    el.textContent = T('맞는 규칙이 없어요');
    el.classList.add('idk');
  }
  markFired(fired);
}

function markFired(ri) {
  document.querySelectorAll('#ruleList .rule').forEach(el => {
    el.classList.toggle('fired', Number(el.dataset.ri) === ri);
  });
}

// ── 순서 놀이 ──
function seqRun(clearSteps) {
  seqPos = 0; seqHold = 0; seqCool = 0; seqDone = false; seqLastTick = 0;
  if (clearSteps) seqSteps = [];
}

// 단계 조건: 켠 소스들의 [배운 종류] + [내장 신호]
function seqOptions() {
  const opts = [];
  detectSources().forEach(src => {
    const { learned, sigs } = condOptions(src);
    learned.forEach(([v, txt]) => opts.push([src + '|' + v, T(SRC_KO[src]) + ': ' + txt]));
    sigs.forEach(([v, txt]) => opts.push([src + '|' + v, T(SRC_KO[src]) + ': ' + txt]));
  });
  return opts;
}

function seqCondMet(step) {
  return condMatch(step.src, step.cls);
}

function renderSeqFlow() {
  const box = $('seqFlow');
  box.innerHTML = '';
  const opts = seqOptions();

  const start = document.createElement('div');
  start.className = 'seq-node';
  start.textContent = T('시작');
  box.appendChild(start);

  seqSteps.forEach((step, i) => {
    const arrow = document.createElement('div');
    arrow.className = 'seq-arrow';
    box.appendChild(arrow);

    const el = document.createElement('div');
    el.className = 'seq-step';
    el.dataset.i = i;

    const top = document.createElement('div');
    top.className = 'top';
    const idx = document.createElement('span');
    idx.className = 'sq-idx';
    idx.textContent = i + 1;
    top.appendChild(idx);

    const sel = document.createElement('select');
    sel.className = 'inp';
    opts.forEach(([v, txt]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = txt;
      sel.appendChild(o);
    });
    const applyVal = v => {
      const k = v.indexOf('|');
      step.src = v.slice(0, k); step.cls = v.slice(k + 1);
    };
    const cur = step.src + '|' + step.cls;
    sel.value = opts.some(([v]) => v === cur) ? cur : (opts[0] ? opts[0][0] : '');
    if (sel.value && sel.value !== cur) applyVal(sel.value);
    sel.addEventListener('change', () => {
      applyVal(sel.value);
      seqRun(false);            // 단계를 고치면 처음부터 다시
    });
    top.appendChild(sel);

    const del = document.createElement('button');
    del.className = 'del';
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.title = T('지우기');
    del.addEventListener('click', () => {
      seqSteps.splice(i, 1);
      seqRun(false);
      renderSeqFlow();
    });
    top.appendChild(del);
    el.appendChild(top);

    const track = document.createElement('div');
    track.className = 'sq-track';
    track.innerHTML = '<div class="sq-fill"></div>';
    el.appendChild(track);

    box.appendChild(el);
  });

  const arrow2 = document.createElement('div');
  arrow2.className = 'seq-arrow';
  box.appendChild(arrow2);
  const goal = document.createElement('div');
  goal.className = 'seq-node goal';
  goal.id = 'seqGoal';
  goal.textContent = T('성공!');
  box.appendChild(goal);

  updateSeqFlow();
}

function updateSeqFlow() {
  document.querySelectorAll('#seqFlow .seq-step').forEach(el => {
    const i = Number(el.dataset.i);
    el.classList.toggle('done', seqDone || i < seqPos);
    el.classList.toggle('cur', !seqDone && i === seqPos);
    const fill = el.querySelector('.sq-fill');
    if (fill) {
      const w = (seqDone || i < seqPos) ? 100 : (i === seqPos ? Math.round(seqHold / SEQ_HOLD_MS * 100) : 0);
      fill.style.width = w + '%';
    }
  });
  const goal = $('seqGoal');
  if (goal) goal.classList.toggle('done', seqDone);
}

function tickSeq() {
  const el = $('answer');
  el.style.display = '';
  el.classList.remove('sure', 'idk');
  const now = performance.now();
  const dt = seqLastTick ? Math.min(400, now - seqLastTick) : 0;
  seqLastTick = now;

  let msg = null, sure = false;
  const gate = inputsGate();
  if (!detectSources().length) msg = T('무엇을 볼지 골라 주세요');
  else if (!seqSteps.length) msg = T('단계를 더해 보세요');
  else if (seqDone) { msg = T('성공! 참 잘했어요'); sure = true; }
  else if (gate) msg = gate;
  else {
    const step = seqSteps[seqPos];
    if (now >= seqCool && seqCondMet(step)) {
      seqHold += dt;
      if (seqHold >= SEQ_HOLD_MS) {
        seqHold = 0; seqPos++; seqCool = now + SEQ_COOLDOWN;
        if (seqPos >= seqSteps.length) { seqDone = true; toast(T('성공! 참 잘했어요')); }
      }
    } else {
      seqHold = Math.max(0, seqHold - dt * 2);   // 벗어나면 서서히 줄어든다
    }
    if (seqDone) { msg = T('성공! 참 잘했어요'); sure = true; }
    else msg = T('N번 동작을 해 보세요').replace('N', seqPos + 1);
  }
  el.textContent = msg;
  el.classList.add(sure ? 'sure' : 'idk');
  updateSeqFlow();
}

// ── 화면 갱신 (소스 선택·모드가 바뀔 때) ──
function refreshAll() {
  renderSrcSelects();
  $('thrBox').style.display = modelSources().length ? '' : 'none';
  const models = modelSources();
  $('sglOut').style.display = (mode === 'test' && models.length === 1) ? '' : 'none';
  renderBars(true, models.length === 1 ? models[0] : null);
  sanitizeConds();
  if (mode === 'seq') { seqRun(false); renderSeqFlow(); }
  else renderRules();
  renderLive();
}

// ── 모드 전환 ──
async function setMode(next) {
  if (mode === next) return;
  mode = next;
  const seq = next === 'seq';
  $('modeTest').classList.toggle('on', !seq);
  $('modeSeq').classList.toggle('on', seq);
  $('modeHint').textContent = seq ? T('동작을 순서대로 이어 봐요') : T('보고, 시험하고, 규칙도 만들어요');
  $('liveRows').style.display = seq ? 'none' : '';
  $('cmbOut').style.display = seq ? 'none' : '';
  $('seqOut').style.display = seq ? '' : 'none';
  $('answer').style.display = seq ? '' : 'none';
  seqRun(false);
  refreshAll();
}

// ── 이벤트 ──
$('modeTest').addEventListener('click', () => setMode('test'));
$('modeSeq').addEventListener('click', () => setMode('seq'));
[['selHand', 'hand'], ['selFace', 'face'], ['selPose', 'pose'], ['selSound', 'sound']].forEach(([id, src]) => {
  $(id).addEventListener('change', async e => {
    await setSrc(src, e.target.value);
    refreshAll();
  });
});
$('seqAdd').addEventListener('click', () => {
  const opts = seqOptions();
  if (!opts.length) { toast(T('먼저 왼쪽에서 볼 것을 골라 주세요')); return; }
  if (seqSteps.length >= SEQ_MAX) { toast(T('단계는 8개까지예요')); return; }
  const v = opts[0][0], k = v.indexOf('|');
  seqSteps.push({ src: v.slice(0, k), cls: v.slice(k + 1) });
  seqRun(false);
  renderSeqFlow();
});
$('seqReset').addEventListener('click', () => { seqRun(false); updateSeqFlow(); });
$('camBtn').addEventListener('click', () => (stream ? camStop() : camOn()));
$('camSel').addEventListener('change', () => { if (stream) { camStop(); camOn(); } });
const bgfx = createBgFx($('camVid'), $('bgCv'));
$('bgSel').addEventListener('change', () => bgfx.setMode($('bgSel').value));
$('thrSlider').addEventListener('input', () => {
  threshold = Number($('thrSlider').value) / 100;
  $('thrVal').textContent = $('thrSlider').value + '%';
});
$('ruleAdd').addEventListener('click', () => {
  if (!detectSources().length) { toast(T('먼저 왼쪽에서 볼 것을 골라 주세요')); return; }
  rules.push(newRule());
  renderRules();
});

// ── 시작 ──
(async function init() {
  try { allMeta = await Store.list(); } catch (e) { console.error(e); }
  renderSrcSelects();
  await restoreExam();          // 지난번에 만들던 것 이어서
  if (mode === null) await setMode('test');
  else refreshAll();
  syncLms();
  $('engine').textContent = T('준비 완료');
  navigator.mediaDevices && listCams();
  loop();
})();
