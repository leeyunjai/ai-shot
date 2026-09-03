// ═══════════════════════════════════════════════════════════
// 분류기 학습 — TF.js
// ═══════════════════════════════════════════════════════════
// 입력 D차원 → Dense(32, relu) → Dropout(0.2) → Dense(N, softmax)
// adam(0.001) / categoricalCrossentropy / epochs 50 / batch 16 / validationSplit 0.2
// 클래스 2~6개 × 샘플 20~100장 기준으로 1~2초 안에 끝난다.
//
// tf 는 vendor/tfjs/tf.min.js 가 전역으로 제공한다.

export const EPOCHS = 50;

// 이 크기의 모델(입력 수십 차원 → Dense 32)은 webgl 백엔드의 셰이더 컴파일·
// 텍스처 업로드 오버헤드가 계산보다 훨씬 크다. CPU 백엔드가 항상 빠르다 (약 1초).
// MediaPipe 는 자체 delegate 로 따로 돌므로 영향 없다.
await tf.setBackend('cpu');
await tf.ready();

export function buildModel(dim, numClasses) {
  const m = tf.sequential();
  m.add(tf.layers.dense({ inputShape: [dim], units: 32, activation: 'relu' }));
  m.add(tf.layers.dropout({ rate: 0.2 }));
  m.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
  m.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });
  return m;
}

// vecs: Float32Array[], labels: int[] (같은 길이)
// onEpoch(epoch, total, {loss, acc, valLoss, valAcc}) 로 진행을 알린다.
export async function trainModel(vecs, labels, numClasses, dim, onEpoch) {
  const xs = vecs.slice(), ys = labels.slice();
  // validationSplit 은 뒤쪽 20% 를 떼므로 반드시 먼저 섞는다
  tf.util.shuffleCombo(xs, ys);

  const X = tf.tensor2d(xs.map(v => Array.from(v)), [xs.length, dim]);
  const Y = tf.oneHot(tf.tensor1d(ys, 'int32'), numClasses);

  const model = buildModel(dim, numClasses);
  const history = [];
  try {
    await model.fit(X, Y, {
      epochs: EPOCHS,
      batchSize: 16,
      shuffle: true,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: async (ep, logs) => {
          const rec = {
            loss: logs.loss,
            acc: logs.acc != null ? logs.acc : logs.accuracy,
            valLoss: logs.val_loss,
            valAcc: logs.val_acc != null ? logs.val_acc : logs.val_accuracy,
          };
          history.push(rec);
          if (onEpoch) onEpoch(ep + 1, EPOCHS, rec);
          await tf.nextFrame();          // 화면(진행률 바)이 멈추지 않게 한 프레임 양보
        },
      },
    });
  } catch (e) {
    X.dispose(); Y.dispose(); model.dispose();
    throw e;
  }

  // 전체 샘플로 혼동 행렬(헷갈린 표)을 만든다.
  // 수업용이라 "어떤 종류끼리 헷갈리는지" 경향만 보이면 된다.
  const pred = tf.tidy(() => model.predict(X).argMax(-1));
  const predArr = await pred.data();
  pred.dispose();
  const confusion = Array.from({ length: numClasses }, () => new Array(numClasses).fill(0));
  let correct = 0;
  for (let i = 0; i < ys.length; i++) {
    confusion[ys[i]][predArr[i]]++;
    if (ys[i] === predArr[i]) correct++;
  }
  const accuracy = ys.length ? correct / ys.length : 0;

  X.dispose(); Y.dispose();
  return { model, history, confusion, accuracy };
}

// 한 장 추론 → 확률 배열(Float32Array)
export function predictProbs(model, vec) {
  return tf.tidy(() => {
    const out = model.predict(tf.tensor2d([Array.from(vec)]));
    const data = out.dataSync();
    return Float32Array.from(data);
  });
}
