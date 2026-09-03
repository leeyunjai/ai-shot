# 개발·배포 안내

사용자용 소개는 [README.md](./README.md).

## 원칙

- 백엔드 없음 — 전부 정적 파일. 외부 CDN 금지, 라이브러리·모델 전부 셀프호스팅
- 최초 로드 후 오프라인 동작
- 계정명·절대 URL 하드코딩 금지 (전부 상대경로 — 하위 경로 배포 대비)
- 사진·모델은 브라우저 밖으로 나가지 않는다. 업로드 경로를 만들지 말 것

## 실행

`file://` 로는 못 연다. http 로 서빙할 것.

```bash
python3 -m http.server 8080      # 또는 npx http-server -p 8080
```

MIME 이 틀리면 wasm 스트리밍 컴파일이 실패한다:
`.wasm` → `application/wasm`, `.task`/`.tflite` → `application/octet-stream`,
`.mjs` → `text/javascript`.

## 구조

```
index.html      앱 셸 한 장 — 촬영/학습을 시트 안에서 좌우로 넘긴다
gallery.html    사진 + 가르친 동작
css/app.css     앱 셸 전부 (색 토큰 내장)
lib/
  app.js          셸 배선 — 판 넘기기·시트·소스 칩·모드에 따른 셔터
  engine.js       카메라·마이크·감지기 (촬영/학습 공용) + cover 맞춤
  mode-shoot.js   촬영 — 트리거 선택, HUD, 게이지, 촬영
  mode-train.js   학습 — 예시 모으기, 학습, 저장
  shutter.js      셔터 상태 기계 (hold → count → shoot → cool)
  photos.js       찍은 사진 저장 (IndexedDB, Blob)
  landmarker.js   MediaPipe 로드/추론 (GPU 실패 시 CPU 폴백)
  sound.js        마이크 + YAMNet (16kHz, 250ms 주기, 521차원)
  features.js     특징 벡터 + 내장 신호 (손 63 / 얼굴 52 / 포즈 75 / 소리 521)
  trainer.js      TF.js 분류기 (Dense32-Dropout-Softmax, CPU 백엔드)
  store.js        모델 저장 + zip 주고받기
  bgfx.js         배경 바꾸기 (셀피 세그멘테이션)
  nav.js          떠 있는 상단 바 · i18n.js 한/영 · tour.js 튜토리얼
  gallery.js      갤러리 페이지
vendor/           tasks-vision · tasks-audio · tfjs (셀프호스팅)
models/           hand/face/pose_lite .task · selfie_segmenter · yamnet .tflite
design/           웹 도구 쪽 공용 디자인 킷 (이 앱에서는 쓰지 않는다)
```

### 왜 엔진이 하나인가

촬영과 학습이 한 화면에 있으므로 `getUserMedia` 와 랜드마커는 하나만 둔다.
모드마다 부르면 카메라가 두 번 열리고, 기기에 따라 두 번째가 그냥 실패한다.
`engine.js` 가 프레임마다 한 번 감지해서 두 모드에 같은 결과를 넘긴다.

### 화면 채우기(cover) 와 오버레이

비디오에 `object-fit:cover` 를 걸면 잘린 만큼 랜드마크 오버레이가 어긋난다.
그래서 video 와 캔버스를 `#frame` 한 장에 넣고, `#frame` 을 무대를 덮는
크기로 `engine.fit()` 이 직접 키운다. 셋 다 `#frame` 을 100% 로 채우니 항상
맞는다. 좌우 반전도 `#frame` 에 한 번만 건다 — 개별 요소에 걸지 말 것.

사진은 잘리지 않은 원본 프레임 전체를 저장한다. 화면은 cover 로 잘라
보여 주지만 저장할 때 버릴 이유가 없다.

좌우 방향은 촬영 시트의 **거울로 저장** 토글이 정한다 (기본 켜짐 = 화면에
보이던 그대로). 끄면 카메라가 실제로 본 방향으로 저장된다. 뼈대 선도 같은
변환 안에서 그리므로 어느 쪽이든 영상과 맞는다. 레코드에 `mirrored` 로
남는다.

