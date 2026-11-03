'use strict';
/* Ondas – reproductor de música libre con descargas sin conexión.
   Fuentes legales: Internet Archive (CC), Jamendo (CC, requiere client_id gratuito) y archivos propios. */

const $ = s => document.querySelector(s);
const audio = $('#audio');
const view = $('#view');


// ---------- Iconos ----------
const ICONS = {
  wave: '<path d="M3 12h2M7 8v8M11 4v16M15 8v8M19 10v4M21 12h0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  heart: '<path class="h" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  shuffle: '<path d="M3 7h3a5 5 0 0 1 4 2l4 6a5 5 0 0 0 4 2h3M3 17h3a5 5 0 0 0 4-2m4-6a5 5 0 0 1 4-2h3m-3-3 3 3-3 3m0 8 3-3-3-3"/>',
  prev: '<path class="f" d="M7 5h2v14H7zM20 5v14L10 12z"/>',
  next: '<path class="f" d="M15 5h2v14h-2zM4 5v14l10-7z"/>',
  play: '<path class="f" d="M8 5v14l11-7z"/>',
  pause: '<path class="f" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
  repeat: '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3m13-3v2a4 4 0 0 1-4 4H4"/>',
  repeat1: '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3m13-3v2a4 4 0 0 1-4 4H4M11 10l1.5-1v6"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  upload: '<path d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14"/>'
};
const ic = n => `<i><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg></i>`;
const paintIcons = (root = document) => root.querySelectorAll('i[data-i]').forEach(e => { e.outerHTML = ic(e.dataset.i); });
paintIcons();

// ---------- Almacenamiento (IndexedDB) ----------
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('ondas', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const db = await dbp;
  return new Promise((res, rej) => {
    const t = db.transaction('tracks', mode);
    const out = fn(t.objectStore('tracks'));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
};
const dbAll = () => tx('readonly', s => s.getAll());
const dbGet = id => tx('readonly', s => s.get(id));
const dbPut = t => tx('readwrite', s => s.put(t));
const dbDel = id => tx('readwrite', s => s.delete(id));

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('ondas.' + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('ondas.' + k, JSON.stringify(v)); } catch {} }
};

// ---------- Utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => (isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00');
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
const cover = t => t.cover || 'icon.svg';
const online = () => navigator.onLine;

// ---------- Fuentes de música ----------
const IA = 'https://archive.org';
async function iaSearch(q) {
  const query = `(${q}) AND mediatype:audio AND licenseurl:*creativecommons*`;
  const u = `${IA}/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&rows=24&sort[]=downloads+desc&output=json`;
  const j = await (await fetch(u)).json();
  return j.response.docs.map(d => ({ kind: 'album', src: 'ia', id: d.identifier, title: d.title, artist: [].concat(d.creator || [])[0] || 'Varios', cover: `${IA}/services/img/${d.identifier}` }));
}
async function iaTracks(album) {
  const j = await (await fetch(`${IA}/metadata/${encodeURIComponent(album.id)}`)).json();
  const files = (j.files || []).filter(f => /mp3|ogg vorbis/i.test(f.format || ''));
  const mp3 = files.filter(f => /mp3/i.test(f.format));
  const pick = mp3.length ? mp3 : files;
  return pick.map(f => ({
    id: 'ia:' + album.id + '/' + f.name, src: 'ia',
    title: f.title || f.name.replace(/\.[^.]+$/, ''), artist: f.creator || album.artist, album: album.title,
    cover: album.cover, url: `${IA}/download/${encodeURIComponent(album.id)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
    duration: parseFloat(f.length) || 0
  }));
}
async function jamSearch(q) {
  const cid = store.get('jamendo', '');
  if (!cid) throw new Error('Añade tu client_id de Jamendo en Ajustes');
  const u = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(cid)}&format=json&limit=30&audioformat=mp32&search=${encodeURIComponent(q)}`;
  const j = await (await fetch(u)).json();
  return (j.results || []).map(r => ({ id: 'jam:' + r.id, src: 'jam', title: r.name, artist: r.artist_name, album: r.album_name, cover: r.image, url: r.audio, duration: r.duration }));
}

// ---------- Estado del reproductor ----------
let queue = [], idx = -1, shuffle = false, repeat = 0; // repeat: 0 no, 1 todo, 2 una
let curUrl = null;
const saved = new Map(); // id -> track guardado (biblioteca / descargas)

async function refreshSaved() { saved.clear(); (await dbAll()).forEach(t => saved.set(t.id, t)); }

async function playQueue(list, i) { queue = list.slice(); idx = i; renderQueue(); await load(); }
async function load() {
  const t = queue[idx]; if (!t) return;
  const rec = saved.get(t.id);
  if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = null; }
  if (rec && rec.blob) { curUrl = URL.createObjectURL(rec.blob); audio.src = curUrl; }
  else if (!online()) { toast('Sin conexión: esta canción no está descargada'); return next(true); }
  else audio.src = t.url;
  try { await audio.play(); } catch (e) { if (e.name !== 'AbortError') toast('No se pudo reproducir'); }
  $('#ptitle').textContent = t.title; $('#partist').textContent = t.artist || '';
  $('#cover').src = cover(t);
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || '', album: t.album || '', artwork: [{ src: new URL(cover(t), location.href).href }] });
  }
  renderQueue(); markCurrent();
}
function next(auto) {
  if (!queue.length) return;
  if (repeat === 2 && auto === 'ended') { audio.currentTime = 0; audio.play(); return; }
  if (shuffle && queue.length > 1) { let n; do n = Math.floor(Math.random() * queue.length); while (n === idx); idx = n; }
  else if (idx + 1 < queue.length) idx++;
  else if (repeat === 1 || auto !== 'ended') idx = 0;
  else return;
  load();
}
function prev() { if (audio.currentTime > 3) audio.currentTime = 0; else { idx = (idx - 1 + queue.length) % queue.length; load(); } }

