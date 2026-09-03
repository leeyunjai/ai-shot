# 개발·배포 안내 (for developers)

사용자용 소개는 [README.md](./README.md)를 보세요. 이 문서는 개발·운영 전용입니다.

## 원칙

- 백엔드 없음 — 전부 정적 파일. 외부 CDN 금지, 라이브러리·모델 전부 셀프호스팅
- 최초 로드 후 오프라인 동작
- 코드·README에 계정명·절대 URL 하드코딩 금지 (조직 이전 대비, 전부 상대경로)
- 디자인은 자매 서비스(파이보 랩)와 동일 — 공용 규격은 [design/](./design/) 참고
- 사진·모델은 브라우저 밖으로 나가지 않는다. 업로드 경로를 만들지 말 것

## 실행

`file://` 로는 열 수 없습니다. 반드시 http 로 서빙하세요.

```bash
npx http-server -p 8080          # 또는
python3 -m http.server 8080
```

### MIME 주의

서버가 아래 타입을 내보내야 합니다. 틀리면 wasm 스트리밍 컴파일이 실패합니다.

| 확장자 | MIME |
|---|---|
| `.wasm` | `application/wasm` |
| `.task` / `.tflite` | `application/octet-stream` |
| `.mjs` | `text/javascript` |

Go 서버(`pibo-server` 계열) 사용 시 `mime.AddExtensionType` 로 명시 등록하세요.

## 구조

```
index.html      촬영실  — 동작이 셔터
train.html      제스처 만들기 — 나만의 동작 학습
gallery.html    갤러리  — 찍은 사진 + 가르친 제스처
css/
  ui.css             공통 UI 규격 (파이보 랩과 동일)
  theme-maker.css    학습지 테마 (파이보 랩과 동일)
  app.css            이 서비스 전용
lib/
  nav.js             헤더/탭/전체화면
  landmarker.js      MediaPipe 로드/전환/추론 (GPU 실패 시 CPU 폴백)
  sound.js           마이크 + YAMNet 소리 분류 (16kHz, 250ms 주기, 521차원)
  features.js        특징 벡터 전처리 + 내장 신호 (손 63 / 얼굴 52 / 포즈 75 / 소리 521)
  trainer.js         TF.js 분류기 학습 (Dense32-Dropout-Softmax, CPU 백엔드)
  shutter.js         셔터 상태 기계 (hold → count → shoot → cool)
  photos.js          찍은 사진 저장 (IndexedDB, Blob)
  store.js           모델 저장 + zip 내보내기/불러오기
  bgfx.js            배경 바꾸기 (셀피 세그멘테이션)
  i18n.js            한/영 토글 (파이보 랩과 같은 방식)
  tour.js            튜토리얼
  shoot.js / train.js / gallery.js   페이지 로직
vendor/
  tasks-vision/      @mediapipe/tasks-vision wasm + vision_bundle.mjs
  tasks-audio/       @mediapipe/tasks-audio wasm + audio_bundle.mjs (소리)
  tfjs/              @tensorflow/tfjs tf.min.js
models/              hand / face / pose_lite .task + selfie_segmenter(배경) ·
                     yamnet(소리) .tflite
assets/fonts/        Pretendard (셀프호스팅)
assets/img/          캐릭터·로고·앱 아이콘
design/              공용 디자인 킷 (maker-ui.css + 미리보기)
```

## 셔터가 도는 방식

`shutter.js` 는 `setTimeout` 을 쓰지 않고 화면 루프에서 `tick(now, matched)`
로 굴러갑니다. 탭이 백그라운드로 가면 타이머는 느려지고 프레임은 아예
멈추는데, 프레임 기준으로 세면 둘이 어긋나지 않습니다.

```
idle ─ 조건 맞음 ─▶ hold ─ 유지시간 채움 ─▶ count ─ 0 ─▶ shoot ─▶ cool ─▶ idle
         ▲              │
         └── 조건 풀림 ──┘
```

건드릴 때 주의할 상수 (`lib/shutter.js`):