### 테마

`css/theme-maker.css`(학습지 종이 테마)는 이 앱에서 쓰지 않는다. 흰 종이
바탕 + 흰 헤더 상자 + 명조 제목을 전제하는 문서형 레이아웃용이라, 화면을
카메라로 채우는 앱에는 정반대로 걸린다. 대신 파이보 계열 강조색(`#1F5F7A`)을
`app.css` 안에 그대로 가져와 한 제품으로 보이게 했다.

### 만질 때 주의할 상수

`lib/shutter.js`

- `MISS_GRACE_MS = 220` — 인식은 한두 프레임씩 깜빡인다. 잠깐 놓친 것으로
  유지시간을 되돌리지 않는다. 0 으로 두면 실기기에서 거의 안 찍힌다.
- `BURST_GAP_MS = 420` — 연사 간격
- `cooldownMs = 1500` (`mode-shoot.js` 에서 주입) — 찍은 직후 재발동 차단.
  셔터음이 마이크로 되돌아와 소리 트리거가 연쇄 발동하는 것도 이게 막는다.
  소리 트리거를 쓰면서 줄이면 연쇄 촬영이 난다.
- 타이머(`setTimeout`)를 쓰지 않고 화면 루프에서 굴린다. 탭이 백그라운드로
  가면 타이머는 느려지고 프레임은 멈추는데, 프레임 기준으로 세면 어긋나지
  않는다.

`lib/mode-shoot.js`

- `MODEL_THRESHOLD = 0.75` — 낮추면 잘 찍히고 오발이 늘어난다. 유지시간
  슬라이더가 이미 같은 역할을 하니 그쪽을 먼저 권할 것.

### 저장소

- 사진: IndexedDB `ai-shot-photos` / `photos`, Blob 그대로.
  dataURL 로 바꾸면 용량 33% 늘고 느리다. 화면에 걸 때만 `createObjectURL`
  하고 지울 때·페이지 떠날 때 반드시 `revokeObjectURL`.
- 모델: IndexedDB `sense-lab`. **이 이름을 바꾸지 말 것** — 브라우저가 새 빈
  DB 로 인식해서 이미 저장된 모델이 전부 안 보이게 된다.

## 벤더 파일 갱신

```bash
npm i @mediapipe/tasks-vision @mediapipe/tasks-audio @tensorflow/tfjs
cp node_modules/@mediapipe/tasks-vision/wasm/*             vendor/tasks-vision/
cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs  vendor/tasks-vision/
cp node_modules/@mediapipe/tasks-audio/wasm/audio_wasm*    vendor/tasks-audio/
cp node_modules/@mediapipe/tasks-audio/audio_bundle.mjs    vendor/tasks-audio/
cp node_modules/@tensorflow/tfjs/dist/tf.min.js            vendor/tfjs/
```

모델은 MediaPipe 공식 저장소에서 받아 `models/` 에. `node_modules` 는 커밋
안 하고, 벤더 파일은 커밋한다.

## 배포

- **GitHub Pages** 만 쓴다: `main` 에 올리면 서빙된다
  (Settings → Pages → Deploy from a branch → `main` / `/ (root)`)
- `.nojekyll` 이 루트에 있어야 한다 — Jekyll 은 `_headers` 같은 밑줄 경로를
  건너뛰고 소스로 판단한 파일을 다시 쓴다
- **Cloudflare 는 보류.** `wrangler.toml`·`.assetsignore` 는 그대로 두었고
  `npx wrangler deploy` 를 실행하지 않는 한 아무 동작도 하지 않는다
  (다시 켤 때 워커 이름은 `ai-shot`)
- 캐시 버스팅: 코드 파일만 `?v=N`. 모델·wasm 에는 붙이지 않는다

## 오프라인 exe

`v*` 태그를 푸시하면 Actions 가 사이트 전체를 담은 단일 `AIShot.exe` 를
빌드해 Release 에 붙인다 (`.github/workflows/build-exe.yml` +
`tools/portable/` Go embed 서버).

```bash
git tag v0.1.0 && git push origin v0.1.0
```
