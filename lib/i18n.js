// ═══════════════════════════════════════════════════════════
// 다국어 (한국어 / English) — 파이보 랩 js/i18n.js 와 같은 방식
// ═══════════════════════════════════════════════════════════
// 설계 (파이보 랩과 동일)
//  · 한국어 원문을 그대로 '키' 로 쓴다 → 사전에 없으면 한국어가 그대로 나오므로
//    번역이 빠져도 화면이 깨지지 않는다.
//  · HTML 은 손대지 않는다. 페이지가 뜨면 DOM 을 훑어서 텍스트를 바꾼다.
//  · 언어 설정은 파이보 랩과 같은 localStorage 키 'language' 를 쓴다.
//  · 학생이 입력한 종류·모델 이름은 사전에 없으므로 번역되지 않는다 (의도된 동작).

const GL_LANG = (function () {
  try {
    const saved = localStorage.getItem('language');
    if (saved === 'ko' || saved === 'en') return saved;
  } catch (e) {}
  const nav = (navigator.language || navigator.userLanguage || 'ko');
  return nav.toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
})();

const GL_I18N = {
  // ── 페이지 / 헤더 ──
  'AI 샷': 'AI Shot',
  'AI 샷 — 촬영실': 'AI Shot — Shoot',
  'AI 샷 — 제스처 만들기': 'AI Shot — Teach',
  'AI 샷 — 갤러리': 'AI Shot — Gallery',
  '촬영실': 'Shoot',
  '제스처 만들기': 'Teach',
  '갤러리': 'Gallery',
  '준비 중…': 'Getting ready…',
  '준비 중': 'Getting ready',
  '준비 완료': 'Ready',
  '준비': 'Ready',
  '불러오지 못했어요': 'Could not load',
  '불러오지 못했어요. 새로고침해 주세요': 'Could not load. Please refresh',
  'AI를 불러오지 못했어요. 새로고침해 주세요': 'Could not load the AI. Please refresh',

  // ── 소스 ──
  '손': 'Hand',
  '얼굴': 'Face',
  '포즈': 'Body',
  '소리': 'Sound',
  '한 손': 'One hand',
  '두 손': 'Two hands',
  '상반신': 'Upper body',
  '전신': 'Full body',
  '몇 개 볼까요?': 'How many?',
  '어디까지 볼까요?': 'How much?',

  // ── 촬영실 : 셔터 ──
  '셔터': 'Shutter',
  '무엇으로 찍을까요?': 'What takes the shot?',
  '이 동작이면 찰칵': 'Shoot on this move',
  '배우지 않아도 되는 동작': 'Moves that just work',
  '배우지 않아도 되는 동작이에요.': 'This one works without teaching.',
  '내가 가르친 제스처': 'Moves I taught',
  '내가 가르친 제스처예요': 'A move you taught',
  '아직 만든 제스처가 없어요.': 'No moves of your own yet.',
  '에서 나만의 동작을 가르쳐 보세요.': ' to teach your own move.',
  '제스처를 불러오지 못했어요': 'Could not load that move',
  '얼마나 유지할까요?': 'Hold for how long?',
  '짧으면 잘 찍히고, 길면 잘못 찍히는 일이 줄어요.': 'Shorter fires easily; longer avoids wrong shots.',
  '찰칵 하기 전에': 'Before the shot',
  '바로': 'Now',
  '1초': '1s',
  '3초': '3s',
  '초': 's',
  '몇 장 찍을까요?': 'How many shots?',
  '1장': '1',
  '3장': '3',
  '5장': '5',

  // ── 트리거 이름 ──
  '주먹': 'Fist',
  '손가락 1개': 'One finger',
  '브이(손가락 2개)': 'V sign',
  '손가락 3개': 'Three fingers',
  '손가락 4개': 'Four fingers',
  '손바닥(보)': 'Open palm',
  '손가락 N개': 'N fingers',
  '웃기': 'Smile',
  '입 벌리기': 'Open mouth',
  '가까이 오기': 'Come closer',
  '멀리 가기': 'Move away',
  '왼쪽 보기': 'Look left',
  '오른쪽 보기': 'Look right',
  '위 보기': 'Look up',
  '아래 보기': 'Look down',
  '한 손 들기': 'One hand up',
  '두 손 들기': 'Both hands up',
  '박수': 'Clap',
  '휘파람': 'Whistle',
  '말소리': 'Speech',
  '아무 소리': 'Any sound',

  // ── 카메라 ──
  '카메라': 'Camera',
  '마이크': 'Mic',
  '카메라 켜기': 'Turn camera on',
  '카메라 끄기': 'Turn camera off',
  '마이크 켜기': 'Turn mic on',
  '마이크 끄기': 'Turn mic off',
  '카메라가 꺼져 있어요': 'The camera is off',
  '마이크가 꺼져 있어요': 'The mic is off',
  '카메라를 켜 주세요': 'Please turn the camera on',
  '카메라가 안 보여요. 연결을 확인해 주세요': 'No camera found. Check the connection',
  '마이크가 안 보여요. 연결을 확인해 주세요': 'No mic found. Check the connection',
  '손으로 찍기': 'Shoot by hand',
  '찍은 사진은 이 컴퓨터 밖으로 나가지 않아요': 'Your photos never leave this computer',
  '찍은 사진과 들리는 소리는 이 컴퓨터 밖으로 나가지 않아요': 'Photos and sound never leave this computer',
  '찍은 영상은 이 컴퓨터 밖으로 나가지 않아요': 'The video never leaves this computer',
  '들리는 소리는 이 컴퓨터 밖으로 나가지 않아요': 'The sound never leaves this computer',

  // ── 셔터 상태 ──
  '동작을 기다리는 중': 'Waiting for the move',
  '찰칵까지': 'To the shot',
  '곧 찍어요': 'Shooting soon',
  '찰칵!': 'Snap!',
  '잠깐 쉬는 중': 'Taking a breath',
  '찰칵! N장 중 M장': 'Snap! M of N',
  '사진을 만들지 못했어요': 'Could not make the photo',
  '사진을 저장하지 못했어요': 'Could not save the photo',

  // ── 지금 보이는 것 ──
  '보고 있어요…': 'Looking…',
  '마이크를 켜는 중이에요': 'Turning the mic on…',
  '소리를 듣는 중이에요': 'Listening…',
  '조용해요': 'Quiet',
  '소리가 나요': 'I hear something',
  '손이 안 보여요': 'No hand in view',
  '얼굴이 안 보여요': 'No face in view',
  '몸이 안 보여요': 'No body in view',
  '안 보여요': 'Not in view',
  '얼굴이 보여요': 'I see a face',
  '몸이 보여요': 'I see you',
  '웃는 중': 'Smiling',
  '입 벌림': 'Mouth open',
  '가까이': 'Near',
  '멀리': 'Far',
  '약 Ncm': 'about N cm',
  '아직 모르겠어요': 'Not sure yet',

  // ── 사진 / 갤러리 ──
  '지금 & 방금 찍은 사진': 'Now & just shot',
  '방금 찍은 사진': 'Just shot',
  '아직 찍은 사진이 없어요.': 'No photos yet.',
  '동작을 하면 저절로 찍혀요.': 'Make the move and it shoots itself.',
  '갤러리로': 'To the gallery',
  '갤러리에서 보기': 'See it in the gallery',
  '찍은 사진': 'Photos',
  '에서 동작으로 찍어 보세요.': ' and shoot with a move.',
  'N장': 'N',
  '전부 zip 으로': 'All as a zip',
  '전부 지우기': 'Delete all',
  '전부 지웠어요': 'Deleted them all',
  '사진을 전부 지울까요? 되돌릴 수 없어요.': 'Delete every photo? This cannot be undone.',
  '이 사진을 지울까요?': 'Delete this photo?',
  '내려받기': 'Download',
  '닫기': 'Close',
  '지우기': 'Delete',
  '지웠어요': 'Deleted',
  '지우지 못했어요': 'Could not delete',
  '정말 지울까요?': 'Really delete?',

  // ── 배경 / 사진 설정 ──
  '배경 바꾸기': 'Change the background',
  '배경 그대로': 'Keep background',
  '배경 지우기': 'Erase background',
  '배경 흐리기': 'Blur background',
  '초록 배경': 'Green screen',
  '파랑 배경': 'Blue screen',
  'AI가 사람과 배경을 픽셀로 나눠요. 바꾼 배경 그대로 찍혀요.': 'The AI splits you from the background, pixel by pixel. The photo keeps it.',
  '사진 설정': 'Photo options',
  '뼈대 선도 같이 찍기': 'Include the skeleton lines',
  '찰칵 소리 내기': 'Play a shutter sound',

  // ── 제스처 만들기 ──
  '내 동작': 'My moves',
  '무엇을 보고 배울까요?': 'What should it watch?',
  '동작 이름 (예: 브이)': 'Move name (e.g. V sign)',
  '동작 더하기': 'Add a move',
  '셔터로 쓸 동작과, 그게 아닌 평소 모습을 각각 만들어요.': 'Make one move for the shutter, and one for everything else.',
  '예:': 'e.g.',
  '브이': 'V sign',
  '가만히': 'Just standing',
  '카메라 & 예시': 'Camera & examples',
  '마이크 & 예시': 'Mic & examples',
  '동작을 골라 주세요': 'Pick a move',
  '고른 동작': 'Picked',
  '꾹 눌러서 예시 모으기': 'Hold to collect examples',
  '꾹 눌러서 소리 모으기': 'Hold to collect sounds',
  '동작마다 20~40장이면 충분해요.': '20–40 per move is plenty.',
  '누르면 이 예시를 지워요': 'Click to delete this example',
  '장': '',
  '같은 이름이 이미 있어요': 'That name is taken',
  '동작은 6개까지 만들 수 있어요': 'Up to 6 moves',
  '보는 것을 바꾸면 모은 예시가 지워져요. 바꿀까요?': 'Changing what it watches clears your examples. Continue?',

  // ── 배우기 ──
  '배우기 & 저장': 'Teach & save',
  '배우기 시작': 'Start teaching',
  '동작 2개에 예시를 모은 뒤에 눌러요.': 'Collect examples for 2 moves first.',
  '동작 2개에 예시가 있어야 해요': 'Two moves need examples',
  '배우는 중': 'Teaching',
  '다 배웠어요': 'All learned',
  '배우다가 멈췄어요. 다시 해 보세요': 'Teaching stopped. Try again',
  '맞힌 비율': 'Score',
  '오차': 'Error',
  '결과': 'Result',
  '잘 배웠어요!': 'Learned it well!',
  '잘 배웠어요! 이름을 붙여 저장하고 촬영실에서 써 보세요.': 'Learned it well! Name it, save it, and use it in the shoot room.',
  '아직 헷갈려 해요. 예시를 더 모아 볼까요?': 'Still mixed up. Collect a few more examples?',
  '아직 헷갈려 해요. 예시를 더 모으거나, 동작을 더 다르게 해 보세요.': 'Still mixed up. Collect more examples, or make the moves more different.',

  // ── 저장 / 보관 ──
  '저장': 'Save',
  '저장하기': 'Save',
  '이름 (예: 브이 셔터)': 'Name (e.g. V shutter)',
  '저장하면': 'Once saved, it shows up in the',
  '의 셔터 목록에 바로 나와요.': ' shutter list.',
  '이름을 적어 주세요': 'Please type a name',
  '같은 이름이 있어요. 바꿔 쓸까요?': 'That name exists. Replace it?',
  '저장했어요': 'Saved',
  '저장하지 못했어요': 'Could not save',
  '이름': 'Name',
  '새 이름': 'New name',
  '이름 바꾸기': 'Rename',
  '이름을 바꿨어요': 'Renamed',
  '바꾸지 못했어요': 'Could not rename',
  '무엇을 보나': 'Watches',
  '동작': 'Moves',
  '예시': 'Examples',
  '만든 날': 'Made on',
  '이어서 배우기': 'Keep teaching',
  '이어 할 예시가 없어요': 'No examples to continue from',
  '이어서 시작해요': 'Continuing',
  '내보내기': 'Export',
  '내보내지 못했어요': 'Could not export',
  '내보낸 zip 파일을 여기에 놓으면 다시 들어와요. (눌러서 고르기)': 'Drop an exported zip here to bring it back. (or click to pick)',
  'zip 파일만 넣을 수 있어요': 'Only zip files',
  '불러왔어요': 'Loaded',
  '불러오지 못했어요. 내보낸 zip 이 맞나요?': 'Could not load. Is it an exported zip?',

  // ── 튜토리얼 ──
  '그만 볼래요': 'Skip',
  '다음': 'Next',
  '다 봤어요': 'Done',
  '안녕! 여기는 촬영실이에요.\n동작을 하면 카메라가 저절로 찍어요.':
    'Hi! This is the shoot room.\nMake a move and the camera shoots itself.',
  '무엇으로 찍을지 골라요.\n손, 얼굴, 포즈, 소리 중 하나!':
    'Pick what takes the shot.\nHand, face, body or sound!',
  '이 동작이 나오면 찰칵 해요.\n내가 가르친 제스처도 고를 수 있어요.':
    'This move fires the shutter.\nMoves you taught show up here too.',
  '동작을 얼마나 유지해야\n찍을지 정해요.':
    'How long to hold the move\nbefore it shoots.',
  '카메라를 켜요.\n동작을 해 보면 게이지가 차요.':
    'Turn the camera on.\nMake the move and the gauge fills.',
  '배경도 바꿔서 찍을 수 있어요.\nAI가 사람과 배경을 나눠요.':
    'You can swap the background too.\nThe AI splits you from it.',
  '찍은 사진은 여기에 쌓여요.\n갤러리에서 내려받을 수 있어요.':
    'Your shots pile up here.\nDownload them from the gallery.',
  '여기서 나만의 동작을 가르쳐요.\n가르친 동작은 셔터가 돼요.':
    'Teach your own move here.\nWhat you teach becomes a shutter.',
  '셔터로 쓸 동작과,\n그게 아닌 평소 모습을 각각 만들어요.':
    'Make one move for the shutter,\nand one for everything else.',
  '동작을 고르고 꾹 눌러서\n예시를 모아요.':
    'Pick a move and hold the button\nto collect examples.',
  '예시를 다 모으면\n배우기 시작을 눌러요.':
    'Once you have examples,\npress start teaching.',
  '이름을 짓고 저장하면\n촬영실 셔터 목록에 나와요.':
    'Name it and save — it lands\nin the shoot room shutter list.',
  '여기는 갤러리예요.\n찍은 사진이 모여 있어요.':
    'This is the gallery.\nEvery shot lives here.',
  '사진을 누르면 크게 보고\n내려받을 수 있어요.':
    'Click a photo to see it big\nand download it.',
  '가르친 제스처도 여기서\n관리해요.':
    'The moves you taught\nare managed here too.',
};

