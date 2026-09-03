// ═══════════════════════════════════════════════════════════
// 헤더 / 탭 네비게이션 — 파이보 랩과 같은 구조를 그대로 쓴다
// ═══════════════════════════════════════════════════════════
// 각 페이지의 <header data-tab="..."> 를 파이보 랩 index.html 의
// 헤더 마크업(h1 + .navlink)과 같은 구조로 채운다.
// 클래스 이름·DOM 구조를 바꾸지 말 것 — css/ui.css 가 그대로 입혀진다.

(function () {
  const TABS = [
    { href: 'index.html', label: '학습실' },
    { href: 'test.html', label: '시험실' },
    { href: 'storage.html', label: '보관함' },
  ];

  const header = document.querySelector('header[data-tab]');
  if (!header) return;
  const cur = header.getAttribute('data-tab');

  const h1 = document.createElement('h1');
  const logo = document.createElement('img');
  logo.src = 'assets/img/pibo-logo.png';
  logo.alt = '';
  h1.appendChild(logo);
  // 글자는 span 으로 감싼다 — 아주 좁은 화면에서 로고(시그니처)만 남기기 위해
  const txt = document.createElement('span');
  txt.className = 'brand-txt';
  txt.textContent = '센스 랩';
  h1.appendChild(txt);
  header.appendChild(h1);

  TABS.forEach(function (t) {
    let el;
    if (t.href === cur) {
      el = document.createElement('span');
      el.className = 'navlink on';
    } else {
      el = document.createElement('a');
      el.className = 'navlink';
      el.href = t.href;
    }
    el.textContent = t.label;
    header.appendChild(el);
  });

  const sp = document.createElement('span');
  sp.style.flex = '1';
  header.appendChild(sp);

  const engine = document.createElement('span');
  engine.id = 'engine';
  engine.style.cssText = 'font-size:11px;color:var(--ink3,#96A5AE);font-weight:600';
  engine.textContent = '준비 중…';
  header.appendChild(engine);

  // 전체화면 (지원하는 브라우저에서만 — 아이폰 사파리는 미지원)
  // 페이지를 이동하면 브라우저가 전체화면을 강제로 풀기 때문에,
  // 켜 둔 상태를 기억했다가 다음 페이지의 첫 터치에서 다시 켠다.
  if (document.documentElement.requestFullscreen) {
    const FS_KEY = 'gl-fs';
    const remember = v => { try { v ? sessionStorage.setItem(FS_KEY, '1') : sessionStorage.removeItem(FS_KEY); } catch (e) {} };
    const wanted = () => { try { return sessionStorage.getItem(FS_KEY) === '1'; } catch (e) { return false; } };

    const fs = document.createElement('button');
    fs.className = 'hbtn';
    fs.id = 'fsBtn';
    fs.type = 'button';
    fs.title = '전체화면';
    fs.innerHTML = '<i class="fa-solid fa-expand"></i>';
    fs.addEventListener('click', function () {
      if (document.fullscreenElement) { remember(false); document.exitFullscreen(); }
      else document.documentElement.requestFullscreen().catch(function () {});
    });
    document.addEventListener('fullscreenchange', function () {
      const on = !!document.fullscreenElement;
      remember(on);              // Esc 로 나가면 기억도 지운다
      fs.innerHTML = on
        ? '<i class="fa-solid fa-compress"></i>'
        : '<i class="fa-solid fa-expand"></i>';
    });
    header.appendChild(fs);

    // 탭 이동 직후: 전체화면을 쓰던 중이었다면 첫 터치에서 되살린다.
    // 주의: 터치 기기에서 pointerdown 은 사용자 활성화 권한이 없어서
    // requestFullscreen 이 거부된다 — touchend/click 에 걸어야 한다.
    if (wanted()) {
      const revive = function () {
        document.removeEventListener('click', revive, true);
        document.removeEventListener('touchend', revive, true);
        if (!document.fullscreenElement && wanted()) {
          document.documentElement.requestFullscreen().catch(function () {});
        }
      };
      document.addEventListener('click', revive, true);
      document.addEventListener('touchend', revive, true);
    }
  }
})();
