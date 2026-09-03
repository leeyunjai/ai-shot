// ═══════════════════════════════════════════════════════════
// 보관함 — 브라우저 저장 (파이보 랩 분류툴의 A안: 브라우저 저장 + 이름 참조)
// ═══════════════════════════════════════════════════════════
//  · 모델 가중치  : model.save('indexeddb://senselab-{name}')  (tf.js 내장)
//  · 메타데이터   : IndexedDB 'sense-lab' / 스토어 'meta' (keyPath: name)
//  · 원본 이미지는 저장하지 않는다. (용량·프라이버시)
//
// 메타데이터 형식 (version 1):
//  { name, source, featureDim, classes, sampleCount, accuracy, createdAt, version }

const DB_NAME = 'sense-lab', META = 'meta', VER = 1;
const MODEL_PREFIX = 'indexeddb://senselab-';

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, VER);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'name' });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return dbp;
}

function tx(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(META, mode);
    const rq = fn(t.objectStore(META));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  }));
}

function clean(name) { return String(name || '').trim(); }

export const Store = {
  modelUrl(name) { return MODEL_PREFIX + clean(name); },

  // model 이 null 이면 메타만 갱신한다 (이름 변경 등)
  async save(name, model, meta) {
    const key = clean(name);
    if (!key) throw new Error('no name');
    if (model) await model.save(this.modelUrl(key));
    const rec = Object.assign({ version: 1 }, meta, { name: key });
    if (!rec.createdAt) rec.createdAt = new Date().toISOString();
    await tx('readwrite', s => s.put(rec));
    return rec;
  },

  async meta(name) { return tx('readonly', s => s.get(clean(name))); },

  async load(name) {
    const meta = await this.meta(name);
    if (!meta) return null;
    const model = await tf.loadLayersModel(this.modelUrl(name));
    return { model, meta };
  },

  async list() {
    const a = await tx('readonly', s => s.getAll());
    return (a || []).sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
  },

  async listBySource(source) {
    return (await this.list()).filter(m => m.source === source);
  },

  async remove(name) {
    try { await tf.io.removeModel(this.modelUrl(name)); } catch (e) { /* 이미 없으면 무시 */ }
    await tx('readwrite', s => s.delete(clean(name)));
  },

  async rename(oldName, newName) {
    const from = clean(oldName), to = clean(newName);
    if (!to || from === to) return false;
    if (await this.meta(to)) throw new Error('exists');
    const meta = await this.meta(from);
    if (!meta) throw new Error('missing');
    await tf.io.copyModel(this.modelUrl(from), this.modelUrl(to));
    await this.save(to, null, Object.assign({}, meta, { name: to }));
    await this.remove(from);
    return true;
  },
};

// ── 내보내기 / 불러오기 ──
// zip 하나에 model.json + weights.bin + meta.json 을 담는다. (JSZip 전역)

export async function exportZip(name) {
  const rec = await Store.load(name);
  if (!rec) throw new Error('missing');
  const a = await rec.model.save(tf.io.withSaveHandler(async x => x));
  rec.model.dispose();

  const zip = new JSZip();
  zip.file('model.json', JSON.stringify({ modelTopology: a.modelTopology, weightSpecs: a.weightSpecs }));
  zip.file('weights.bin', new Uint8Array(a.weightData));
  zip.file('meta.json', JSON.stringify(rec.meta, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const el = document.createElement('a');
  el.href = URL.createObjectURL(blob);
  el.download = name + '.zip';
  el.click();
  URL.revokeObjectURL(el.href);
}

// 같은 zip 을 드롭하면 다시 들어온다. 저장까지 마치고 메타를 돌려준다.
export async function importZip(file) {
  const zip = await JSZip.loadAsync(file);
  const mj = JSON.parse(await zip.file('model.json').async('string'));
  const weights = await zip.file('weights.bin').async('arraybuffer');
  const meta = JSON.parse(await zip.file('meta.json').async('string'));

  const model = await tf.loadLayersModel(tf.io.fromMemory({
    modelTopology: mj.modelTopology, weightSpecs: mj.weightSpecs, weightData: weights,
  }));

  // 같은 이름이 있으면 뒤에 숫자를 붙여 피한다
  let name = clean(meta.name) || file.name.replace(/\.zip$/i, '') || 'model';
  let n = 2;
  while (await Store.meta(name)) name = (clean(meta.name) || 'model') + '-' + (n++);

  const rec = await Store.save(name, model, Object.assign({}, meta, { name }));
  model.dispose();
  return rec;
}