// 한국어 원문 → 현재 언어. 사전에 없으면 원문 그대로.
function GL_T(ko) {
  if (GL_LANG === 'ko') return ko;
  const v = GL_I18N[ko];
  return (v === undefined) ? ko : v;
}

// ── 화면(HTML) 자동 번역 — 파이보 랩과 동일 ──
// HTML 파일은 손대지 않는다. 텍스트 노드와 title/placeholder 만 바꿔치기한다.
function localizeDOM(root) {
  if (GL_LANG === 'ko') return;
  const scope = root || document.body;
  if (!scope) return;

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
  const hits = [];
  let n;
  while ((n = walker.nextNode())) {
    const tag = n.parentNode && n.parentNode.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    const raw = n.nodeValue.trim();
    if (!raw || GL_I18N[raw] === undefined) continue;
    hits.push([n, n.nodeValue.replace(raw, GL_I18N[raw])]);
  }
  hits.forEach(h => { h[0].nodeValue = h[1]; });

  ['title', 'placeholder'].forEach(attr => {
    scope.querySelectorAll('[' + attr + ']').forEach(el => {
      const v = GL_I18N[el.getAttribute(attr).trim()];
      if (v !== undefined) el.setAttribute(attr, v);
    });
  });

  if (document.title && GL_I18N[document.title.trim()] !== undefined)
    document.title = GL_I18N[document.title.trim()];
}

// ── 언어 토글 버튼 (파이보 랩과 동일한 버튼·위치) ──
function setLanguage(v) {
  try { localStorage.setItem('language', v); } catch (e) {}
  location.reload();
}

function mountLangToggle() {
  const bar = document.querySelector('header');
  if (!bar || document.getElementById('langToggle')) return;

  const toKo = (GL_LANG !== 'ko');
  const b = document.createElement('button');
  b.id = 'langToggle';
  b.type = 'button';
  b.textContent = toKo ? '한' : 'EN';
  b.title = '한국어 / English';
  b.style.cssText =
    'border:1.5px solid var(--line,#9A8F7D);background:var(--panel,#fff);' +
    'color:var(--ink,#2A2620);border-radius:var(--r-s,6px);padding:6px 10px;' +
    'font-size:12.5px;font-weight:600;min-width:46px;text-align:center;line-height:1;' +
    'font-family:inherit;cursor:pointer';
  b.addEventListener('click', function () { setLanguage(toKo ? 'ko' : 'en'); });

  bar.appendChild(b);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { localizeDOM(); mountLangToggle(); });
} else {
  localizeDOM(); mountLangToggle();
}