$('#play').onclick = () => { if (!audio.src) return; audio.paused ? audio.play() : audio.pause(); };
$('#next').onclick = () => next(); $('#prev').onclick = prev;
$('#shuffle').onclick = e => { shuffle = !shuffle; e.currentTarget.classList.toggle('active', shuffle); };
$('#repeat').onclick = e => { repeat = (repeat + 1) % 3; e.currentTarget.classList.toggle('active', repeat > 0); e.currentTarget.innerHTML = ic(repeat === 2 ? 'repeat1' : 'repeat'); };
$('#volume').oninput = e => audio.volume = e.target.value;
$('#seek').oninput = e => { if (isFinite(audio.duration)) audio.currentTime = audio.duration * e.target.value / 1000; };
$('#queueBtn').onclick = () => { $('#queue').hidden = !$('#queue').hidden; };
$('#closeQ').onclick = () => $('#queue').hidden = true;
audio.onplay = audio.onpause = () => { $('#play').innerHTML = ic(audio.paused ? 'play' : 'pause'); };
audio.onended = () => next('ended');
audio.ontimeupdate = () => { $('#cur').textContent = fmt(audio.currentTime); $('#dur').textContent = fmt(audio.duration); if (isFinite(audio.duration)) $('#seek').value = audio.currentTime / audio.duration * 1000; };
audio.onerror = () => { if (audio.src) { toast('Error al cargar la canción'); } };
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('nexttrack', () => next());
  navigator.mediaSession.setActionHandler('previoustrack', prev);
}
function renderQueue() {
  $('#qlist').innerHTML = queue.map((t, i) => `<li data-i="${i}" class="${i === idx ? 'cur' : ''}">${esc(t.title)}<small>${esc(t.artist)}</small></li>`).join('');
  $('#qlist').onclick = e => { const li = e.target.closest('li'); if (li) { idx = +li.dataset.i; load(); } };
}
function markCurrent() {
  const cur = queue[idx]; document.querySelectorAll('.tracks li').forEach(li => li.classList.toggle('cur', !!cur && li.dataset.id === cur.id));
}

// ---------- Acciones sobre canciones ----------
async function saveTrack(t) { const r = saved.get(t.id) || {}; await dbPut({ ...t, ...r, liked: true, added: r.added || Date.now() }); await refreshSaved(); }
async function toggleLike(t) {
  const r = saved.get(t.id);
  if (r && r.liked) { if (r.blob) await dbPut({ ...r, liked: false }); else await dbDel(t.id); toast('Quitada de la biblioteca'); }
  else { await saveTrack(t); toast('Guardada en la biblioteca'); }
  await refreshSaved();
}
async function download(t, btn) {
  if (!online()) return toast('Necesitas conexión para descargar');
  if (btn) { btn.innerHTML = '<small>…</small>'; btn.disabled = true; }
  try {
    const res = await fetch(t.url);
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    const r = saved.get(t.id) || {};
    await dbPut({ ...t, ...r, blob, added: r.added || Date.now() });
    await refreshSaved(); toast('Disponible sin conexión: ' + t.title);
  } catch (e) { toast('No se pudo descargar (el servidor puede bloquear la descarga directa)'); }
  if (btn) { btn.disabled = false; }
  render();
}
async function removeDownload(t) {
  const r = saved.get(t.id); if (!r) return;
  if (r.liked || r.src === 'local') { const { blob, ...rest } = r; if (r.src === 'local') await dbDel(t.id); else await dbPut(rest); }
  else await dbDel(t.id);
  await refreshSaved(); toast('Descarga eliminada'); render();
}

