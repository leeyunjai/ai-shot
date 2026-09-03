// ═══════════════════════════════════════════════════════════
// 배경 놀이 — 셀피 세그멘테이션으로 사람과 배경을 분리한다
// ═══════════════════════════════════════════════════════════
// 판정에는 쓰지 않는 시각 효과다. "AI가 픽셀을 사람/배경으로 나눈다"를
// 눈으로 보여주는 교육 장치이기도 하다.
//
//  · 효과가 꺼져 있으면 아무 것도 하지 않는다 (비용 0)
//  · 켜면 비디오를 숨기고, 같은 자리의 캔버스에 합성해서 그린다
//  · 모델은 selfie_segmenter.tflite (약 250KB, 셀프호스팅)

import { loadSegmenter } from './landmarker.js';

export function createBgFx(video, canvas) {
  let mode = 'off';            // off | erase | blur | green | blue
  let seg = null, loading = false;
  let lastTs = -1;
  const person = document.createElement('canvas');
  const maskCv = document.createElement('canvas');

  function setMode(m) {
    mode = m;
    const on = m !== 'off';
    canvas.style.display = on ? '' : 'none';
    video.style.visibility = on ? 'hidden' : '';
    if (on && !seg && !loading) {
      loading = true;
      loadSegmenter().then(s => { seg = s; loading = false; })
        .catch(e => { loading = false; console.error(e); });
    }
    if (!on) {
      const ctx = canvas.getContext('2d');
      ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // 매 프레임 호출 — 꺼져 있으면 바로 돌아온다
  function tick(now) {
    if (mode === 'off' || !seg || !video.videoWidth) return;
    if (now <= lastTs) now = lastTs + 1;
    lastTs = now;

    let res = null;
    try { res = seg.segmentForVideo(video, now); } catch (e) { return; }
    const mask = res && res.confidenceMasks && res.confidenceMasks[0];
    if (!mask) { res && res.close && res.close(); return; }

    const w = video.videoWidth, h = video.videoHeight;
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
    if (person.width !== w) { person.width = w; person.height = h; }
    const mw = mask.width, mh = mask.height;
    if (maskCv.width !== mw) { maskCv.width = mw; maskCv.height = mh; }

    // 마스크(사람일 확률) → 알파 채널
    const data = mask.getAsFloat32Array();
    const mctx = maskCv.getContext('2d');
    const id = mctx.createImageData(mw, mh);
    for (let i = 0; i < data.length; i++) {
      id.data[i * 4 + 3] = data[i] > 0.5 ? 255 : 0;
    }
    mctx.putImageData(id, 0, 0);

    // 사람만 오려낸다: 비디오 ∩ 마스크
    const pctx = person.getContext('2d');
    pctx.globalCompositeOperation = 'source-over';
    pctx.drawImage(video, 0, 0, w, h);
    pctx.globalCompositeOperation = 'destination-in';
    pctx.drawImage(maskCv, 0, 0, w, h);

    // 배경을 깔고 사람을 얹는다
    const ctx = canvas.getContext('2d');
    if (mode === 'blur') {
      ctx.filter = 'blur(10px)';
      ctx.drawImage(video, 0, 0, w, h);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = mode === 'green' ? '#35CE68'
        : mode === 'blue' ? '#3D8BFF'
        : '#FBF7EF';               // erase: 학습지 종이색
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(person, 0, 0);

    try { mask.close && mask.close(); res.close && res.close(); } catch (e) { /* 무시 */ }
  }

  return { setMode, tick, get mode() { return mode; } };
}
