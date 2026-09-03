// ═══════════════════════════════════════════════════════════
// 특징 벡터 — 원본 좌표를 그대로 쓰지 않고 정규화해서 학습에 넣는다
// ═══════════════════════════════════════════════════════════
//  손   worldLandmarks 21점. 손목(0)을 원점으로 평행이동한 뒤
//       손목~중지MCP(9) 거리로 스케일 정규화 → 63차원
//  얼굴 blendshape 52개 값 그대로 (이미 0~1) → 52차원
//       478점 좌표는 쓰지 않는다 — blendshape 가 표정 입력으로 훨씬 낫다
//  포즈 worldLandmarks 상반신 0~24번만. 양 어깨(11,12) 중점을 원점으로,
//       어깨 너비로 스케일 정규화 → 75차원
//
// z 값은 상대값이다. 절대 깊이로 쓰지 말 것.

export const FEATURE_DIMS = { hand: 63, face: 52, pose: 75, sound: 521 };

// 갈래(variant): 같은 소스라도 무엇을 얼마나 볼지 고를 수 있다.
//  손   one 한 손 63 / two 두 손 126 (왼손 자리 + 오른손 자리, 없는 손은 0)
//  포즈 upper 상반신 75 / full 전신 99 (엉덩이 중점 원점 · 몸통 길이 스케일)
export const VARIANTS = {
  hand: [['one', '한 손'], ['two', '두 손']],
  pose: [['upper', '상반신'], ['full', '전신']],
};
export function dimOf(source, variant) {
  if (source === 'hand' && variant === 'two') return 126;
  if (source === 'pose' && variant === 'full') return 99;
  return FEATURE_DIMS[source];
}

// 화면에 쓸 소스 이름 (i18n 사전에 있는 한국어 원문)
export const SOURCE_LABELS = { hand: '손', face: '얼굴', pose: '포즈', sound: '소리' };

// 감지 결과 → Float32Array 또는 null(미검출)
export function extract(source, result, variant) {
  if (!result) return null;
  if (source === 'hand') return variant === 'two' ? handVec2(result) : handVec(result);
  if (source === 'face') return faceVec(result);
  if (source === 'pose') return variant === 'full' ? poseVecFull(result) : poseVec(result);
  return null;
}

// 손 한 개를 손목 원점·손목~중지MCP 스케일로 정규화해 out 에 써넣는다
function writeHand(lm, out, off) {
  const w = lm[0];                       // 손목
  const m = lm[9];                       // 중지 MCP
  const s = dist(w, m) || 1e-6;
  for (let i = 0; i < 21; i++) {
    out[off + i * 3] = (lm[i].x - w.x) / s;
    out[off + i * 3 + 1] = (lm[i].y - w.y) / s;
    out[off + i * 3 + 2] = (lm[i].z - w.z) / s;
  }
}

function handVec(r) {
  const lm = r.worldLandmarks && r.worldLandmarks[0];
  if (!lm || lm.length < 21) return null;
  const v = new Float32Array(63);
  writeHand(lm, v, 0);
  return v;
}

// 두 손: 좌/우 판별로 자리를 고정한다 — 순서가 흔들리면 학습이 안 된다.
// 한 손만 보이면 없는 쪽은 0 으로 남는다.
function handVec2(r) {
  const hands = r.worldLandmarks || [];
  if (!hands.length) return null;
  const v = new Float32Array(126);
  let wrote = false;
  hands.forEach((lm, i) => {
    if (!lm || lm.length < 21) return;
    const label = r.handednesses && r.handednesses[i] && r.handednesses[i][0]
      ? r.handednesses[i][0].categoryName : (i === 0 ? 'Left' : 'Right');
    writeHand(lm, v, label === 'Left' ? 0 : 63);
    wrote = true;
  });
  return wrote ? v : null;
}

function faceVec(r) {
  const bs = r.faceBlendshapes && r.faceBlendshapes[0];
  if (!bs || !bs.categories || bs.categories.length < 52) return null;
  const v = new Float32Array(52);
  for (let i = 0; i < 52; i++) v[i] = bs.categories[i].score;
  return v;
}

function poseVec(r) {
  const lm = r.worldLandmarks && r.worldLandmarks[0];
  if (!lm || lm.length < 25) return null;
  const L = lm[11], R = lm[12];          // 양 어깨
  const cx = (L.x + R.x) / 2, cy = (L.y + R.y) / 2, cz = (L.z + R.z) / 2;
  const s = dist(L, R) || 1e-6;
  const v = new Float32Array(75);
  for (let i = 0; i < 25; i++) {
    v[i * 3] = (lm[i].x - cx) / s;
    v[i * 3 + 1] = (lm[i].y - cy) / s;
    v[i * 3 + 2] = (lm[i].z - cz) / s;
  }
  return v;
}

