// ═══════════════════════════════════════════════════════════
// 사진 보관 — 찍은 사진을 브라우저에 저장한다
// ═══════════════════════════════════════════════════════════
//  · IndexedDB 'ai-shot-photos' / 스토어 'photos' (keyPath: id)
//  · 사진은 Blob 그대로 넣는다. dataURL 로 바꾸면 용량이 33% 늘고 느리다.
//  · 어디로도 전송하지 않는다. 이 브라우저 안에만 있다.
//
// 레코드: { id, blob, w, h, at, trigger, effect }
//   id      정렬 가능한 문자열 (시각 + 난수)
//   at      ISO 문자열
//   trigger 무엇으로 찍혔는지 (화면 표시용 문구)
//   effect  배경 효과 이름 (off | erase | blur | green | blue)

const DB_NAME = 'ai-shot-photos', STORE = 'photos', VER = 1;

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, VER);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return dbp;
}

function tx(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const rq = fn(t.objectStore(STORE));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  }));
}

// 시각순으로 정렬되는 id — 같은 밀리초에 여러 장(연사)이 들어와도 안 겹친다
function newId() {
  return String(Date.now()).padStart(14, '0') + '-' +
    Math.random().toString(36).slice(2, 7);
}

export const Photos = {
  async add(blob, meta) {
    const rec = Object.assign({
      id: newId(),
      blob,
      at: new Date().toISOString(),
      w: 0, h: 0, trigger: '', effect: 'off',
    }, meta || {});
    rec.blob = blob;
    await tx('readwrite', s => s.put(rec));
    return rec;
  },

  // 최근에 찍은 것이 먼저 온다
  async list() {
    const a = await tx('readonly', s => s.getAll());
    return (a || []).sort((x, y) => (y.id || '').localeCompare(x.id || ''));
  },

  async get(id) { return tx('readonly', s => s.get(id)); },

  async remove(id) { return tx('readwrite', s => s.delete(id)); },

  async clear() { return tx('readwrite', s => s.clear()); },

  async count() { return tx('readonly', s => s.count()); },
};

// 파일 이름: aishot-20260903-142530-ab12.jpg
export function fileNameOf(rec) {
  const d = new Date(rec.at || Date.now());
  const p = n => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  const tail = String(rec.id || '').split('-')[1] || '0000';
  return 'aishot-' + stamp + '-' + tail + '.jpg';
}

// 한 장 내려받기
export function download(rec) {
  const url = URL.createObjectURL(rec.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameOf(rec);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 전부 zip 하나로 내려받기 (JSZip 전역)
export async function downloadAllZip(recs) {
  const zip = new JSZip();
  recs.forEach(r => zip.file(fileNameOf(r), r.blob));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aishot-photos.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
