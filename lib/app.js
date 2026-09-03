// ═══════════════════════════════════════════════════════════
// AI 샷 — 앱 셸
// ═══════════════════════════════════════════════════════════
// 카메라가 화면의 주인이고, 컨트롤은 그 위에 떠 있다.
// 촬영과 학습은 바텀 시트 안에서 좌우로 넘긴다 — 페이지 이동이 없으므로
// 넘겨도 카메라가 끊기지 않는다. 그래서 엔진이 하나여야 한다.
//
// 큰 셔터 버튼은 모드에 따라 다르게 동작한다:
//   카메라 꺼짐 → 카메라 켜기 / 촬영 → 톡 눌러 찍기 / 학습 → 꾹 눌러 모으기

import { createEngine } from './engine.js';
import { createShootMode } from './mode-shoot.js';
import { createTrainMode } from './mode-train.js';

const $ = id => document.getElementById(id);
const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

// ══ 판 (촬영 / 학습) ══
let pane = 0;
const PANES = 2;

function setPane(next, animate) {
  next = Math.max(0, Math.min(PANES - 1, next));
  pane = next;
  const track = $('paneTrack');
  track.classList.toggle('drag', !animate);
  track.style.transform = 'translateX(' + (-50 * pane) + '%)';
  if (!animate) requestAnimationFrame(() => track.classList.remove('drag'));
  document.querySelectorAll('.modetabs .mt').forEach(b => {
    b.classList.toggle('on', Number(b.dataset.pane) === pane);
  });
  renderShutter();
}

// 탭을 누르면 그 모드로 넘기고, 접혀 있던 설정을 펴 준다
document.querySelectorAll('.modetabs .mt').forEach(b => {
  b.addEventListener('click', () => {
    setPane(Number(b.dataset.pane), true);
    setSheet(true);
  });
});

// 좌우 스와이프 — 시트 어디를 잡아도 넘어간다.
// 판 안쪽만 잡게 하면 폰에서는 거의 안 넘어간다 (시트가 대부분 컨트롤이다).
// 값을 가로로 끄는 컨트롤(슬라이더·선택·입력)에서만 시작하지 않는다.
// 버튼 위에서 시작하는 것은 허용하고, 실제로 넘긴 경우에만 그 탭을 삼킨다.
(function swipe() {
  const sheet = $('sheet'), view = $('paneView'), track = $('paneTrack');
  const NO_START = 'input,select,textarea';
  let id = null, x0 = 0, y0 = 0, dx = 0, decided = '';

  function eat(e) { e.stopPropagation(); e.preventDefault(); }

  sheet.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest(NO_START)) return;
    if (!view.clientHeight) return;                 // 접혀 있으면 넘기지 않는다
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; decided = '';
  });

  sheet.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!decided) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      decided = Math.abs(mx) > Math.abs(my) * 1.3 ? 'x' : 'y';
      if (decided === 'x') track.classList.add('drag');
    }
    if (decided !== 'x') return;
    dx = mx;
    const w = view.clientWidth || 1;
    let pct = -50 * pane + (dx / w) * 50;
    pct = Math.max(-50 * (PANES - 1) - 6, Math.min(6, pct));   // 끝에서 살짝만 늘어난다
    track.style.transform = 'translateX(' + pct + '%)';
  });

  function end() {
    if (id === null) return;
    id = null;
    if (decided !== 'x') return;
    // 넘기려고 끈 손가락이 버튼 위에서 떨어져도 그 버튼이 눌리지 않게 한다
    window.addEventListener('click', eat, true);
    setTimeout(() => window.removeEventListener('click', eat, true), 0);
    const w = view.clientWidth || 1;
    const moved = dx / w;
    if (moved < -0.18) setPane(pane + 1, true);
    else if (moved > 0.18) setPane(pane - 1, true);
    else setPane(pane, true);
  }
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
})();

document.addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea')) return;
  if (e.key === 'ArrowRight') { setPane(pane + 1, true); setSheet(true); }
  else if (e.key === 'ArrowLeft') { setPane(pane - 1, true); setSheet(true); }
});