// 전신: 엉덩이(23·24) 중점을 원점으로, 몸통 길이(어깨 중점~엉덩이 중점)로
// 스케일 정규화 — 거리·위치가 달라도 같은 자세면 비슷한 값이 된다.
function poseVecFull(r) {
  const lm = r.worldLandmarks && r.worldLandmarks[0];
  if (!lm || lm.length < 33) return null;
  const sh = mid(lm[11], lm[12]), hip = mid(lm[23], lm[24]);
  const s = dist(sh, hip) || 1e-6;
  const v = new Float32Array(99);
  for (let i = 0; i < 33; i++) {
    v[i * 3] = (lm[i].x - hip.x) / s;
    v[i * 3 + 1] = (lm[i].y - hip.y) / s;
    v[i * 3 + 2] = (lm[i].z - hip.z) / s;
  }
  return v;
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ═══ 얼굴 신호 — 홍채 거리 + 머리 방향 ═══
// 얼굴 모델을 학습하지 않아도 쓸 수 있는 내장 신호.
//  · 거리: 사람 홍채 지름은 약 11.7mm 로 거의 일정하다 → 화면상 홍채 크기로
//    카메라와의 거리를 역산한다. 무보정 ±10~15% 수준의 대략치(cm).
//  · 방향: 코끝(1)이 얼굴 좌우 가장자리(234·454)·위아래(10·152) 사이
//    어디에 있는지 비율로 판단한다. 행렬 분해보다 단순하고 안정적이다.

const IRIS_MM = 11.7;
const FOCAL_RATIO = 0.85;      // 초점거리 ≈ 0.85 × 영상 가로폭 (일반 웹캠 화각 가정)
export const SIG_NEAR_CM = 40; // 이보다 가까우면 "가까이"
export const SIG_FAR_CM = 75;  // 이보다 멀면 "멀리"
const YAW_LO = 0.38, YAW_HI = 0.62;
const PITCH_UP = 0.46, PITCH_DN = 0.62;

// 학습 없이 쓰는 소스별 내장 신호 (값 토큰, 화면 문구)
// 모델을 만들지 않아도 규칙표·순서 놀이에서 바로 고를 수 있다.
export const BUILTIN_SIGS = {
  hand: [
    ['shown', '보여요'], ['hide', '안 보여요'],
    ['f0', '손가락 0개(주먹)'], ['f1', '손가락 1개'], ['f2', '손가락 2개'],
    ['f3', '손가락 3개'], ['f4', '손가락 4개'], ['f5', '손가락 5개(보)'],
  ],
  face: [
    ['shown', '보여요'], ['hide', '안 보여요'],
    ['near', '가까이'], ['far', '멀리'],
    ['left', '왼쪽 보기'], ['right', '오른쪽 보기'],
    ['up', '위 보기'], ['down', '아래 보기'],
    ['mouth', '입 벌리기'], ['smile', '웃기'],
  ],
  pose: [
    ['shown', '보여요'], ['hide', '안 보여요'],
    ['up1', '한 손 들기'], ['up2', '두 손 들기'],
  ],
  sound: [
    ['sound', '소리 나요'], ['quiet', '조용해요'],
    ['clap', '박수'], ['whistle', '휘파람'], ['speech', '말소리'],
  ],
};

// ═══ 소리 신호 — YAMNet 점수에서 학습 없이 읽는 것들 ═══
// 인덱스는 yamnet_label_list.txt 기준 (모델 파일 안에 들어 있는 라벨 순서).
const SND_SPEECH = 0;
const SND_WHISTLE = [35, 396];          // Whistling, Whistle
const SND_CLAP = [57, 58, 62];          // Finger snapping, Clapping, Applause
const SND_SCORE = 0.3;                  // 이 점수를 넘으면 그 소리로 본다
const SND_QUIET_LEVEL = 0.02;           // RMS 가 이보다 작으면 "조용해요"

export function soundSignals(vec, level) {
  if (!vec) return { shown: false };
  const mx = idx => Math.max(...idx.map(i => vec[i] || 0));
  return {
    shown: true,
    quiet: level < SND_QUIET_LEVEL,
    clap: mx(SND_CLAP) > SND_SCORE,
    whistle: mx(SND_WHISTLE) > SND_SCORE,
    speech: (vec[SND_SPEECH] || 0) > SND_SCORE + 0.2,   // 말소리는 흔해서 기준을 높인다
  };
}

const MOUTH_OPEN = 0.4, SMILE = 0.4;   // blendshape 점수 기준

export function faceSignals(result, vw, vh) {
  const lm = result && result.faceLandmarks && result.faceLandmarks[0];
  if (!lm || lm.length < 478) return null;
  const px = (a, b) => {
    const dx = (a.x - b.x) * vw, dy = (a.y - b.y) * vh;
    return Math.sqrt(dx * dx + dy * dy);
  };
  // 홍채 지름(픽셀): 양쪽 중 큰 값 (고개를 돌리면 한쪽이 작아 보인다)
  const iris = Math.max(px(lm[469], lm[471]), px(lm[474], lm[476]));
  const distCm = iris > 1 ? Math.round(FOCAL_RATIO * vw * IRIS_MM / iris / 10) : null;

  // 학생 자신의 기준으로 왼쪽/오른쪽 (거울 프리뷰와 같은 방향감)
  const L = lm[234], R = lm[454], N = lm[1], TOP = lm[10], CHIN = lm[152];
  const yawR = (N.x - L.x) / ((R.x - L.x) || 1e-6);
  const pitR = (N.y - TOP.y) / ((CHIN.y - TOP.y) || 1e-6);
  const yaw = yawR > YAW_HI ? 'left' : (yawR < YAW_LO ? 'right' : 'center');
  const pitch = pitR < PITCH_UP ? 'up' : (pitR > PITCH_DN ? 'down' : 'center');
  return { distCm, yaw, pitch };
}

// ── 소스별 신호 상태 계산 ──
// 감지 결과(raw)에서 학습 없이 읽어낼 수 있는 것들을 뽑는다.
export function computeSignals(source, result, vw, vh) {
  if (source === 'hand') return handSignals(result);
  if (source === 'face') return faceSigFull(result, vw, vh);
  if (source === 'pose') return poseSignals(result);
  return null;
}

function handSignals(result) {
  const lm = result && result.worldLandmarks && result.worldLandmarks[0];
  if (!lm || lm.length < 21) return { shown: false };
  const d = (i, j) => dist(lm[i], lm[j]);
  // 손가락이 펴졌는가: 끝점이 가운데 마디보다 손목에서 멀면 펴진 것 (방향 무관)
  let fingers = 0;
  // 엄지: 접으면 손바닥을 가로질러 새끼 쪽으로 온다 →
  // 엄지끝(4)~새끼MCP(17) 거리가 손바닥 폭(5~17)보다 충분히 멀면 편 것
  if (d(4, 17) > d(5, 17) * 1.1) fingers++;
  [[8, 6], [12, 10], [16, 14], [20, 18]].forEach(([tip, pip]) => {
    if (d(tip, 0) > d(pip, 0) * 1.08) fingers++;
  });
  return { shown: true, fingers };
}

function faceSigFull(result, vw, vh) {
  const base = faceSignals(result, vw, vh);
  if (!base) return { shown: false };
  const bs = result.faceBlendshapes && result.faceBlendshapes[0];
  let mouth = false, smile = false;
  if (bs && bs.categories) {
    const score = name => {
      const c = bs.categories.find(x => x.categoryName === name);
      return c ? c.score : 0;
    };
    mouth = score('jawOpen') > MOUTH_OPEN;
    smile = (score('mouthSmileLeft') + score('mouthSmileRight')) / 2 > SMILE;
  }
  return Object.assign({ shown: true, mouth, smile }, base);
}

function poseSignals(result) {
  const lm = result && result.landmarks && result.landmarks[0];
  if (!lm || lm.length < 33) return { shown: false };
  // 손목(15·16)이 코(0)보다 위에 있으면 든 것 (화면 좌표, y 작을수록 위)
  const nose = lm[0];
  const up = [lm[15], lm[16]].filter(w => w.y < nose.y).length;
  return { shown: true, handsUp: up };
}

// 신호 조건 판정 (규칙표·순서 놀이 공용)
export function sigMatch(source, want, s) {
  if (want === 'hide') return !s || !s.shown;
  if (!s || !s.shown) return false;
  if (want === 'shown') return true;
  if (source === 'hand') {
    if (want[0] === 'f') return s.fingers === Number(want.slice(1));
    return false;
  }
  if (source === 'face') {
    if (want === 'near') return s.distCm != null && s.distCm <= SIG_NEAR_CM;
    if (want === 'far') return s.distCm != null && s.distCm >= SIG_FAR_CM;
    if (want === 'left' || want === 'right') return s.yaw === want;
    if (want === 'up' || want === 'down') return s.pitch === want;
    if (want === 'mouth') return !!s.mouth;
    if (want === 'smile') return !!s.smile;
    return false;
  }
  if (source === 'pose') {
    if (want === 'up1') return s.handsUp >= 1;
    if (want === 'up2') return s.handsUp >= 2;
    return false;
  }
  if (source === 'sound') {
    if (want === 'quiet') return !!s.quiet;
    if (want === 'sound') return !s.quiet;
    if (want === 'clap') return !!s.clap;
    if (want === 'whistle') return !!s.whistle;
    if (want === 'speech') return !!s.speech;
    return false;
  }
  return false;
}

// ── 좌표 관찰 패널용 ──
// "AI는 픽셀이 아니라 숫자를 본다" 를 보여주는 표의 행 데이터.
// [{ label, values: [..] }] 형태로 돌려준다.
export function observeRows(source, result, variant) {
  if (source === 'face') {
    const bs = result && result.faceBlendshapes && result.faceBlendshapes[0];
    if (!bs || !bs.categories) return null;
    return bs.categories.map(c => ({ label: c.categoryName, values: [c.score] }));
  }
  const lm = result && result.landmarks && result.landmarks[0]
    ? result.landmarks[0]
    : (result && result.faceLandmarks && result.faceLandmarks[0]);
  if (!lm) return null;
  const n = source === 'pose' ? (variant === 'full' ? 33 : 25) : lm.length;
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ label: String(i), values: [lm[i].x, lm[i].y, lm[i].z] });
  return rows;
}
