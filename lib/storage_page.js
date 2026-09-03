// ═══════════════════════════════════════════════════════════
// 보관함 — 저장한 모델 목록 / 이름 바꾸기 / 지우기 / 내보내기 / 불러오기
// ═══════════════════════════════════════════════════════════

import { Store, exportZip, importZip } from './store.js';
import { SOURCE_LABELS } from './features.js';

const $ = id => document.getElementById(id);
const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
}

async function render() {
  let list = [];
  try { list = await Store.list(); } catch (e) { console.error(e); }
  $('stEmpty').style.display = list.length ? 'none' : '';
  $('stTable').style.display = list.length ? '' : 'none';
  const body = $('stBody');
  body.innerHTML = '';
  list.forEach(m => {
    const tr = document.createElement('tr');

    const nm = document.createElement('td');
    nm.className = 'nm'; nm.textContent = m.name;
    tr.appendChild(nm);

    const src = document.createElement('td');
    src.textContent = T(SOURCE_LABELS[m.source] || m.source || '-');
    tr.appendChild(src);

    const cls = document.createElement('td');
    cls.textContent = (m.classes || []).join(', ');
    tr.appendChild(cls);

    const cnt = document.createElement('td');
    cnt.className = 'num';
    cnt.textContent = (m.sampleCount || []).reduce((a, b) => a + b, 0) + T('장');
    tr.appendChild(cnt);

    const acc = document.createElement('td');
    acc.className = 'num';
    acc.textContent = m.accuracy != null ? Math.round(m.accuracy * 100) + '%' : '-';
    tr.appendChild(acc);

    const dt = document.createElement('td');
    dt.className = 'num'; dt.textContent = fmtDate(m.createdAt);
    tr.appendChild(dt);

    const ops = document.createElement('td');
    ops.style.whiteSpace = 'nowrap'; ops.style.textAlign = 'right';
    const mk = (icon, title, fn, warn) => {
      const b = document.createElement('button');
      b.className = 'db' + (warn ? ' danger' : '');
      b.title = title;
      b.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
      b.style.marginLeft = '4px';
      b.addEventListener('click', fn);
      return b;
    };
    if (m.examples && m.examples.length) {
      ops.appendChild(mk('fa-graduation-cap', T('이어서 배우기'), () => {
        location.href = 'index.html?load=' + encodeURIComponent(m.name);
      }));
    }
    ops.appendChild(mk('fa-pen', T('이름 바꾸기'), () => rename(m.name)));
    ops.appendChild(mk('fa-download', T('내보내기'), () => doExport(m.name)));
    ops.appendChild(mk('fa-trash', T('지우기'), () => remove(m.name), true));
    tr.appendChild(ops);

    body.appendChild(tr);
  });
}

async function rename(name) {
  const next = prompt(T('새 이름을 적어 주세요'), name);
  if (next == null) return;
  try {
    if (await Store.rename(name, next)) toast(T('이름을 바꿨어요'));
    await render();
  } catch (e) {
    toast(e.message === 'exists' ? T('같은 이름이 이미 있어요') : T('바꾸지 못했어요'));
  }
}

async function doExport(name) {
  try { await exportZip(name); }
  catch (e) { console.error(e); toast(T('내보내지 못했어요')); }
}

async function remove(name) {
  if (!confirm(T('정말 지울까요?') + ' (' + name + ')')) return;
  try {
    await Store.remove(name);
    toast(T('지웠어요'));
    await render();
  } catch (e) { console.error(e); toast(T('지우지 못했어요')); }
}

async function doImport(file) {
  if (!file) return;
  try {
    const rec = await importZip(file);
    toast(T('들어왔어요') + ': ' + rec.name);
    await render();
  } catch (e) {
    console.error(e);
    toast(T('파일을 읽지 못했어요. 내보낸 zip 이 맞는지 확인해 주세요'));
  }
}

// ── 이벤트 ──
const dz = $('dropZone');
dz.addEventListener('click', () => $('impFile').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('over');
  doImport(e.dataTransfer.files && e.dataTransfer.files[0]);
});
$('impFile').addEventListener('change', e => { doImport(e.target.files[0]); e.target.value = ''; });

$('engine') && ($('engine').textContent = T('준비 완료'));
render();