function trackList(list) {
  const ul = document.createElement('ul'); ul.className = 'tracks';
  list.forEach((t, i) => {
    const r = saved.get(t.id), liked = r && r.liked, off = r && r.blob;
    const li = document.createElement('li'); li.dataset.id = t.id;
    if (queue[idx] && queue[idx].id === t.id) li.className = 'cur';
    li.innerHTML = `<img loading="lazy" src="${esc(cover(t))}" alt="" onerror="this.src='icon.svg'">
      <div class="t"><b>${esc(t.title)}</b><small>${esc(t.artist || '')}${t.album ? ' · ' + esc(t.album) : ''}${off ? ` · <span class="tag" title="Disponible sin conexión">${ic('download')}</span>` : ''}</small></div>
      <div class="acts">
        ${t.src === 'local' ? '' : `<button data-a="like" class="${liked ? 'on' : ''}" title="Biblioteca">${ic('heart')}</button>`}
        ${t.src === 'local' ? '' : `<button data-a="dl" class="${off ? 'on' : ''}" title="${off ? 'Quitar descarga' : 'Descargar para escuchar sin conexión'}">${ic(off ? 'check' : 'download')}</button>`}
        ${t.src === 'local' ? `<button data-a="rm" title="Eliminar">${ic('trash')}</button>` : ''}
        <button data-a="q" title="Añadir a la cola">${ic('plus')}</button>
      </div>`;
    li.querySelector('.t').onclick = li.querySelector('img').onclick = () => playQueue(list, i);
    li.querySelector('.acts').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'like') { await toggleLike(t); render(); }
      else if (b.dataset.a === 'dl') off ? removeDownload(t) : download(t, b);
      else if (b.dataset.a === 'rm') { await dbDel(t.id); await refreshSaved(); render(); }
      else { queue.push(t); renderQueue(); toast('Añadida a la cola'); }
    };
    ul.append(li);
  });
  return ul;
}

// ---------- Vistas ----------
let current = 'search', lastQuery = '', lastSource = 'ia', lastResults = null, openAlbum = null;
async function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === current));
  await ({ search: vSearch, library: vLibrary, offline: vOffline, settings: vSettings })[current]();
  markCurrent();
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { current = b.dataset.view; openAlbum = null; render(); });