// ══ 시트 접기 ══
// 첫 화면은 접힌 상태다 — 카메라가 화면의 주인이고, 설정은 필요할 때 펴면 된다.
let sheetUp = false;
function setSheet(up) {
  sheetUp = up;
  $('sheet').classList.toggle('down', !up);
  setTimeout(() => engine.fit(), 300);
}
$('grip').addEventListener('click', () => setSheet(!sheetUp));

// ══ 엔진 ══
const engine = createEngine({
  onStatus(s) {
    const el = $('engine');
    if (!el) return;
    el.textContent = s === 'ready' ? T('준비 완료')
      : s === 'failed' ? T('불러오지 못했어요') : T('준비 중…');
    if (s === 'failed') toast(T('AI를 불러오지 못했어요. 새로고침해 주세요'));
  },
  onSource(src) {
    document.querySelectorAll('.srcpick .db').forEach(b => {
      b.classList.toggle('on', b.dataset.src === src);
    });
    shoot.buildTriggers();
    train.sourceChanged();
    $('micCv').style.display = src === 'sound' ? '' : 'none';
  },
  onCam(on) {
    $('camOff').style.display = on ? 'none' : '';
    renderShutter();
  },
  onDevices(list) {
    $('camFlip').style.display = list.length > 1 ? '' : 'none';
  },
  onError(what) {
    toast(what === 'mic'
      ? T('마이크가 안 보여요. 연결을 확인해 주세요')
      : T('카메라가 안 보여요. 연결을 확인해 주세요'));
  },
});

const shoot = createShootMode({ engine, toast, T, active: () => pane === 0 });
const train = createTrainMode({
  engine, toast, T,
  active: () => pane === 1,
  onSaved: () => shoot.buildTriggers(),
});

engine.setVariantProvider(() => (pane === 1 ? train.variant() : shoot.variant()));
engine.onFrame(f => { shoot.frame(f); train.frame(f); });

// ══ 소스 칩 ══
document.querySelectorAll('.srcpick .db').forEach(b => {
  b.addEventListener('click', async () => {
    const next = b.dataset.src;
    if (next === engine.source) return;
    if (train.hasData() && !confirm(T('보는 것을 바꾸면 모은 예시가 지워져요. 바꿀까요?'))) return;
    await engine.setSource(next);
  });
});

// ══ 셔터 ══
function renderShutter() {
  const shot = $('shotBtn');
  const off = !engine.camReady();
  shot.title = off ? T('카메라 켜기') : pane === 1 ? T('꾹 눌러서 모으기') : T('찍기');
  shot.disabled = false;
}

(function shutterBtn() {
  const shot = $('shotBtn');
  let armed = false;

  shot.addEventListener('pointerdown', e => {
    if (!engine.camReady()) { armed = false; engine.camOn(); return; }
    armed = true;
    if (pane === 1) {
      try { shot.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      train.startCap();
    }
  });

  const up = () => {
    if (pane === 1) train.stopCap();
    else if (armed) shoot.shoot();
    armed = false;
  };
  shot.addEventListener('pointerup', up);
  shot.addEventListener('pointercancel', () => { train.stopCap(); armed = false; });
  shot.addEventListener('contextmenu', e => e.preventDefault());
})();

$('camFlip').addEventListener('click', () => engine.flipCam());

$('goTrain').addEventListener('click', e => {
  e.preventDefault();
  setPane(1, true);
  setSheet(true);
});

// ══ 정리 ══
window.addEventListener('pagehide', () => {
  shoot.free();
  engine.micStop();
});

// ══ 시작 ══
// ?load=이름 으로 들어오면 학습 판을 펴고, 그 모델이 보던 소스로 맞춘 뒤
// 예시를 되살린다. 엔진 초기화는 한 번만 한다.
const loadName = new URLSearchParams(location.search).get('load');

setPane(loadName ? 1 : 0, false);
setSheet(!!loadName);          // 이어서 배우기로 들어오면 바로 펴 준다
renderShutter();
engine.listCams();

(async () => {
  if (loadName) {
    try {
      const { Store } = await import('./store.js');
      const meta = await Store.meta(loadName);
      if (meta && meta.source && meta.source !== engine.source) {
        await engine.initSource();
        await engine.setSource(meta.source);
      } else {
        await engine.initSource();
      }
      await shoot.buildTriggers();
      await train.restore(loadName);
      return;
    } catch (e) { console.error(e); }
  }
  await engine.initSource();
  await shoot.buildTriggers();
})();
