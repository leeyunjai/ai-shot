// ═══════════════════════════════════════════════════════════
// 학습 모드 — 셔터로 쓸 나만의 동작을 가르친다
// ═══════════════════════════════════════════════════════════
// 셔터로 쓰려면 "그 동작"과 "그게 아닌 것" 둘 다 필요하다. 하나만 배운
// 모델은 무엇을 보든 그 하나로 답해서 셔터가 멈추지 않는다. 그래서
// 종류가 2개 미만이면 배우기 버튼이 열리지 않는다.
//
// 예시를 모으는 것은 큰 셔터 버튼을 꾹 누르고 있는 동안이다 (초당 10장).
// 소리는 250ms 마다 오는 분류 결과 하나가 한 장이 된다.

import { extract, dimOf, VARIANTS } from './features.js';
import { trainModel } from './trainer.js';
import { Store } from './store.js';
import { accentColor } from './landmarker.js';

const $ = id => document.getElementById(id);

const VARIANT_UI = {
  hand: { q: '몇 개', icons: { one: 'fa-hand', two: 'fa-hands' } },
  pose: { q: '어디까지', icons: { upper: 'fa-user', full: 'fa-person' } },
};
const defVariant = src => (VARIANTS[src] ? VARIANTS[src][0][0] : null);