- `MISS_GRACE_MS = 220` — 인식은 한두 프레임씩 깜빡입니다. 잠깐 놓친 것으로
  유지시간을 되돌리지 않습니다. 0 으로 두면 실기기에서 거의 안 찍힙니다.
- `BURST_GAP_MS = 420` — 연사 간격.
- `cooldownMs = 1500` (`shoot.js` 에서 주입) — 찍은 직후 재발동을 막습니다.
  셔터음이 마이크로 되돌아와 소리 트리거가 연쇄 발동하는 것도 이게 막습니다.
  소리 트리거를 쓰면서 이 값을 줄이면 연쇄 촬영이 납니다.

내 모델 판정 기준은 `shoot.js` 의 `MODEL_THRESHOLD = 0.75` 입니다. 낮추면 잘
찍히고 오발이 늘어납니다. 유지시간 슬라이더가 이미 같은 역할을 하므로 먼저
그쪽을 권하세요.

## 사진 저장

- IndexedDB `ai-shot-photos` / 스토어 `photos` (keyPath `id`)
- Blob 그대로 넣습니다. dataURL 로 바꾸면 용량이 33% 늘고 느립니다.
- 화면에 걸 때만 `URL.createObjectURL` 을 만들고, 지우거나 페이지를 떠날 때
  반드시 `revokeObjectURL` 합니다. 빠뜨리면 갤러리에서 메모리가 샙니다.

모델 메타는 별도 DB(`sense-lab`)에 그대로 둡니다. **이 이름을 바꾸지 마세요** —
브라우저가 새 빈 DB로 인식해서 이미 저장된 모델이 전부 안 보이게 됩니다.

## 벤더 파일 갱신

```bash
npm i @mediapipe/tasks-vision @mediapipe/tasks-audio @tensorflow/tfjs
cp node_modules/@mediapipe/tasks-vision/wasm/*        vendor/tasks-vision/
cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs vendor/tasks-vision/
cp node_modules/@mediapipe/tasks-audio/wasm/audio_wasm*   vendor/tasks-audio/
cp node_modules/@mediapipe/tasks-audio/audio_bundle.mjs   vendor/tasks-audio/
cp node_modules/@tensorflow/tfjs/dist/tf.min.js       vendor/tfjs/
```

`.task`/`.tflite` 모델은 MediaPipe 공식 모델 저장소에서 받아 `models/` 에 둡니다
(hand_landmarker, face_landmarker, pose_landmarker_lite — 포즈는 lite 고정,
selfie_segmenter, yamnet).
`node_modules` 는 커밋하지 않고, 벤더 파일은 커밋합니다.

## 배포

- 지금은 **GitHub Pages** 만 씁니다: `main` 에 올리면 그대로 서빙됩니다.
  Settings → Pages → Deploy from a branch → `main` / `/ (root)`
- `.nojekyll` 이 루트에 있어야 합니다. Jekyll 은 밑줄로 시작하는 경로(`_headers`)를
  건너뛰고 소스로 판단한 파일을 다시 씁니다
- **Cloudflare 배포는 보류 중입니다.** `wrangler.toml` 과 `.assetsignore` 는
  그대로 두었고, `npx wrangler deploy` 를 실행하지 않는 한 아무 동작도 하지
  않습니다. 다시 켤 때 워커 이름은 `ai-shot` 입니다
- 캐시 버스팅: 코드 파일만 `?v=N`. 모델·wasm 파일에는 붙이지 않습니다
- 모든 자산 경로는 상대경로 — 하위 경로(`/ai-shot/`) 서빙에서도 동작합니다

## 오프라인 exe

`v*` 태그를 푸시하면 GitHub Actions 가 사이트 전체를 담은 단일
`AIShot.exe` 를 빌드해 Release 에 첨부합니다 (인터넷 없이 동작).

```bash
git tag v0.1.0 && git push origin v0.1.0
```

- 구성: `.github/workflows/build-exe.yml` + `tools/portable/` (Go embed 서버)
- 서버는 `.wasm`/`.task`/`.tflite`/`.mjs` MIME 을 명시 등록합니다
- Actions 탭에서 workflow_dispatch 로 수동 빌드도 가능합니다
