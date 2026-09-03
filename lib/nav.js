// ═══════════════════════════════════════════════════════════
// 상단 바 — 카메라 위에 떠 있는 얇은 바
// ═══════════════════════════════════════════════════════════
// 카메라 화면에는 탭을 두지 않는다. 갤러리는 셔터 옆 썸네일 버튼으로 간다
// (카메라 앱이 그렇게 한다). 갤러리 화면에만 돌아가기 버튼을 둔다.
//
// 클래스 이름은 바꾸지 말 것 — css/app.css 가 그대로 입혀진다.

(function () {
  const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);
  const header = document.querySelector('header[data-tab]');
  if (!header) return;
  const cur = header.getAttribute('data-tab');
  const isApp = cur === 'index.html';

  // 갤러리에서는 카메라로 돌아가는 버튼이 먼저 온다
  if (!isApp) {
    const back = document.createElement('a');
    back.className = 'navlink';
    back.href = 'index.html';
    back.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    back.title = T('카메라');
    header.appendChild(back);
  }

  const h1 = document.createElement('h1');
  const logo = document.createElement('img');
  logo.src = 'assets/img/pibo-logo.png';
  logo.alt = '';
  h1.appendChild(logo);
  // 글자는 span 으로 감싼다 — 아주 좁은 화면에서 로고만 남기기 위해
  const txt = document.createElement('span');
  txt.className = 'brand-txt';
  txt.textContent = isApp ? 'AI 샷' : '갤러리';
  h1.appendChild(txt);
  header.appendChild(h1);

  if (isApp) {
    const engine = document.createElement('span');
    engine.id = 'engine';
    engine.textContent = '준비 중…';
    header.appendChild(engine);
  }

  const sp = document.createElement('span');
  sp.style.flex = '1';
  header.appendChild(sp);

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
      remember(on);
      fs.innerHTML = on
        ? '<i class="fa-solid fa-compress"></i>'
        : '<i class="fa-solid fa-expand"></i>';
    });
    header.appendChild(fs);

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
