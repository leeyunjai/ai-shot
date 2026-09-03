// ═══════════════════════════════════════════════════════════
// 엔진 — 카메라 · 마이크 · 감지기를 두 모드가 함께 쓴다
// ═══════════════════════════════════════════════════════════
// 촬영과 학습이 한 화면에 있으므로 스트림과 랜드마커는 하나만 둔다.
// getUserMedia 를 모드마다 부르면 카메라가 두 번 열리고, 기기에 따라
// 두 번째 호출이 그냥 실패한다.
//
// 화면 채우기(cover) 주의:
//   비디오에 object-fit:cover 를 걸면 잘린 만큼 오버레이 좌표가 어긋난다.
//   그래서 video 와 캔버스를 #frame 한 장에 넣고, #frame 을 화면을 덮는
//   크기로 JS 가 직접 키운다. 셋 다 #frame 을 100% 로 채우니 항상 맞는다.
//   좌우 반전도 #frame 에 한 번만 건다.

import { loadLandmarker, drawResult, accentColor } from './landmarker.js';
import { extract, computeSignals, soundSignals } from './features.js';
import { createSoundEngine, preloadSound, drawLevels } from './sound.js';
import { createBgFx } from './bgfx.js';

const $ = id => document.getElementById(id);

export function createEngine(opts) {
  const o = opts || {};
  const video = $('camVid'), ovCv = $('ovCv'), bgCv = $('bgCv'), micCv = $('micCv');
  const stage = $('stage'), frame = $('frame');

  const snd = createSoundEngine();
  const bg = createBgFx(video, bgCv);

  let source = 'hand';
  let lm = null, loading = false;
  let stream = null;
  let devices = [];
  let variantProvider = () => null;
  const subs = [];

  const lmCache = {};
  function getLm(src) {
    if (!lmCache[src]) {
      lmCache[src] = loadLandmarker(src).catch(e => { lmCache[src] = null; throw e; });
    }
    return lmCache[src];
  }

  let preloaded = false;
  function preloadRest() {
    if (preloaded) return;
    preloaded = true;
    setTimeout(async () => {
      for (const s of ['hand', 'face', 'pose']) {
        try { await getLm(s); } catch (e) { /* 무시 — 누를 때 다시 시도 */ }
      }
      preloadSound();
    }, 1200);
  }

  function status(s) { if (o.onStatus) o.onStatus(s); }

  // ── 소스 ──
  async function setSource(next) {
    if (loading || next === source) return;
    loading = true;
    status('loading');
    lm = null;
    try {
      if (next === 'sound') { await preloadSound(); micOn(); }
      else { lm = await getLm(next); micStop(); }
      source = next;
      status('ready');
    } catch (e) {
      console.error(e);
      status('failed');
    }
    loading = false;
    if (o.onSource) o.onSource(source);
    preloadRest();
  }

  async function initSource() {
    status('loading');
    try { lm = await getLm(source); status('ready'); }
    catch (e) { console.error(e); status('failed'); }
    if (o.onSource) o.onSource(source);
    preloadRest();
  }

  // ── 카메라 ──
  async function listCams() {
    try {
      devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    } catch (e) { devices = []; }
    if (o.onDevices) o.onDevices(devices);
    return devices;
  }

  async function camOn(deviceId) {
    if (stream) return true;
    try {
      const want = { width: { ideal: 1280 }, height: { ideal: 720 } };
      if (deviceId) want.deviceId = { exact: deviceId };
      else want.facingMode = 'user';
      stream = await navigator.mediaDevices.getUserMedia({ video: want, audio: false });
      video.srcObject = stream;
      await video.play();
      video.addEventListener('loadedmetadata', fit);
      fit();
      await listCams();
      if (o.onCam) o.onCam(true);
      return true;
    } catch (e) {
      console.error(e);
      if (o.onError) o.onError('cam');
      return false;
    }
  }

  function camStop() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.srcObject = null;
    if (o.onCam) o.onCam(false);
  }

  // 카메라가 여러 개면 다음 것으로 돌린다 (폰의 전/후면 전환)
  async function flipCam() {
    if (!devices.length) await listCams();
    if (devices.length < 2) return false;
    const cur = stream && stream.getVideoTracks()[0];
    const id = cur && cur.getSettings ? cur.getSettings().deviceId : null;
    let i = devices.findIndex(d => d.deviceId === id);
    i = (i + 1) % devices.length;
    camStop();
    await camOn(devices[i].deviceId);
    return true;
  }

  function camReady() { return !!(stream && video.videoWidth); }

  // ── 마이크 ──
  async function micOn() {
    if (snd.running) return true;
    try { await snd.start(); return true; }
    catch (e) { console.error(e); if (o.onError) o.onError('mic'); return false; }
  }
  function micStop() { if (snd.running) snd.stop(); }

  // ── 화면 채우기 ──
  // #frame 을 무대보다 크게 키워 빈 곳이 없게 한다 (object-fit:cover 와 같은 결과).
  function fit() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh || !stage) return;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return;
    const scale = Math.max(sw / vw, sh / vh);
    frame.style.width = Math.ceil(vw * scale) + 'px';
    frame.style.height = Math.ceil(vh * scale) + 'px';
    if (ovCv.width !== vw) { ovCv.width = vw; ovCv.height = vh; }
  }

  let fitTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fit, 80);
  });

  // ── 루프 ──
  // 프레임마다 한 번만 감지하고, 결과를 두 모드에 함께 넘긴다.
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const ready = camReady();
    if (ready) bg.tick(now);

    let result = null, sig = null, sound = null;

    if (source === 'sound') {
      clearOverlay();
      if (snd.running) drawLevels(micCv, snd.levels, accentColor());
      const latest = snd.latest;
      if (latest) sound = { vec: latest.vec, level: latest.level, top: latest.top,
        sig: soundSignals(latest.vec, latest.level) };
    } else if (ready && lm) {
      try { result = lm.detect(video, now); } catch (e) { result = null; }
      sig = computeSignals(source, result, video.videoWidth, video.videoHeight);
      drawOverlay(result);
    } else {
      clearOverlay();
    }

    const f = { now, source, ready, result, sig, sound };
    for (let i = 0; i < subs.length; i++) subs[i](f);
  }

  function clearOverlay() {
    const ctx = ovCv.getContext('2d');
    ctx && ctx.clearRect(0, 0, ovCv.width, ovCv.height);
  }

  function drawOverlay(result) {
    const vw = video.videoWidth;
    if (ovCv.width !== vw) fit();
    const ctx = ovCv.getContext('2d');
    ctx.clearRect(0, 0, ovCv.width, ovCv.height);
    if (!result) return;
    const variant = variantProvider();
    if (extract(source, result, variant)) drawResult(ctx, source, result, variant);
  }

  loop();

  return {
    snd, bg,
    get source() { return source; },
    get devices() { return devices; },
    setSource, initSource,
    camOn, camStop, flipCam, camReady, listCams, fit,
    micOn, micStop,
    onFrame(fn) { subs.push(fn); },
    setVariantProvider(fn) { variantProvider = fn || (() => null); },
    video, ovCv, bgCv,
  };
}