function vSearch() {
  view.innerHTML = `<h2>Buscar</h2>
    <form class="row" id="sf"><input type="search" id="q" placeholder="Artista, álbum o género…" value="${esc(lastQuery)}">
      <select id="src"><option value="ia">Internet Archive</option><option value="jam">Jamendo</option></select>
      <button class="btn">Buscar</button></form>
    <div id="res"></div>`;
  $('#src').value = lastSource;
  const res = $('#res');
  const show = () => {
    res.innerHTML = '';
    if (openAlbum) { res.append(albumHead(openAlbum.album), trackList(openAlbum.tracks)); return; }
    if (!lastResults) {
      res.innerHTML = `<p class="empty">Solo música con licencia libre (Creative Commons). Empieza por un género:</p>
        <div class="chips">${['jazz', 'ambient', 'rock', 'classical', 'electronic', 'folk', 'piano', 'blues'].map(g => `<button class="chip" data-g="${g}">${g}</button>`).join('')}</div>`;
      res.onclick = e => { const b = e.target.closest('[data-g]'); if (b) { $('#q').value = b.dataset.g; $('#sf').requestSubmit(); } };
      return;
    }
    if (!lastResults.length) { res.innerHTML = '<p class="empty">Sin resultados.</p>'; return; }
    if (lastResults[0].kind === 'album') {
      const g = document.createElement('div'); g.className = 'grid';
      lastResults.forEach(a => { const c = document.createElement('button'); c.className = 'card';
        c.innerHTML = `<img loading="lazy" src="${esc(a.cover)}" alt="" onerror="this.src='icon.svg'"><b>${esc(a.title)}</b><small>${esc(a.artist)}</small>`;
        c.onclick = async () => { res.innerHTML = '<p class="empty">Cargando…</p>'; try { openAlbum = { album: a, tracks: await iaTracks(a) }; } catch { toast('Error al cargar el álbum'); } show(); };
        g.append(c); });
      res.append(g);
    } else res.append(trackList(lastResults));
  };
  $('#sf').onsubmit = async e => {
    e.preventDefault(); lastQuery = $('#q').value.trim(); lastSource = $('#src').value; openAlbum = null;
    if (!lastQuery) return;
    if (!online()) return toast('Sin conexión');
    res.innerHTML = '<p class="empty">Buscando…</p>';
    try { lastResults = lastSource === 'ia' ? await iaSearch(lastQuery) : await jamSearch(lastQuery); } catch (err) { lastResults = null; res.innerHTML = `<p class="empty">${esc(err.message || 'Error de red')}</p>`; return; }
    show();
  };
  show();
}
function albumHead(a) {
  const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = `<button class="btn ghost">${ic('back')}Volver</button><h2 style="margin:0">${esc(a.title)}</h2>`;
  d.firstChild.onclick = () => { openAlbum = null; render(); };
  return d;
}
async function vLibrary() {
  await refreshSaved();
  const list = [...saved.values()].filter(t => t.liked).sort((a, b) => b.added - a.added);
  view.innerHTML = `<h2>Tu biblioteca</h2>`;
  if (!list.length) view.insertAdjacentHTML('beforeend', '<p class="empty">Aún no has guardado canciones. Pulsa el corazón en cualquier resultado.</p>');
  else { const row = document.createElement('div'); row.className = 'row'; row.innerHTML = `<button class="btn">${ic('play')}Reproducir todo</button>`; row.firstChild.onclick = () => playQueue(list, 0); view.append(row, trackList(list)); }
}
async function vOffline() {
  await refreshSaved();
  const list = [...saved.values()].filter(t => t.blob).sort((a, b) => b.added - a.added);
  const bytes = list.reduce((n, t) => n + t.blob.size, 0);
  view.innerHTML = `<h2>Sin conexión</h2><div class="row"><button class="btn" id="imp">${ic('upload')}Importar mis archivos</button>
    ${list.length ? `<button class="btn ghost" id="pa">${ic('play')}Reproducir todo</button>` : ''}<span class="empty" style="padding:0">${list.length} ${list.length === 1 ? 'canción' : 'canciones'} · ${(bytes / 1048576).toFixed(1)} MB</span></div>`;
  $('#imp').onclick = () => $('#files').click();
  if ($('#pa')) $('#pa').onclick = () => playQueue(list, 0);
  if (!list.length) view.insertAdjacentHTML('beforeend', '<p class="empty">Descarga canciones con la flecha o importa las tuyas: se guardan en este dispositivo y suenan sin internet.</p>');
  else view.append(trackList(list));
}
$('#files').onchange = async e => {
  for (const f of e.target.files) {
    const name = f.name.replace(/\.[^.]+$/, ''); const m = name.match(/^(.+?)\s+-\s+(.+)$/);
    await dbPut({ id: 'local:' + f.name + ':' + f.size, src: 'local', title: m ? m[2] : name, artist: m ? m[1] : 'Mis archivos', blob: f, added: Date.now() });
  }
  e.target.value = ''; await refreshSaved(); toast('Archivos importados'); render();
};
async function vSettings() {
  let est = ''; try { const s = await navigator.storage.estimate(); est = `${(s.usage / 1048576).toFixed(0)} MB usados de ${(s.quota / 1048576).toFixed(0)} MB`; } catch {}
  view.innerHTML = `<h2>Ajustes</h2>
    <div class="card-note">Ondas solo reproduce música con licencia libre o archivos tuyos. No incluye ni descarga música protegida por derechos de autor.</div>
    <h3>Jamendo (opcional)</h3>
    <p class="empty" style="padding:0">Cientos de miles de canciones Creative Commons. Crea una app gratuita en <a href="https://devportal.jamendo.com" target="_blank" rel="noopener" style="color:var(--ac)">devportal.jamendo.com</a> y pega aquí tu <i>client_id</i>.</p>
    <form class="row" id="jf"><input type="text" id="jid" placeholder="client_id" value="${esc(store.get('jamendo', ''))}"><button class="btn">Guardar</button></form>
    <h3>Almacenamiento</h3><p class="empty" style="padding:0">${est || 'No disponible'}</p>
    <button class="btn ghost" id="clr">Borrar todas las descargas</button>`;
  $('#jf').onsubmit = e => { e.preventDefault(); store.set('jamendo', $('#jid').value.trim()); toast('Guardado'); };
  $('#clr').onclick = async () => { if (!confirm('¿Borrar todas las descargas y la biblioteca?')) return; for (const id of saved.keys()) await dbDel(id); await refreshSaved(); toast('Borrado'); render(); };
}

// ---------- Arranque ----------
const netBar = () => { $('#net').hidden = online(); if (!online() && current === 'search') { current = 'offline'; } if (view.dataset.ready) render(); };
addEventListener('online', netBar); addEventListener('offline', netBar);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => { await refreshSaved(); netBar(); view.dataset.ready = 1; render(); })();
