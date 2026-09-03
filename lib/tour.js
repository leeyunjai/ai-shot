// ═══════════════════════════════════════════════════════════
// 튜토리얼 — 파이보가 말풍선으로 화면을 한 바퀴 안내한다
// ═══════════════════════════════════════════════════════════
//  · 페이지별 첫 방문에 자동으로 시작한다 (localStorage 로 1회 기억)
//  · 헤더의 ? 버튼으로 언제든 다시 볼 수 있다
//  · 강조는 스포트라이트(구멍 뚫린 어두운 막) 방식 — 대상 요소는 건드리지 않는다

(function () {
  const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);
  const header = document.querySelector('header[data-tab]');
  if (!header) return;
  const PAGE = header.getAttribute('data-tab');

  // 단계: [강조할 요소 선택자(없으면 가운데), 말풍선 문구(한국어 키)]
  const TOURS = {
    'index.html': [
      [null, '안녕! 여기는 학습실이에요.\nAI에게 몸동작을 가르쳐요.'],
      ['.srcpick', '무엇을 보고 배울지 골라요.\n손, 얼굴, 포즈, 소리 중 하나!'],
      ['#clsName', '맞히고 싶은 종류를 만들어요.\n예: 가위, 바위, 보'],
      ['#camBtn', '카메라를 켜요.'],
      ['#capBtn', '종류를 고른 뒤,\n꾹 눌러서 예시를 모아요.'],
      ['#numsWrap', 'AI는 사진이 아니라\n이 숫자를 보고 배워요.'],
      ['#trainBtn', '예시를 다 모으면\n배우기 시작을 눌러요.'],
      ['#mdlName', '이름을 짓고 저장해요.\n시험실에서 만나요!'],
    ],
    'test.html': [
      [null, '여기는 시험실이에요.\n보고, 시험하고, 놀아요.'],
      ['#pickAll', '소스마다 무엇을 볼지 골라요.\n그냥 보기는 배우지 않아도 되고,\n내 모델을 고르면 시험이 돼요.'],
      ['#bgSel', '배경 놀이!\nAI가 사람과 배경을 나눠요.'],
      ['#liveRows', '지금 보이는 것이\n여기에 나와요.'],
      ['#ruleAdd', '규칙을 만들면 조건이 맞을 때\n내가 정한 답이 나와요.'],
      ['#modeSeq', '순서 놀이도 있어요.\n동작을 순서대로 이어 봐요!'],
    ],
    'storage.html': [
      [null, '여기는 보관함이에요.\n저장한 모델이 모여 있어요.'],
      ['#dropZone', '내보낸 zip 파일을\n여기에 놓으면 다시 들어와요.'],
    ],
  };

  const steps = TOURS[PAGE];
  if (!steps) return;

  const SEEN_KEY = 'gl-tour-' + PAGE;
  let idx = -1, box = null;

  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function stop(done) {
    if (box) { box.remove(); box = null; }
    window.removeEventListener('resize', place);
    idx = -1;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
  }

  function place() {
    if (!box || idx < 0) return;
    const [sel] = steps[idx];
    const spot = box.querySelector('.tour-spot');
    const bub = box.querySelector('.tour-bubble');
    const target = sel ? document.querySelector(sel) : null;

    if (target && target.offsetParent !== null) {
      target.scrollIntoView({ block: 'center' });
      const r = target.getBoundingClientRect();
      const pad = 6;
      spot.style.display = '';
      spot.style.left = (r.left - pad) + 'px';
      spot.style.top = (r.top - pad) + 'px';
      spot.style.width = (r.width + pad * 2) + 'px';
      spot.style.height = (r.height + pad * 2) + 'px';

      // 말풍선: 대상 아래, 안 되면 위
      const bw = Math.min(320, window.innerWidth - 24);
      bub.style.width = bw + 'px';
      let left = Math.max(12, Math.min(r.left, window.innerWidth - bw - 12));
      bub.style.left = left + 'px';
      const bh = bub.offsetHeight || 150;
      if (r.bottom + pad + bh + 20 < window.innerHeight) {
        bub.style.top = (r.bottom + pad + 12) + 'px';
        bub.style.bottom = '';
      } else if (r.top - pad - bh - 20 > 0) {
        bub.style.top = (r.top - pad - bh - 12) + 'px';
        bub.style.bottom = '';
      } else {
        bub.style.top = '';
        bub.style.bottom = '16px';
      }
    } else {
      // 대상 없음: 화면 가운데
      spot.style.display = 'none';
      const bw = Math.min(320, window.innerWidth - 24);
      bub.style.width = bw + 'px';
      bub.style.left = Math.round((window.innerWidth - bw) / 2) + 'px';
      bub.style.top = Math.round(window.innerHeight * 0.3) + 'px';
      bub.style.bottom = '';
    }
  }

  function show(i) {
    idx = i;
    if (!box) {
      box = el('div', 'tour');
      el('div', 'tour-spot', box);
      const bub = el('div', 'tour-bubble', box);
      const img = el('img', 'tour-char', bub);
      img.src = 'assets/img/pibo-hello.png';
      img.alt = '';
      el('div', 'tour-text', bub);
      const foot = el('div', 'tour-foot', bub);
      el('div', 'tour-dots', foot);
      const skip = el('button', 'db tour-skip', foot);
      skip.type = 'button';
      skip.textContent = T('그만 볼래요');
      skip.addEventListener('click', () => stop(false));
      const next = el('button', 'db go tour-next', foot);
      next.type = 'button';
      next.addEventListener('click', () => {
        if (idx + 1 >= steps.length) stop(true);
        else show(idx + 1);
      });
      document.body.appendChild(box);
      window.addEventListener('resize', place);
    }
    box.querySelector('.tour-text').textContent = T(steps[i][1]);
    const dots = box.querySelector('.tour-dots');
    dots.innerHTML = '';
    steps.forEach((_, d) => {
      const o = el('span', 'dot' + (d === i ? ' on' : ''), dots);
    });
    box.querySelector('.tour-next').textContent =
      i + 1 >= steps.length ? T('다 봤어요') : T('다음');
    box.querySelector('.tour-skip').style.display = i + 1 >= steps.length ? 'none' : '';
    place();
    // 이미지 로드 등으로 높이가 바뀌면 한 번 더 잡는다
    requestAnimationFrame(place);
  }

  function start() {
    if (idx >= 0) return;
    show(0);
  }

  // 헤더 ? 버튼 (다시 보기)
  const help = el('button', 'hbtn');
  help.id = 'helpBtn';
  help.type = 'button';
  help.title = '도움말';
  help.innerHTML = '<i class="fa-solid fa-question"></i>';
  help.addEventListener('click', start);
  // 전체화면 버튼 앞에 놓는다
  const fsBtn = document.getElementById('fsBtn');
  if (fsBtn) header.insertBefore(help, fsBtn);
  else header.appendChild(help);

  // 첫 방문이면 자동 시작
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch (e) {}
  if (!seen) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(start, 600));
    } else setTimeout(start, 600);
  }
})();
