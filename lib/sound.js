// ═══════════════════════════════════════════════════════════
// 소리 엔진 — 마이크 + YAMNet 분류 (MediaPipe Tasks Audio)
// ═══════════════════════════════════════════════════════════
// 전부 셀프호스팅이다: wasm 은 vendor/tasks-audio/, 모델은 models/yamnet.tflite.
//
//  · YAMNet 은 소리 1초를 521가지 점수로 바꾼다 — 이 521차원이
//    손의 63차원 좌표와 똑같은 "특징 벡터"가 되어 그대로 학습에 들어간다
//  · 마이크는 16kHz 모노로 받는다 (YAMNet 기대 입력. 브라우저가 리샘플한다)
//  · 250ms 마다 최근 1초 창을 분류한다 — 수집·실시간 표시 공용
//  · 소리는 어디로도 전송하지 않는다. 녹음 파일도 만들지 않는다

import { FilesetResolver, AudioClassifier } from '../vendor/tasks-audio/audio_bundle.mjs';

const WASM_DIR = './vendor/tasks-audio';
const MODEL = './models/yamnet.tflite';
const RATE = 16000;            // YAMNet 입력 샘플레이트
const TICK_MS = 250;           // 분류 주기
export const SOUND_DIM = 521;

let clfPromise = null;
function ensureClassifier() {
  if (!clfPromise) {
    clfPromise = FilesetResolver.forAudioTasks(WASM_DIR).then(fileset =>
      AudioClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL },
        maxResults: SOUND_DIM,       // 521개 점수 전부 받는다
      })).catch(e => { clfPromise = null; throw e; });   // 실패하면 다음에 다시 시도
  }
  return clfPromise;
}

// 미리 내려받기 (페이지 진입 시 불러두면 첫 켜기가 빠르다)
export function preloadSound() { return ensureClassifier().catch(() => {}); }

export async function listMics() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter(d => d.kind === 'audioinput');
  } catch (e) { return []; }
}

// createSoundEngine() → { start, stop, running, ready, latest, levels, onTick }
//  latest = { vec: Float32Array(521), top: [{name, score}…], level }
//  levels = 최근 소리 크기(RMS) 기록 — 파형 그리기용
export function createSoundEngine() {
  let ctx = null, srcNode = null, proc = null, stream = null;
  let timer = null, classifier = null;
  const ring = new Float32Array(RATE);   // 최근 1초
  let ringPos = 0, ringFilled = 0;
  let level = 0;

  const eng = {
    running: false,
    ready: false,        // 첫 분류 결과가 나온 뒤 true
    latest: null,
    levels: [],
    onTick: null,

    async start(deviceId) {
      if (eng.running) return true;
      classifier = await ensureClassifier();
      const want = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      if (deviceId) want.deviceId = { exact: deviceId };
      stream = await navigator.mediaDevices.getUserMedia({ audio: want, video: false });
      try { ctx = new AudioContext({ sampleRate: RATE }); }
      catch (e) { ctx = new AudioContext(); }   // 일부 기기는 샘플레이트 고정
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
        // 사용자 조작 없이 만들면 멈춰 있을 수 있다 → 다음 터치/클릭에서 다시 깨운다
        const wake = () => { ctx && ctx.resume().catch(() => {}); };
        document.addEventListener('click', wake, { once: true });
        document.addEventListener('touchend', wake, { once: true });
      }
      srcNode = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = ev => {
        const ch = ev.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < ch.length; i++) {
          ring[ringPos] = ch[i];
          ringPos = (ringPos + 1) % ring.length;
          sum += ch[i] * ch[i];
        }
        ringFilled = Math.min(ring.length, ringFilled + ch.length);
        level = Math.sqrt(sum / ch.length);
      };
      srcNode.connect(proc);
      proc.connect(ctx.destination);   // 연결해야 콜백이 돈다 (출력은 무음)
      timer = setInterval(tick, TICK_MS);
      eng.running = true;
      return true;
    },

    stop() {
      clearInterval(timer); timer = null;
      if (proc) { proc.disconnect(); proc.onaudioprocess = null; proc = null; }
      if (srcNode) { srcNode.disconnect(); srcNode = null; }
      if (ctx) { ctx.close().catch(() => {}); ctx = null; }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      eng.running = false;
      eng.ready = false;
      eng.latest = null;
      eng.levels = [];
      ringPos = 0; ringFilled = 0; level = 0;
    },
  };

  function tick() {
    if (!classifier || ringFilled < ring.length) return;
    // 링 버퍼를 시간 순서대로 편다
    const buf = new Float32Array(ring.length);
    buf.set(ring.subarray(ringPos));
    buf.set(ring.subarray(0, ringPos), ring.length - ringPos);
    let results = null;
    try { results = classifier.classify(buf, ctx.sampleRate); } catch (e) { return; }
    const r = results && results[results.length - 1];
    const cats = r && r.classifications && r.classifications[0] && r.classifications[0].categories;
    if (!cats) return;
    const vec = new Float32Array(SOUND_DIM);
    for (const c of cats) if (c.index < SOUND_DIM) vec[c.index] = c.score;
    const top = cats.slice().sort((a, b) => b.score - a.score).slice(0, 8)
      .map(c => ({ name: c.categoryName, score: c.score }));
    eng.latest = { vec, top, level };
    eng.levels.push(level);
    if (eng.levels.length > 96) eng.levels.shift();
    eng.ready = true;
    if (eng.onTick) eng.onTick(eng.latest);
  }

  return eng;
}

// 파형 그리기 — 마이크 상자 캔버스에 최근 소리 크기를 막대로
export function drawLevels(cv, levels, color) {
  const W = cv.clientWidth || 300, H = cv.clientHeight || 160;
  if (cv.width !== W * 2) { cv.width = W * 2; cv.height = H * 2; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const n = 48;
  const bw = W / n;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const v = levels[levels.length - n + i] || 0;
    const h = Math.max(2, Math.min(1, v * 6) * (H - 12));
    ctx.globalAlpha = 0.35 + 0.65 * (i / n);
    ctx.fillRect(i * bw + bw * 0.2, (H - h) / 2, bw * 0.6, h);
  }
  ctx.globalAlpha = 1;
}
