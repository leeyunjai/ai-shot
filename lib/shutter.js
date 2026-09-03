// ═══════════════════════════════════════════════════════════
// 셔터 — 동작이 조건에 맞으면 사진을 찍는 상태 기계
// ═══════════════════════════════════════════════════════════
// 화면 루프(requestAnimationFrame)에서 매 프레임 tick(now, matched) 을 부른다.
// 타이머(setTimeout)를 쓰지 않는다 — 탭이 백그라운드로 가면 타이머는 느려지고
// 프레임은 아예 멈추는데, 프레임 기준으로 세면 둘이 어긋나지 않는다.
//
//   idle  ─ 조건 맞음 ─▶ hold ─ 유지시간 채움 ─▶ count ─ 0 ─▶ shoot ─▶ cool ─▶ idle
//            ▲                  │
//            └── 조건 풀림 ──────┘
//
//  · MISS_GRACE: 인식은 한두 프레임씩 깜빡인다. 잠깐 놓친 것으로는
//    유지시간을 되돌리지 않는다 — 이게 없으면 실기기에서 거의 안 찍힌다.
//  · 일단 count 로 들어가면 손을 내려도 찍는다 (카운트다운의 목적이 그것이다).
//  · cool: 찍은 직후의 재발동을 막는다. 셔터음이 마이크로 다시 들어가
//    소리 트리거가 연쇄 발동하는 것도 이 구간이 막는다.

const MISS_GRACE_MS = 220;
const BURST_GAP_MS = 420;

export function createShutter(cfg) {
  const c = Object.assign({
    holdMs: 800,
    countdownSec: 0,
    burst: 1,
    cooldownMs: 1500,
    onFire: null,       // (index, total) — 실제 촬영
    onState: null,      // (status) — 상태가 바뀔 때만
  }, cfg || {});

  let state = 'idle';
  let holdStart = 0, lastMatch = 0;
  let cdEnd = 0, shotsLeft = 0, nextShotAt = 0, coolEnd = 0;
  let armedBy = '';

  function go(next) {
    if (state === next) return;
    state = next;
    if (c.onState) c.onState(status());
  }

  function status() {
    return {
      state,
      // hold 진행률 0~1 (게이지용)
      progress: state === 'hold' ? Math.min(1, (perfNow - holdStart) / Math.max(1, c.holdMs)) : 0,
      // 카운트다운에 남은 초 (3, 2, 1) — count 가 아니면 0
      countLeft: state === 'count' ? Math.max(1, Math.ceil((cdEnd - perfNow) / 1000)) : 0,
      shotsLeft,
      armedBy,
    };
  }

  let perfNow = 0;

  // matched: 지금 조건이 맞는가. label: 무엇으로 맞았는지(사진에 남길 문구)
  function tick(now, matched, label) {
    perfNow = now;
    if (matched) { lastMatch = now; if (label) armedBy = label; }

    if (state === 'idle') {
      if (matched) { holdStart = now; go('hold'); }
      return status();
    }

    if (state === 'hold') {
      if (!matched && now - lastMatch > MISS_GRACE_MS) { go('idle'); return status(); }
      if (now - holdStart >= c.holdMs) {
        if (c.countdownSec > 0) { cdEnd = now + c.countdownSec * 1000; go('count'); }
        else { beginShots(now); }
      }
      return status();
    }

    if (state === 'count') {
      if (now >= cdEnd) beginShots(now);
      return status();
    }

    if (state === 'shoot') {
      if (now >= nextShotAt) {
        const idx = c.burst - shotsLeft;
        shotsLeft--;
        if (c.onFire) c.onFire(idx, c.burst);
        if (shotsLeft > 0) nextShotAt = now + BURST_GAP_MS;
        else { coolEnd = now + c.cooldownMs; go('cool'); }
      }
      return status();
    }

    if (state === 'cool') {
      if (now >= coolEnd) { lastMatch = 0; go('idle'); }
      return status();
    }

    return status();
  }

  function beginShots(now) {
    shotsLeft = Math.max(1, c.burst);
    nextShotAt = now;          // 첫 장은 바로
    go('shoot');
  }

  return {
    tick,
    status,
    // 수동 셔터 — 유지시간을 건너뛰고 카운트다운부터 시작한다
    manual(now) {
      if (state === 'shoot' || state === 'cool') return false;
      armedBy = '';
      if (c.countdownSec > 0) { cdEnd = now + c.countdownSec * 1000; go('count'); }
      else beginShots(now);
      return true;
    },
    cancel() {
      if (state === 'shoot') return false;   // 찍는 중에는 안 끊는다
      shotsLeft = 0; lastMatch = 0;
      go('idle');
      return true;
    },
    set(k, v) { c[k] = v; },
    get(k) { return c[k]; },
    get state() { return state; },
  };
}
