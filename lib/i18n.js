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
  '센스 랩': 'Sense Lab',
  '센스 랩 — 학습실': 'Sense Lab — Teach',
  '센스 랩 — 시험실': 'Sense Lab — Test',
  '센스 랩 — 보관함': 'Sense Lab — Models',
  '학습실': 'Teach',
  '시험실': 'Test',
  '보관함': 'Models',
  '준비 중…': 'Getting ready…',
  '준비 중': 'Getting ready',
  '준비 완료': 'Ready',
  '불러오지 못했어요': 'Could not load',
  '불러오지 못했어요. 새로고침해 주세요': 'Could not load. Please refresh',

  // ── 단계 ──
  '종류 만들기': 'Make kinds',
  '예시 모으기': 'Collect examples',
  '배우기': 'Teach',
  '저장하기': 'Save',

  // ── 학습실: 종류 ──
  '종류': 'Kinds',
  '무엇을 보고 배울까요?': 'What should the AI watch?',
  '손': 'Hand',
  '얼굴': 'Face',
  '포즈': 'Body',
  '한 손': 'One hand',
  '두 손': 'Two hands',
  '상반신': 'Upper body',
  '전신': 'Whole body',
  '몇 개 볼까요?': 'How many hands?',
  '어디까지 볼까요?': 'How much to watch?',
  '이름 (예: 가위)': 'Name (e.g. Scissors)',
  '종류 더하기': 'Add a kind',
  '맞히고 싶은 것마다 종류를 만들어요.': 'Make a kind for each thing to guess.',
  '종류를 누른 뒤 예시를 모아요.': 'Pick a kind, then collect examples.',
  '같은 이름이 이미 있어요': 'That name is already taken',
  '종류는 6개까지 만들 수 있어요': 'You can make up to 6 kinds',
  '지우기': 'Delete',
  '누르면 이 예시를 지워요': 'Click to remove this example',
  '장': '',
  '보는 것을 바꾸면 모은 예시가 지워져요. 바꿀까요?': 'Changing what to watch clears your examples. Change anyway?',

  // ── 소리 ──
  '소리': 'Sound',
  '마이크': 'Mic',
  '마이크 & 예시': 'Mic & examples',
  '마이크 켜기': 'Mic on',
  '마이크 끄기': 'Mic off',
  '마이크가 꺼져 있어요': 'The mic is off',
  '마이크가 안 보여요. 연결을 확인해 주세요': "Can't find the mic. Please check it",
  '마이크를 확인해 주세요': 'Check the mic',
  '마이크를 켜면 숫자가 나와요': 'Turn on the mic to see numbers',
  '소리를 듣는 중이에요': 'Listening…',
  '듣는 중': 'Listening',
  '들려요': 'I hear it',
  '안 들려요': "Can't hear it",
  '꾹 눌러서 소리 모으기': 'Hold to collect sounds',
  '들리는 소리는 이 컴퓨터 밖으로 나가지 않아요': 'Your sound never leaves this computer',
  '소리 나요': 'Sound!',
  '조용해요': 'Quiet',
  '박수': 'Clap',
  '휘파람': 'Whistle',
  '말소리': 'Speech',
  '소리를 켜면 마이크를 써요.': 'Sound uses the microphone.',

  // ── 카메라 ──
  '카메라 & 예시': 'Camera & examples',
  '카메라': 'Camera',
  '카메라 켜기': 'Camera on',
  '카메라 끄기': 'Camera off',
  '카메라가 꺼져 있어요': 'The camera is off',
  '카메라가 안 보여요. 연결을 확인해 주세요': "Can't find the camera. Please check it",
  '카메라를 켜 주세요': 'Turn the camera on',
  '찍은 영상은 이 컴퓨터 밖으로 나가지 않아요': 'Your video never leaves this computer',
  '종류를 골라 주세요': 'Pick a kind first',
  '고른 종류': 'Picked kind',
  '꾹 눌러서 예시 모으기': 'Hold to collect examples',

  // ── 좌표 관찰 ──
  'AI가 보는 숫자': 'Numbers the AI sees',
  '보여요': 'I see it',
  '안 보여요': "Can't see it",
  '아직 안 보여요. 카메라 앞에 서 보세요': "Can't see it yet. Step in front of the camera",
  '카메라를 켜면 숫자가 나와요': 'Turn on the camera to see numbers',
  'AI는 사진이 아니라 이 숫자를 봐요.': 'The AI looks at these numbers, not the picture.',
  '점': 'Point',
  '이름': 'Name',
  '값': 'Value',

  // ── 배우기 / 결과 ──
  '배우기 & 결과': 'Teach & results',
  '배우기 시작': 'Start teaching',
  '종류 2개에 예시를 모은 뒤에 눌러요.': 'Collect examples for 2 kinds, then press.',
  '종류 2개에 예시가 있어야 해요': 'You need examples in 2 kinds',
  '배우는 중': 'Learning',
  '다 배웠어요': 'All done learning',
  '배우다가 멈췄어요. 다시 해 보세요': 'Learning stopped. Please try again',
  '아직 헷갈려 해요. 예시를 더 모아 볼까요?': 'Still mixed up. Shall we collect more examples?',
  '잘 배웠어요! 이제 시험해 보세요': 'Learned well! Now go test it',
  '맞힌 비율': 'Guessed right',
  '오차': 'Mistakes',
  '결과': 'Results',
  '헷갈린 표 — 왼쪽이 진짜, 위쪽이 AI의 답이에요.': "Mix-up table — left is the truth, top is the AI's answer.",
  '숫자가 대각선에 모이면 잘 배운 거예요.': 'Numbers on the diagonal mean it learned well.',

  // ── 저장 ──
  '모델 이름 (예: 가위바위보)': 'Model name (e.g. rock-paper-scissors)',
  '저장': 'Save',
  '모델 이름을 적어 주세요': 'Please type a model name',
  '같은 이름이 있어요. 바꿔 쓸까요?': 'That name exists. Replace it?',
  '저장했어요': 'Saved',
  '저장하지 못했어요': 'Could not save',
  '저장한 모델은': 'Saved models go to the',
  '과': 'and the',
  '에서 볼 수 있어요.': 'tabs.',

  // ── 시험실 ──
  '하나 시험하기': 'Test one',
  '묶어서 시험하기': 'Test a combo',
  '배운 모델 1개를 시험해요': 'Test one trained model',
  '모델을 묶어 규칙을 만들어요': 'Combine models with rules',
  '모델 고르기': 'Pick a model',
  '아직 저장한 모델이 없어요.': 'No saved models yet.',
  '에서 만들어 보세요.': 'tab is where you can make one.',
  '보는 것마다 모델을 골라요. 최대 3개예요.': 'Pick a model for each source. Up to 3.',
  '사용 안 해요': 'Not used',
  '확신 정도': 'How sure',
  '이보다 덜 확실하면 "모르겠어요"가 나와요.': 'Below this, you will see "Not sure".',
  'AI의 답': "AI's answer",
  '모델을 골라 주세요': 'Pick a model first',
  '먼저 모델을 골라 주세요': 'Pick a model first',
  '모델을 불러오지 못했어요': 'Could not load the model',
  '막대가 길수록 AI가 그 답을 확신하는 거예요.': 'A longer bar means the AI is more sure.',
  '기다리는 중': 'Waiting',
  '모르겠어요': 'Not sure',
  '가지': ' kinds',

  // ── 학습 없이 되는 신호 ──
  '신호': 'Signals',
  '배운 것': 'Learned',
  '그냥 되는 것': 'Built-in',
  '규칙에 조건을 골라 주세요': 'Pick conditions in a rule',
  '손가락 0개(주먹)': '0 fingers (fist)',
  '손가락 1개': '1 finger',
  '손가락 2개': '2 fingers',
  '손가락 3개': '3 fingers',
  '손가락 4개': '4 fingers',
  '손가락 5개(보)': '5 fingers (open)',
  '손가락 N개': 'N fingers',
  '입 벌리기': 'Mouth open',
  '웃기': 'Smiling',
  '한 손 들기': 'One hand up',
  '두 손 들기': 'Both hands up',
  '가까이': 'Near',
  '멀리': 'Far',
  '왼쪽 보기': 'Looking left',
  '오른쪽 보기': 'Looking right',
  '위 보기': 'Looking up',
  '아래 보기': 'Looking down',
  '약 Ncm': 'about N cm',

  // ── 시험하기 (통합) ──
  '시험하기': 'Try it',
  '보고, 시험하고, 규칙도 만들어요': 'Watch, test, and make rules',
  '안 봐요': 'Off',
  '그냥 보기': 'Just watch',
  '내 모델': 'My models',
  '그냥 보기는 배우지 않아도 보여요.': 'Just watch needs no training.',
  '내 모델을 고르면 시험이 돼요.': 'Pick your model to test it.',
  '무엇을 볼지 골라 주세요': 'Pick what to watch',
  '먼저 왼쪽에서 볼 것을 골라 주세요': 'First pick what to watch on the left',
  '조건이 맞으면 위에 답이 나와요. 안 만들어도 돼요.': 'When a rule matches, its name shows above. Rules are optional.',
  '여기는 시험실이에요.\n보고, 시험하고, 놀아요.': 'This is the Test room.\nWatch, test, and play.',
  '소스마다 무엇을 볼지 골라요.\n그냥 보기는 배우지 않아도 되고,\n내 모델을 고르면 시험이 돼요.': 'Pick what to watch per source.\nJust watch needs no training;\npick your model to test it.',
  '지금 보이는 것이\n여기에 나와요.': 'What the AI sees right now\nshows up here.',
  '규칙을 만들면 조건이 맞을 때\n내가 정한 답이 나와요.': 'Make a rule and your answer\nshows when it matches.',

  // ── 관찰하기 ──
  '관찰하기': 'Watch',
  '카메라만 켜면 바로 보여요': 'Just turn on the camera',
  '무엇을 볼까요?': 'What should we watch?',
  '누르면 AI의 눈이 켜져요. 배우지 않아도 보여요.': "Tap to turn on the AI's eyes. No training needed.",
  '보이는 것': 'What I see',
  '카메라를 켜면 보이는 게 나와요.': 'Turn on the camera to see.',
  '여기는 시험실이에요.\n구경도 하고 시험도 해요.': 'This is the Test room.\nWatch things and test models.',
  '놀이가 4개 있어요.\n하나씩 해 봐요.': 'There are 4 games.\nTry them one by one.',
  '배경 놀이!\nAI가 사람과 배경을 나눠요.': 'Background fun!\nThe AI splits you from the background.',
  '배운 모델은\n하나 시험하기에서 확인해요.': 'Check your trained models\nin Test one.',

  // ── 배경 놀이 ──
  '배경 놀이': 'Background fun',
  '배경 그대로': 'Normal',
  '배경 지우기': 'Erase background',
  '배경 흐리기': 'Blur background',
  '초록 배경': 'Green screen',
  '파랑 배경': 'Blue screen',
  'AI가 사람과 배경을 나눠요.': 'The AI splits you from the background.',

  // ── 순서 놀이 ──
  '순서 놀이': 'Step Game',
  '동작을 순서대로 이어 봐요': 'Chain moves in order',
  '순서도': 'Flow chart',
  '순서대로 동작을 하면 한 칸씩 내려가요.': 'Do each move to go down one step.',
  '단계 더하기': 'Add a step',
  '단계를 더해 보세요': 'Add a step below',
  '단계는 8개까지예요': 'Up to 8 steps',
  '처음부터': 'Start over',
  '시작': 'Start',
  '성공!': 'Success!',
  '성공! 참 잘했어요': 'You did it! Great job',
  'N번 동작을 해 보세요': 'Do move N',

  // ── 규칙표 ──
  '규칙표': 'Rule table',
  '조건이 맞으면 위의 답이 나와요. 위에 있는 규칙부터 봐요.': 'When a rule matches, its name shows above. Top rules go first.',
  '규칙 더하기': 'Add a rule',
  '동작 이름 (예: 인사)': 'Action name (e.g. Greeting)',
  '상관없어요': "Don't care",
  '묶는 방법': 'How to combine',
  '모두 맞으면': 'All match',
  '하나만 맞아도': 'Any match',
  '이름 없는 동작': 'Unnamed action',
  '맞는 규칙이 없어요': 'No rule matches',
  '규칙을 더해 보세요': 'Add a rule below',

  // ── 튜토리얼 ──
  '안녕! 여기는 학습실이에요.\nAI에게 몸동작을 가르쳐요.': 'Hi! This is the Teach room.\nYou teach the AI your moves.',
  '무엇을 보고 배울지 골라요.\n손, 얼굴, 포즈, 소리 중 하나!': 'Pick what to watch.\nHand, face, body, or sound!',
  '맞히고 싶은 종류를 만들어요.\n예: 가위, 바위, 보': 'Make kinds to guess.\ne.g. rock, paper, scissors',
  '카메라를 켜요.': 'Turn on the camera.',
  '종류를 고른 뒤,\n꾹 눌러서 예시를 모아요.': 'Pick a kind, then\nhold to collect examples.',
  'AI는 사진이 아니라\n이 숫자를 보고 배워요.': 'The AI learns from\nthese numbers, not photos.',
  '예시를 다 모으면\n배우기 시작을 눌러요.': 'When you have examples,\npress Start teaching.',
  '이름을 짓고 저장해요.\n시험실에서 만나요!': 'Name it and save.\nSee you in the Test room!',
  '여기는 시험실이에요.\n배운 모델을 시험해 봐요.': 'This is the Test room.\nTry out your trained models.',
  '놀이가 3개 있어요.\n하나씩 해 봐요.': 'There are 3 games.\nTry them one by one.',
  '먼저 배운 모델을 골라요.': 'First, pick a trained model.',
  '묶어서 시험하기의 규칙에는\n배우지 않아도 되는 것도 있어요.\n가까이, 입 벌리기, 손가락 개수!': 'Combo rules also have things\nthat need no training —\nnear, mouth open, finger count!',
  '모델이 없어도 돼요. 규칙에서 "그냥 되는 것"을 골라요.': 'No model needed — pick "Built-in" things in a rule.',
  '"얼굴: 가까이" 같은 건 배우지 않아도 돼요.': 'Things like "Face: Near" need no training.',
  '확신 정도예요.\n낮추면 답을 더 자주 해요.': 'How sure the AI must be.\nLower it for more answers.',
  'AI의 답이 여기에 나와요.': "The AI's answer shows here.",
  '순서 놀이도 있어요.\n동작을 순서대로 이어 봐요!': 'Try the Step Game too.\nChain moves in order!',
  '여기는 보관함이에요.\n저장한 모델이 모여 있어요.': 'This is Models.\nYour saved models live here.',
  '내보낸 zip 파일을\n여기에 놓으면 다시 들어와요.': 'Drop an exported zip here\nto bring it back.',
  '그만 볼래요': 'Skip',
  '다음': 'Next',
  '다 봤어요': 'Done',
  '도움말': 'Help',

  // ── 이어서 배우기 / 전체화면 ──
  '이어서 배우기': 'Continue teaching',
  '이어서 시작해요': 'Picking up where you left off',
  '이어 할 예시가 없어요': 'No saved examples to continue',
  '전체화면': 'Full screen',

  // ── 보관함 ──
  '저장한 모델': 'Saved models',
  '무엇을 보나': 'Watches',
  '예시': 'Examples',
  '만든 날': 'Made on',
  '이름 바꾸기': 'Rename',
  '새 이름을 적어 주세요': 'Type a new name',
  '이름을 바꿨어요': 'Renamed',
  '바꾸지 못했어요': 'Could not rename',
  '정말 지울까요?': 'Really delete it?',
  '지웠어요': 'Deleted',
  '지우지 못했어요': 'Could not delete',
  '내보내기': 'Export',
  '내보내지 못했어요': 'Could not export',
  '들어왔어요': 'Imported',
  '파일을 읽지 못했어요. 내보낸 zip 이 맞는지 확인해 주세요': 'Could not read the file. Is it an exported zip?',
  '내보낸 zip 파일을 여기에 놓으면 다시 들어와요. (눌러서 고르기)': 'Drop an exported zip here to bring it back. (Click to choose)',
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