export function createTrainMode(ctx) {
  const { engine, toast, T, active, onSaved } = ctx;

  let variant = defVariant(engine.source);
  let classes = [];              // [{ name, vecs, thumbs }]
  let selected = -1;
  let capturing = false, lastCap = 0;
  let lastVec = null;
  let trained = null;
  let training = false;

  // 소리는 프레임이 아니라 250ms 틱으로 들어온다
  engine.snd.onTick = latest => {
    if (training || engine.source !== 'sound' || !active()) return;
    lastVec = latest.vec;
    if (capturing && selected >= 0) addSample(lastVec);
  };

  function progress(label, pct, ratio) {
    $('prgLabel').textContent = label;
    $('prgPct').textContent = pct == null ? '' : pct;
    if (ratio != null) $('prgFill').style.width = Math.round(ratio * 100) + '%';
  }

  // ── 프레임 ──
  function frame(f) {
    if (training) return;
    if (f.source === 'sound') return;         // 위 onTick 이 담당
    lastVec = f.result ? extract(f.source, f.result, variant) : null;
    if (!active()) return;
    if (capturing && lastVec && selected >= 0 && f.now - lastCap > 100) {
      lastCap = f.now;
      addSample(lastVec);
    }
  }

  // ── 갈래 (한 손/두 손 · 상반신/전신) ──
  function renderVariant() {
    const box = $('variantRow');
    const opts = VARIANTS[engine.source];
    if (!opts) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const ui = VARIANT_UI[engine.source];
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
      b.type = 'button';
      b.classList.toggle('on', variant === v);
      b.innerHTML = '<i class="fa-solid ' + ui.icons[v] + '"></i>' + T(ko);
      b.addEventListener('click', () => {
        if (variant === v) return;
        if (hasData() && !confirm(T('보는 것을 바꾸면 모은 예시가 지워져요. 바꿀까요?'))) return;
        wipe();
        variant = v;
        renderVariant(); renderClasses(); refresh();
      });
      seg.appendChild(b);
    });
    box.appendChild(seg);
  }

  // 소스가 바뀌면 (엔진이 알려 준다) 갈래를 초기화하고 예시를 버린다
  function sourceChanged() {
    variant = defVariant(engine.source);
    wipe();
    renderVariant(); renderClasses(); refresh();
  }

  function hasData() { return classes.some(c => c.vecs.length > 0); }
  function wipe() {
    classes.forEach(c => { c.vecs = []; c.thumbs = []; });
    clearTrained();
  }

  // ── 동작 ──
  function addClass() {
    const name = $('clsName').value.trim();
    if (!name) return;
    if (classes.some(c => c.name === name)) { toast(T('같은 이름이 이미 있어요')); return; }
    if (classes.length >= 6) { toast(T('동작은 6개까지')); return; }
    classes.push({ name, vecs: [], thumbs: [] });
    $('clsName').value = '';
    $('clsName').blur();
    selected = classes.length - 1;
    clearTrained();
    renderClasses(); refresh();
  }

  function renderClasses() {
    const box = $('clsList');
    box.innerHTML = '';
    classes.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'cls' + (i === selected ? ' on' : '');
      el.addEventListener('click', ev => {
        if (ev.target.closest('.del')) return;
        selected = i; renderClasses(); refresh();
      });
      const top = document.createElement('div');
      top.className = 'top';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = c.name;
      const ct = document.createElement('span'); ct.className = 'ct'; ct.textContent = c.vecs.length;
      const del = document.createElement('button');
      del.className = 'del'; del.type = 'button';
      del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      del.title = T('지우기');
      del.addEventListener('click', () => {
        classes.splice(i, 1);
        if (selected >= classes.length) selected = classes.length - 1;
        clearTrained(); renderClasses(); refresh();
      });
      top.appendChild(nm); top.appendChild(ct); top.appendChild(del);
      el.appendChild(top);

      if (c.thumbs.length) {
        const th = document.createElement('div');
        th.className = 'thumbs';
        c.thumbs.forEach((src, si) => {
          const im = document.createElement('img');
          im.src = src;
          im.title = T('누르면 이 예시를 지워요');
          im.addEventListener('click', ev => {
            ev.stopPropagation();
            c.vecs.splice(si, 1); c.thumbs.splice(si, 1);
            renderClasses(); refresh();
          });
          th.appendChild(im);
        });
        el.appendChild(th);
      }
      box.appendChild(el);
    });
    $('clsHint').style.display = classes.length ? 'none' : '';
  }

  // ── 예시 ──
  function thumb() {
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    const c = cv.getContext('2d');
    if (engine.source === 'sound') {
      c.fillStyle = '#0C1114';
      c.fillRect(0, 0, 96, 96);
      c.fillStyle = accentColor();
      engine.snd.levels.slice(-16).forEach((v, i) => {
        const h = Math.max(3, Math.min(1, v * 6) * 80);
        c.fillRect(i * 6 + 2, (96 - h) / 2, 4, h);
      });
      return cv.toDataURL('image/png');
    }
    const v = engine.video;
    c.translate(96, 0); c.scale(-1, 1);
    const s = Math.min(v.videoWidth, v.videoHeight) || 1;
    c.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 96, 96);
    return cv.toDataURL('image/jpeg', 0.7);
  }

  function addSample(vec) {
    const c = classes[selected];
    if (!c || c.vecs.length >= 200) return;
    c.vecs.push(Float32Array.from(vec));
    c.thumbs.push(thumb());
    clearTrained();
    renderClasses(); refresh();
  }

  function startCap() {
    const ready = engine.source === 'sound' ? engine.snd.running : engine.camReady();
    if (selected < 0 || !ready || capturing) return false;
    capturing = true; lastCap = 0;
    return true;
  }
  function stopCap() { capturing = false; }

  // ── 배우기 ──
  function clearTrained() {
    if (trained) { trained.model.dispose(); trained = null; }
    $('resultSec').style.display = 'none';
    $('chartBox').style.display = 'none';
    refresh();
  }

  async function train() {
    const usable = classes.filter(c => c.vecs.length > 0);
    if (usable.length < 2) { toast(T('동작 2개에 예시가 있어야 해요')); return; }
    if (training) return;
    training = true;
    refresh();

    const dim = dimOf(engine.source, variant);
    const vecs = [], labels = [];
    usable.forEach((c, i) => c.vecs.forEach(v => { vecs.push(v); labels.push(i); }));

    $('chartBox').style.display = '';
    const hist = [];
    try {
      const out = await trainModel(vecs, labels, usable.length, dim, (ep, total, rec) => {
        hist.push(rec);
        progress(T('배우는 중') + ' ' + ep + '/' + total,
          Math.round((rec.acc || 0) * 100) + '%', ep / total);
        drawChart(hist);
      });
      trained = Object.assign(out, { classes: usable.map(c => c.name), saved: false });
      progress(T('다 배웠어요'), Math.round(out.accuracy * 100) + '%', 1);
      $('resultSec').style.display = '';
      $('accBig').textContent = Math.round(out.accuracy * 100) + '%';
      $('accWord').textContent = T('맞힌 비율');
      const good = out.accuracy >= 0.9;
      $('accNote').textContent = good ? T('이름을 붙여 저장해요.') : T('예시를 더 모아 볼까요?');
      toast(good ? T('잘 배웠어요!') : T('아직 헷갈려 해요'));
    } catch (e) {
      console.error(e);
      progress(T('배우다가 멈췄어요'), '', 0);
    }
    training = false;
    refresh();
  }

  function drawChart(hist) {
    const cv = $('chart');
    const W = cv.clientWidth || 280, H = cv.clientHeight || 78;
    if (cv.width !== W * 2) { cv.width = W * 2; cv.height = H * 2; }
    const c = cv.getContext('2d');
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, W, H);
    if (!hist.length) return;
    const pad = 6;
    const maxLoss = Math.max(0.001, ...hist.map(h => h.loss || 0));
    const px = i => pad + (W - 2 * pad) * (hist.length === 1 ? 1 : i / (hist.length - 1));
    const line = (get, color) => {
      c.beginPath();
      hist.forEach((h, i) => {
        const y = pad + (H - 2 * pad) * (1 - Math.max(0, Math.min(1, get(h))));
        i ? c.lineTo(px(i), y) : c.moveTo(px(i), y);
      });
      c.strokeStyle = color; c.lineWidth = 2; c.stroke();
    };
    line(h => (h.loss || 0) / maxLoss, '#B4451C');
    line(h => h.acc || 0, accentColor());
  }

  // ── 저장 ──
  async function save() {
    if (!trained) return;
    const name = $('mdlName').value.trim();
    if (!name) { toast(T('이름을 적어 주세요')); return; }
    try {
      if (await Store.meta(name)) {
        if (!confirm(T('같은 이름이 있어요. 바꿔 쓸까요?'))) return;
      }
      const usable = classes.filter(c => c.vecs.length > 0);
      await Store.save(name, trained.model, {
        source: engine.source,
        variant,
        featureDim: dimOf(engine.source, variant),
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
      if (onSaved) onSaved();
    } catch (e) {
      console.error(e);
      toast(T('저장하지 못했어요'));
    }
  }

  // ── 상태 ──
  function refresh() {
    $('selInfo').textContent = selected >= 0
      ? classes[selected].name + ' — ' + T('셔터를 꾹 누르세요')
      : T('동작을 골라 주세요');
    $('selInfo').classList.toggle('on', selected >= 0);
    const shot = classes.filter(c => c.vecs.length > 0).length;
    $('trainBtn').disabled = training || shot < 2;
    $('mdlSave').disabled = !trained;
  }

  // ── 이어서 배우기 (?load=이름) ──
  async function restore(name) {
    try {
      const meta = await Store.meta(name);
      if (!meta || !meta.examples || !meta.examples.length) { toast(T('이어 할 예시가 없어요')); return; }
      variant = meta.variant || defVariant(engine.source);
      renderVariant();
      classes = meta.examples.map(e => ({
        name: e.name,
        vecs: (e.vecs || []).map(v => Float32Array.from(v)),
        thumbs: (e.thumbs || []).slice(),
      }));
      selected = 0;
      $('mdlName').value = meta.name;
      renderClasses(); refresh();
      toast(T('이어서 시작해요') + ': ' + name);
    } catch (e) {
      console.error(e);
      toast(T('불러오지 못했어요'));
    }
  }

  $('clsAdd').addEventListener('click', addClass);
  $('clsName').addEventListener('keydown', e => { if (e.key === 'Enter') addClass(); });
  $('trainBtn').addEventListener('click', train);
  $('mdlSave').addEventListener('click', save);

  renderVariant();
  renderClasses();
  refresh();
  progress(T('준비 중'), '');

  return {
    frame, sourceChanged, hasData, restore,
    startCap, stopCap,
    variant() { return variant; },
  };
}
