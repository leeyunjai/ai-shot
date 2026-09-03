// ═══════════════════════════════════════════════════════════
// 랜드마커 — MediaPipe Tasks Vision 로드 / 전환 / 추론
// ═══════════════════════════════════════════════════════════
// 전부 셀프호스팅이다: wasm 은 vendor/tasks-vision/, 모델은 models/.
// 경로는 페이지 기준 상대경로만 쓴다 (하위 경로 배포 대비).
//
//  · loadLandmarker('hand'|'face'|'pose') → { source, detect, draw, close }
//  · delegate GPU 실패 시 CPU 로 자동 폴백한다
//  · 소스 전환 시 이전 인스턴스의 close() 를 반드시 부른다 (메모리 정리)

import {
  FilesetResolver, HandLandmarker, FaceLandmarker, PoseLandmarker,
  ImageSegmenter, DrawingUtils,
} from '../vendor/tasks-vision/vision_bundle.mjs';

const WASM_DIR = './vendor/tasks-vision';

const SOURCES = {
  hand: {
    model: './models/hand_landmarker.task',
    make: (vision, base) => HandLandmarker.createFromOptions(vision, {
      baseOptions: base, runningMode: 'VIDEO', numHands: 2,
    }),
  },
  face: {
    model: './models/face_landmarker.task',
    make: (vision, base) => FaceLandmarker.createFromOptions(vision, {
      baseOptions: base, runningMode: 'VIDEO', numFaces: 1,
      outputFaceBlendshapes: true,
    }),
  },
  pose: {
    // lite 고정 — full/heavy 는 쓰지 않는다 (저사양 노트북 기준)
    model: './models/pose_landmarker_lite.task',
    make: (vision, base) => PoseLandmarker.createFromOptions(vision, {
      baseOptions: base, runningMode: 'VIDEO', numPoses: 1,
    }),
  },
};

let visionPromise = null;
function fileset() {
  if (!visionPromise) visionPromise = FilesetResolver.forVisionTasks(WASM_DIR);
  return visionPromise;
}

export async function loadLandmarker(source) {
  const cfg = SOURCES[source];
  if (!cfg) throw new Error('unknown source: ' + source);
  const vision = await fileset();

  let inst = null;
  try {
    inst = await cfg.make(vision, { modelAssetPath: cfg.model, delegate: 'GPU' });
  } catch (e) {
    console.warn('[landmarker] GPU delegate failed, falling back to CPU', e);
    inst = await cfg.make(vision, { modelAssetPath: cfg.model, delegate: 'CPU' });
  }

  // runningMode VIDEO 는 타임스탬프가 단조 증가해야 한다.
  // 라운드로빈으로 프레임을 건너뛰어도 performance.now() 를 그대로 주면 지켜진다.
  let lastTs = -1;
  function detect(video, ts) {
    if (ts <= lastTs) ts = lastTs + 1;   // 같은 프레임 재호출 보호
    lastTs = ts;
    return inst.detectForVideo(video, ts);
  }

  return {
    source,
    detect,
    close() { try { inst.close(); } catch (e) { /* 무시 */ } },
  };
}

// ── 오버레이 그리기 ──
// 캔버스는 비디오와 같은 크기로 두고, 좌우 반전은 CSS(scaleX(-1))가 담당한다.
// 선 색은 테마 토큰(--acc)을 따른다 — theme-maker.css 가 색을 바꾸면 같이 바뀐다.
let accCache = null;
export function accentColor() {
  if (!accCache) {
    accCache = (getComputedStyle(document.documentElement).getPropertyValue('--acc') || '').trim() || '#00BEDC';
  }
  return accCache;
}

export function accentRgba(alpha) {
  const hex = accentColor();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

export function drawResult(ctx, source, result, variant) {
  const du = new DrawingUtils(ctx);
  const ACC = accentColor(), DOT = '#FFFFFF';

  if (source === 'hand') {
    // 한 손 갈래면 첫 손만 그린다 — 안 배우는 손까지 그리면 헷갈린다
    let hands = result.landmarks || [];
    if (variant === 'one') hands = hands.slice(0, 1);
    hands.forEach(lm => {
      du.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, { color: ACC, lineWidth: 3 });
      du.drawLandmarks(lm, { color: DOT, fillColor: DOT, lineWidth: 1, radius: 3 });
    });
  } else if (source === 'face') {
    (result.faceLandmarks || []).forEach(lm => {
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: accentRgba(0.25), lineWidth: 1 });
      du.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_CONTOURS, { color: ACC, lineWidth: 2 });
    });
  } else if (source === 'pose') {
    // 상반신 갈래면 0~24번만 그린다 — 배우는 범위와 화면 표시를 일치시킨다
    const upper = variant !== 'full';
    const conns = upper
      ? PoseLandmarker.POSE_CONNECTIONS.filter(c => c.start < 25 && c.end < 25)
      : PoseLandmarker.POSE_CONNECTIONS;
    (result.landmarks || []).forEach(lm => {
      const pts = upper ? lm.slice(0, 25) : lm;
      du.drawConnectors(lm, conns, { color: ACC, lineWidth: 3 });
      du.drawLandmarks(pts, { color: DOT, fillColor: DOT, lineWidth: 1, radius: 3 });
    });
  }
}

// ── 배경 놀이 — 셀피 세그멘테이션 (사람/배경 분리) ──
let segPromise = null;
export function loadSegmenter() {
  if (!segPromise) {
    segPromise = fileset().then(vision => ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: './models/selfie_segmenter.tflite', delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
    }).catch(() => ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: './models/selfie_segmenter.tflite', delegate: 'CPU' },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
    })));
  }
  return segPromise;
}
