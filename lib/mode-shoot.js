// ═══════════════════════════════════════════════════════════
// 촬영 모드 — 동작이 조건에 맞으면 찍는다
// ═══════════════════════════════════════════════════════════
// 판정은 두 갈래다. 배우지 않아도 되는 내장 신호, 그리고 학습 모드에서
// 가르친 내 모델의 종류.
//
// 배경 효과가 켜져 있으면 화면에 보이는 그대로(합성 캔버스)를 찍는다.
// 사진은 잘리지 않은 원본 프레임 전체다 — 화면은 cover 로 잘라 보여 주지만
// 저장할 때 잘라 버릴 이유가 없다.

import { extract, sigMatch, SIG_NEAR_CM, SIG_FAR_CM, dimOf } from './features.js';
import { predictProbs } from './trainer.js';
import { Store } from './store.js';
import { Photos } from './photos.js';
import { createShutter } from './shutter.js';

const $ = id => document.getElementById(id);

const MODEL_THRESHOLD = 0.75;
const STRIP_MAX = 8;

// 트리거로 쓸 만한 내장 신호. '보여요/안 보여요/조용해요' 는 동작이 아니라
// 상태라서 뺀다 — 넣으면 쿨다운마다 계속 찍힌다.
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

export function createShootMode(ctx) {
  const { engine, toast, T, active } = ctx;

  let trig = null;
  let options = [];
  const modelCache = {};
  let activeModel = null;
  let lastProbs = null;
  let strip = [];
  let cancelled = false;

  const shutter = createShutter({
    holdMs: 800,
    countdownSec: 0,
    burst: 1,
    cooldownMs: 1500,
    onFire: fire,
    onState: renderGauge,
  });

  // ── 트리거 목록 ──
  async function buildTriggers() {
    const sel = $('trigSel');
    const keep = trig ? trig.key : null;
    const source = engine.source;

    options = [];
    sel.innerHTML = '';

    const g1 = document.createElement('optgroup');
    g1.label = T('그냥 되는 동작');
    (TRIGGERS[source] || []).forEach(([token, ko]) => {
      const o = document.createElement('option');
      o.value = String(options.length);
      o.textContent = T(ko);
      options.push({ kind: 'builtin', token, label: T(ko), key: 'b:' + token });
      g1.appendChild(o);
    });
    sel.appendChild(g1);

    let models = [];
    try { models = await Store.listBySource(source); } catch (e) { models = []; }
    if (models.length) {
      const g2 = document.createElement('optgroup');
      g2.label = T('내가 가르친 동작');
      models.forEach(m => {
        (m.classes || []).forEach((cn, i) => {
          const o = document.createElement('option');
          o.value = String(options.length);
          o.textContent = cn + ' · ' + m.name;
          options.push({
            kind: 'model', name: m.name, idx: i, meta: m,
            label: cn, key: 'm:' + m.name + ':' + i,
          });
          g2.appendChild(o);
        });
      });
      sel.appendChild(g2);
    }
    $('noModelHint').style.display = models.length ? 'none' : '';

    let pick = options.findIndex(o => o.key === keep);
    if (pick < 0) pick = 0;
    sel.value = String(pick);
    await select(pick);
  }

  async function select(i) {
    const o = options[i];
    if (!o) { trig = null; return; }
    trig = o;
    lastProbs = null;
    if (o.kind === 'model') {
      try { activeModel = await loadModel(o.name); }
      catch (e) { console.error(e); activeModel = null; toast(T('동작을 불러오지 못했어요')); }
    } else {
      activeModel = null;
    }
    $('armTxt').textContent = o.label;
    shutter.cancel();
  }

  async function loadModel(name) {
    if (modelCache[name]) return modelCache[name];
    const rec = await Store.load(name);
    if (!rec) throw new Error('missing');
    modelCache[name] = rec;
    return rec;
  }

  // ── 프레임 ──
  function frame(f) {
    let matched = false;

    if (f.source === 'sound') {
      const s = f.sound;
      if (s && trig) {
        matched = trig.kind === 'builtin'
          ? sigMatch('sound', trig.token, s.sig)
          : modelMatch(s.vec);
      }
    } else if (trig && f.ready) {
      if (trig.kind === 'builtin') {
        matched = sigMatch(f.source, trig.token, f.sig);
      } else if (activeModel && f.result) {
        const vec = extract(f.source, f.result, trig.meta.variant || null);
        matched = vec ? modelMatch(vec) : false;
      }
    }

    renderHud(f);

    // 학습 모드로 넘어가 있으면 셔터를 멈춘다 (예시 모으는 중에 찍히면 안 된다)
    if (!active()) {
      if (!cancelled) { cancelled = true; shutter.cancel(); renderGauge(shutter.status()); }
      return;
    }
    cancelled = false;
    renderGauge(shutter.tick(f.now, matched && f.ready, trig ? trig.label : ''));
  }

  function modelMatch(vec) {
    if (!activeModel || !trig || trig.kind !== 'model') return false;
    const dim = trig.meta.featureDim || dimOf(engine.source, trig.meta.variant);
    if (vec.length !== dim) return false;     // 갈래가 다른 벡터는 넣지 않는다
    let probs = null;
    try { probs = predictProbs(activeModel.model, vec); } catch (e) { return false; }
    lastProbs = probs;
    return (probs[trig.idx] || 0) >= MODEL_THRESHOLD;
  }

  // ── HUD ──
  function renderHud(f) {
    const box = $('liveNow');
    const badge = $('armBadge');
    badge.classList.toggle('on', !!(trig && f.ready));
    if (!f.ready) {
      box.textContent = '';
      box.classList.remove('on');
      return;
    }
    const d = describe(f);
    box.textContent = d.text;
    box.classList.toggle('on', d.on);
  }

  function describe(f) {
    if (f.source === 'sound') {
      const s = f.sound;
      if (!engine.snd.running) return { text: T('마이크를 켜는 중'), on: false };
      if (!s) return { text: T('소리를 듣는 중'), on: false };
      if (trig && trig.kind === 'model' && lastProbs) return modelText();
      const on = [];
      if (s.sig.clap) on.push(T('박수'));
      if (s.sig.whistle) on.push(T('휘파람'));
      if (s.sig.speech) on.push(T('말소리'));
      if (on.length) return { text: on.join(' · '), on: true };
      return { text: s.sig.quiet ? T('조용해요') : T('소리가 나요'), on: !s.sig.quiet };
    }

    const s = f.sig;
    if (!s || !s.shown) {
      const miss = { hand: '손이 안 보여요', face: '얼굴이 안 보여요', pose: '몸이 안 보여요' };
      return { text: T(miss[f.source] || '안 보여요'), on: false };
    }
    if (trig && trig.kind === 'model' && lastProbs) return modelText();

    if (f.source === 'hand') {
      const n = s.fingers;
      return {
        text: n === 0 ? T('주먹') : n === 5 ? T('손바닥(보)') : T('손가락 N개').replace('N', n),
        on: true,
      };
    }
    if (f.source === 'face') {
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
    if (f.source === 'pose') {
      const n = s.handsUp;
      return {
        text: n >= 2 ? T('두 손 들기') : n === 1 ? T('한 손 들기') : T('몸이 보여요'),
        on: true,
      };
    }
    return { text: '', on: false };
  }

  function modelText() {
    if (!lastProbs || !trig || trig.kind !== 'model') return { text: '', on: false };
    const names = trig.meta.classes || [];
    let best = 0;
    for (let i = 1; i < lastProbs.length; i++) if (lastProbs[i] > lastProbs[best]) best = i;
    const p = lastProbs[best] || 0;
    if (p < MODEL_THRESHOLD) return { text: T('아직 모르겠어요'), on: false };
    return { text: (names[best] || '?') + ' ' + Math.round(p * 100) + '%', on: true };
  }

  // ── 게이지 / 카운트다운 ──
  function renderGauge(st) {
    const fill = $('gaugeFill'), label = $('gaugeLabel'), pct = $('gaugePct');
    const cd = $('cdown'), wrap = $('gaugeWrap');
    const shot = $('shotBtn');

    wrap.classList.toggle('armed', st.state === 'hold' || st.state === 'count');
    wrap.classList.toggle('firing', st.state === 'shoot');
    shot.classList.toggle('busy', st.state === 'count' || st.state === 'shoot');

    if (st.state === 'count') { cd.textContent = String(st.countLeft); cd.classList.add('on'); }
    else cd.classList.remove('on');

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
      label.textContent = engine.camReady() ? T('동작을 기다리는 중') : T('카메라를 켜 주세요');
      pct.textContent = '';
    }
  }

  // ── 촬영 ──
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
      o.start(); o.stop(actx.currentTime + 0.11);
    } catch (e) { /* 소리는 없어도 그만 */ }
  }

  function flash() {
    const f = $('flash');
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  async function fire(idx, total) {
    const v = engine.video;
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) return;

    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx2 = cv.getContext('2d');
    // 거울: 화면에 보이던 그대로 (셀카는 이쪽이 자연스럽다).
    // 끄면 카메라가 실제로 본 방향으로 — 배경 글자가 뒤집히지 않는다.
    // 뼈대 선도 같은 변환 안에서 그리므로 어느 쪽이든 영상과 맞는다.
    if ($('mirrorChk').checked) {
      ctx2.translate(w, 0);
      ctx2.scale(-1, 1);
    }
    if (engine.bg.mode !== 'off') ctx2.drawImage(engine.bgCv, 0, 0, w, h);
    else ctx2.drawImage(v, 0, 0, w, h);
    if ($('skelChk').checked && engine.source !== 'sound') {
      ctx2.drawImage(engine.ovCv, 0, 0, w, h);
    }

    flash();
    beep();

    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) { toast(T('사진을 만들지 못했어요')); return; }
    try {
      const rec = await Photos.add(blob, {
        w, h,
        trigger: trig ? trig.label : '',
        effect: engine.bg.mode,
        mirrored: $('mirrorChk').checked,
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
    while (strip.length > STRIP_MAX) URL.revokeObjectURL(strip.pop().url);
    renderStrip();
  }

  function renderStrip() {
    const box = $('strip');
    box.innerHTML = '';
    strip.forEach(s => {
      const a = document.createElement('a');
      a.href = 'gallery.html#' + encodeURIComponent(s.id);
      const im = document.createElement('img');
      im.src = s.url;
      im.alt = '';
      a.appendChild(im);
      box.appendChild(a);
    });
    $('stripHint').style.display = strip.length ? 'none' : '';
    // 갤러리 버튼을 마지막 사진 썸네일로 (카메라 앱처럼)
    const gal = $('galBtn');
    if (strip.length) {
      gal.innerHTML = '';
      const im = document.createElement('img');
      im.src = strip[0].url;
      im.alt = '';
      gal.appendChild(im);
    }
  }

  function free() { strip.forEach(s => URL.revokeObjectURL(s.url)); strip = []; }

  // ── 시트 컨트롤 ──
  $('trigSel').addEventListener('change', e => select(Number(e.target.value)));
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
  $('bgSel').addEventListener('change', e => engine.bg.setMode(e.target.value));

  renderGauge(shutter.status());

  return {
    frame,
    buildTriggers,
    free,
    shoot() { shutter.manual(performance.now()); },
    variant() { return trig && trig.kind === 'model' ? (trig.meta.variant || null) : null; },
  };
}
