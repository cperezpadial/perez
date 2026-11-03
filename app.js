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
  more: '<circle class="f" cx="5" cy="12" r="1.6"/><circle class="f" cx="12" cy="12" r="1.6"/><circle class="f" cx="19" cy="12" r="1.6"/>',
  playlist: '<path d="M4 6h12M4 11h12M4 16h7M18 14v6m-3-3h6"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
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

async function audSearch(q) {
  const A = 'https://api.audius.co/v1/tracks';
  const u = q ? `${A}/search?query=${encodeURIComponent(q)}&limit=30&app_name=ondas` : `${A}/trending?limit=30&app_name=ondas`;
  const j = await (await fetch(u)).json();
  return (j.data || []).map(r => ({ id: 'aud:' + r.id, src: 'aud', nodl: true, title: r.title, artist: r.user && r.user.name, cover: r.artwork && (r.artwork['480x480'] || r.artwork['150x150']),
    url: `${A}/${r.id}/stream?app_name=ondas`, duration: r.duration }));
}
const dec = h => { const d = document.createElement('textarea'); d.innerHTML = h; return d.value; };
async function ytSearch(q) {
  const k = store.get('ytkey', '');
  if (!k) throw new Error('Añade tu clave de YouTube en Ajustes');
  const j = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=25&q=${encodeURIComponent(q)}&key=${encodeURIComponent(k)}`)).json();
  if (j.error) throw new Error(j.error.code === 403 ? 'La clave de YouTube no es válida o se agotó el límite de hoy' : 'Error de YouTube: ' + j.error.message);
  return (j.items || []).map(r => ({ id: 'yt:' + r.id.videoId, src: 'yt', vid: r.id.videoId, nodl: true, title: dec(r.snippet.title), artist: dec(r.snippet.channelTitle).replace(/ - Topic$/, ''),
    cover: r.snippet.thumbnails && (r.snippet.thumbnails.medium || r.snippet.thumbnails.default).url }));
}
async function itSearch(q) {
  const j = await (await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=40&country=ES&term=${encodeURIComponent(q)}`)).json();
  return (j.results || []).filter(r => r.previewUrl).map(r => ({ id: 'it:' + r.trackId, src: 'it', nodl: true, title: r.trackName, artist: r.artistName, album: r.collectionName,
    cover: (r.artworkUrl100 || '').replace('100x100', '300x300'), url: r.previewUrl, duration: 30 }));
}

async function topES() {
  const f = await (await fetch('https://rss.applemarketingtools.com/api/v2/es/music/most-played/25/songs.json')).json();
  const ids = f.feed.results.map(r => r.id).join(',');
  const j = await (await fetch('https://itunes.apple.com/lookup?id=' + ids + '&country=ES')).json();
  const byId = new Map((j.results || []).filter(r => r.previewUrl).map(r => [String(r.trackId), r]));
  return f.feed.results.map(r => byId.get(String(r.id))).filter(Boolean).map(r => ({ id: 'it:' + r.trackId, src: 'it', nodl: true, title: r.trackName, artist: r.artistName, album: r.collectionName, cover: (r.artworkUrl100 || '').replace('100x100', '300x300'), url: r.previewUrl, duration: 30 }));
}

// ---------- YouTube (reproductor oficial incrustado) ----------
let yt = null, ytApi = null, ytTimer = null;
function ytLoadApi() {
  if (!ytApi) ytApi = new Promise((res, rej) => {
    window.onYouTubeIframeAPIReady = res;
    const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; sc.onerror = () => { ytApi = null; rej(new Error('yt')); }; document.head.append(sc);
  });
  return ytApi;
}
async function ytPlay(t) {
  $('#ytbox').hidden = false;
  await ytLoadApi();
  if (yt) yt.loadVideoById(t.vid);
  else await new Promise(res => { yt = new YT.Player('ytp', { width: '100%', height: '100%', videoId: t.vid, playerVars: { playsinline: 1, autoplay: 1, rel: 0 }, events: { onReady: res, onStateChange: e => { if (e.data === 0) next('ended'); } } }); });
  yt.setVolume(audio.volume * 100);
  clearInterval(ytTimer); ytTimer = setInterval(ytTick, 500);
}
function ytStop() { clearInterval(ytTimer); if (yt) { try { yt.pauseVideo(); } catch {} } $('#ytbox').hidden = true; }
function ytTick() {
  if (!yt || !isYT()) return;
  const c = yt.getCurrentTime() || 0, d = yt.getDuration() || 0;
  $('#cur').textContent = fmt(c); $('#dur').textContent = fmt(d); if (d) $('#seek').value = c / d * 1000;
  $('#play').innerHTML = ic(yt.getPlayerState() === 1 ? 'pause' : 'play');
}

// ---------- Estado del reproductor ----------
let queue = [], idx = -1, shuffle = false, repeat = 0; // repeat: 0 no, 1 todo, 2 una
let curUrl = null;
const isYT = () => !!(queue[idx] && queue[idx].src === 'yt');
const saved = new Map(); // id -> track guardado (biblioteca / descargas)

async function refreshSaved() { saved.clear(); (await dbAll()).forEach(t => saved.set(t.id, t)); }

async function playQueue(list, i) { queue = list.slice(); idx = i; renderQueue(); await load(); }
async function load() {
  const t = queue[idx]; if (!t) return;
  const rec = saved.get(t.id);
  if (t.src === 'yt') {
    audio.pause();
    if (!online()) return toast('Sin conexión');
    ytPlay(t).catch(() => toast('No se pudo cargar YouTube'));
  } else {
    ytStop();
    if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = null; }
    if (rec && rec.blob) { curUrl = URL.createObjectURL(rec.blob); audio.src = curUrl; }
    else if (!online()) { toast('Sin conexión: esta canción no está descargada'); return next(true); }
    else audio.src = t.url;
    try { await audio.play(); } catch (e) { if (e.name !== 'AbortError') toast('No se pudo reproducir'); }
  }
  $('#ptitle').textContent = t.title; $('#partist').textContent = t.artist || '';
  $('#cover').src = cover(t);
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || '', album: t.album || '', artwork: [{ src: new URL(cover(t), location.href).href }] });
  }
  renderQueue(); markCurrent();
}
function next(auto) {
  if (!queue.length) return;
  if (repeat === 2 && auto === 'ended') { if (isYT()) { yt.seekTo(0); yt.playVideo(); } else { audio.currentTime = 0; audio.play(); } return; }
  if (shuffle && queue.length > 1) { let n; do n = Math.floor(Math.random() * queue.length); while (n === idx); idx = n; }
  else if (idx + 1 < queue.length) idx++;
  else if (repeat === 1 || auto !== 'ended') idx = 0;
  else return;
  load();
}
function prev() { if (isYT() ? yt && yt.getCurrentTime() > 3 : audio.currentTime > 3) { if (isYT()) yt.seekTo(0); else audio.currentTime = 0; } else { idx = (idx - 1 + queue.length) % queue.length; load(); } }

$('#play').onclick = () => { if (isYT()) { if (yt) yt.getPlayerState() === 1 ? yt.pauseVideo() : yt.playVideo(); return; } if (!audio.src) return; audio.paused ? audio.play() : audio.pause(); };
$('#next').onclick = () => next(); $('#prev').onclick = prev;
$('#shuffle').onclick = e => { shuffle = !shuffle; e.currentTarget.classList.toggle('active', shuffle); };
$('#repeat').onclick = e => { repeat = (repeat + 1) % 3; e.currentTarget.classList.toggle('active', repeat > 0); e.currentTarget.innerHTML = ic(repeat === 2 ? 'repeat1' : 'repeat'); };
$('#volume').oninput = e => { audio.volume = e.target.value; if (yt) yt.setVolume(e.target.value * 100); };
$('#seek').oninput = e => { if (isYT()) { if (yt) yt.seekTo(yt.getDuration() * e.target.value / 1000, true); return; } if (isFinite(audio.duration)) audio.currentTime = audio.duration * e.target.value / 1000; };
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

async function downloadAll(list, btn) {
  const todo = list.filter(t => !t.nodl && t.src !== 'local' && !(saved.get(t.id) && saved.get(t.id).blob));
  if (!todo.length) return toast('Ya está todo descargado');
  if (!online()) return toast('Necesitas conexión para descargar');
  if (btn) btn.disabled = true;
  let ok = 0;
  for (const t of todo) {
    if (btn) btn.lastChild.textContent = `Descargando ${ok + 1}/${todo.length}…`;
    try {
      const res = await fetch(t.url); if (!res.ok) throw 0;
      const r = saved.get(t.id) || {};
      await dbPut({ ...t, ...r, blob: await res.blob(), added: r.added || Date.now() }); await refreshSaved(); ok++;
    } catch {}
  }
  toast(ok + ' de ' + todo.length + ' descargadas'); render();
}
const dlAllBtn = list => {
  if (!list.some(t => !t.nodl && t.src !== 'local')) return null;
  const b = document.createElement('button'); b.className = 'btn ghost'; b.innerHTML = ic('download') + '<span>Descargar todo</span>';
  b.onclick = () => downloadAll(list, b); return b;
};

// ---------- Listas de reproducción ----------
const lists = () => store.get('lists', {});
const plain = t => { const { blob, liked, added, ...r } = t; return r; };
function addToList(name, t) {
  const L = lists(); L[name] = L[name] || [];
  if (L[name].some(x => x.id === t.id)) return toast('Ya está en ' + name);
  L[name].push(plain(t)); store.set('lists', L); toast('Añadida a ' + name);
}
function sheet(title, items) {
  const o = document.createElement('div'); o.id = 'sheet';
  o.innerHTML = `<div class="box"><h3>${esc(title)}</h3></div>`;
  const box = o.firstChild; const close = () => o.remove();
  items.forEach(it => {
    const el = document.createElement(it.href ? 'a' : 'button'); el.className = 'item';
    if (it.href) { el.href = it.href; el.target = '_blank'; el.rel = 'noopener'; }
    el.innerHTML = `${it.icon ? ic(it.icon) : ''}<span>${esc(it.label)}</span>`;
    el.onclick = () => { close(); if (it.fn) it.fn(); };
    box.append(el);
  });
  o.onclick = e => { if (e.target === o) close(); };
  document.body.append(o);
}
function pickList(t) {
  const names = Object.keys(lists());
  sheet('Añadir a una lista', [
    { label: 'Nueva lista…', icon: 'plus', fn: () => { const n = (prompt('Nombre de la lista') || '').trim(); if (n) addToList(n, t); } },
    ...names.map(n => ({ label: n, icon: 'playlist', fn: () => addToList(n, t) }))
  ]);
}
function trackMenu(t, opts) {
  const q = encodeURIComponent((t.title + ' ' + (t.artist || '')).trim());
  const items = [
    { label: 'Añadir a la cola', icon: 'list', fn: () => { queue.push(t); renderQueue(); toast('Añadida a la cola'); } },
    { label: 'Añadir a una lista', icon: 'playlist', fn: () => pickList(t) }
  ];
  if (opts && opts.onRemove) items.push({ label: 'Quitar de esta lista', icon: 'trash', fn: opts.onRemove });
  if (t.src === 'it' || t.src === 'aud') items.push(
    { label: 'Escuchar completa en Spotify', icon: 'ext', href: 'https://open.spotify.com/search/' + q },
    { label: 'Escuchar completa en YouTube Music', icon: 'ext', href: 'https://music.youtube.com/search?q=' + q });
  sheet(t.title, items);
}

function trackList(list, opts) {
  const ul = document.createElement('ul'); ul.className = 'tracks';
  list.forEach((t, i) => {
    const r = saved.get(t.id), liked = r && r.liked, off = r && r.blob;
    const li = document.createElement('li'); li.dataset.id = t.id;
    if (queue[idx] && queue[idx].id === t.id) li.className = 'cur';
    li.innerHTML = `<img loading="lazy" src="${esc(cover(t))}" alt="" onerror="this.src='icon.svg'">
      <div class="t"><b>${esc(t.title)}</b><small>${esc(t.artist || '')}${t.album ? ' · ' + esc(t.album) : ''}${off ? ` · <span class="tag" title="Disponible sin conexión">${ic('download')}</span>` : ''}</small></div>
      <div class="acts">
        ${t.src === 'local' ? '' : `<button data-a="like" class="${liked ? 'on' : ''}" title="Biblioteca">${ic('heart')}</button>`}
        ${t.src === 'local' || t.nodl ? '' : `<button data-a="dl" class="${off ? 'on' : ''}" title="${off ? 'Quitar descarga' : 'Descargar para escuchar sin conexión'}">${ic(off ? 'check' : 'download')}</button>`}
        ${t.src === 'local' ? `<button data-a="rm" title="Eliminar">${ic('trash')}</button>` : ''}
        <button data-a="more" title="Más opciones">${ic('more')}</button>
      </div>`;
    li.querySelector('.t').onclick = li.querySelector('img').onclick = () => playQueue(list, i);
    li.querySelector('.acts').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'like') { await toggleLike(t); render(); }
      else if (b.dataset.a === 'dl') off ? removeDownload(t) : download(t, b);
      else if (b.dataset.a === 'rm') { await dbDel(t.id); await refreshSaved(); render(); }
      else trackMenu(t, opts);
    };
    ul.append(li);
  });
  return ul;
}

// ---------- Vistas ----------
let current = 'search', lastQuery = '', lastSource = 'it', lastResults = null, openAlbum = null;
async function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === current));
  await ({ search: vSearch, library: vLibrary, lists: vLists, offline: vOffline, settings: vSettings })[current]();
  markCurrent();
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { current = b.dataset.view; openAlbum = null; openList = null; render(); });

function vSearch() {
  view.innerHTML = `<h2>Buscar</h2>
    <form class="row" id="sf"><input type="search" id="q" placeholder="Artista, álbum o género…" value="${esc(lastQuery)}">
      <select id="src"><option value="it">Oficial · fragmentos de 30 s</option><option value="yt">YouTube · canciones completas</option><option value="aud">Audius · independientes</option><option value="ia">Internet Archive</option><option value="jam">Jamendo</option></select>
      <button class="btn">Buscar</button></form>
    <div id="res"></div>`;
  $('#src').value = lastSource;
  const res = $('#res');
  const show = () => {
    res.innerHTML = '';
    if (openAlbum) { const h = albumHead(openAlbum.album), d = dlAllBtn(openAlbum.tracks); if (d) h.append(d); res.append(h, trackList(openAlbum.tracks)); return; }
    if (!lastResults) {
      res.innerHTML = `<p class="empty">Busca un artista o una canción:</p>
        <div class="chips">${['Bad Bunny', 'Anuel AA', 'Rosalía', 'Quevedo', 'Karol G', 'Feid', 'Peso Pluma', 'Shakira'].map(g => `<button class="chip" data-g="${g}">${g}</button>`).join('')}</div>`;
      if (online()) { if (!topES.cache) topES.cache = topES().catch(() => []); topES.cache.then(tr => { if (!tr.length || lastResults || openAlbum || current !== 'search') return; const h = document.createElement('h3'); h.textContent = 'Lo más escuchado en España'; res.append(h, trackList(tr)); markCurrent(); }); }
      res.onclick = e => { const b = e.target.closest('[data-g]'); if (b) { $('#q').value = b.dataset.g; if ($('#src').value !== 'yt') $('#src').value = 'it'; $('#sf').requestSubmit(); } };
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
    } else { const d = dlAllBtn(lastResults); if (d) { const r = document.createElement('div'); r.className = 'row'; r.append(d); res.append(r); } res.append(trackList(lastResults)); }
  };
  $('#sf').onsubmit = async e => {
    e.preventDefault(); lastQuery = $('#q').value.trim(); lastSource = $('#src').value; openAlbum = null;
    if (!lastQuery && lastSource !== 'aud') return toast('Escribe algo para buscar');
    if (!online()) return toast('Sin conexión');
    res.innerHTML = '<p class="empty">Buscando…</p>';
    try { lastResults = await ({ yt: ytSearch, aud: audSearch, it: itSearch, ia: iaSearch, jam: jamSearch })[lastSource](lastQuery); } catch (err) { lastResults = null; res.innerHTML = `<p class="empty">${esc(err.message || 'Error de red')}</p>`; return; }
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
let openList = null;
function vLists() {
  const L = lists(); const names = Object.keys(L);
  view.innerHTML = '';
  if (openList && L[openList]) {
    const name = openList, tr = L[name];
    const head = document.createElement('div'); head.className = 'row';
    head.innerHTML = `<button class="btn ghost" id="lb">${ic('back')}Listas</button><h2 style="margin:0;flex:1">${esc(name)}</h2>${tr.length ? `<button class="btn" id="lp">${ic('play')}Reproducir</button>` : ''}<button class="btn ghost" id="ld" title="Borrar lista">${ic('trash')}</button>`;
    view.append(head);
    head.querySelector('#lb').onclick = () => { openList = null; render(); };
    if (head.querySelector('#lp')) head.querySelector('#lp').onclick = () => playQueue(tr, 0);
    head.querySelector('#ld').onclick = () => sheet('¿Borrar "' + name + '"?', [{ label: 'Borrar lista', icon: 'trash', fn: () => { delete L[name]; store.set('lists', L); openList = null; render(); } }, { label: 'Cancelar', icon: 'x' }]);
    if (!tr.length) view.insertAdjacentHTML('beforeend', '<p class="empty">Lista vacía. Añade canciones desde el menú ··· de cualquier canción.</p>');
    else view.append(trackList(tr, { onRemove: null }));
    // quitar canción: menú propio con opción de quitar
    view.querySelectorAll('.tracks li').forEach((li, i) => {
      const t = tr[i]; const b = li.querySelector('[data-a=more]');
      if (b) b.onclick = e => { e.stopPropagation(); trackMenu(t, { onRemove: () => { L[name].splice(i, 1); store.set('lists', L); render(); } }); };
    });
    return;
  }
  view.innerHTML = '<h2>Mis listas</h2><div class="row"><button class="btn" id="nl">' + ic('plus') + 'Nueva lista</button></div>';
  $('#nl').onclick = () => { const n = (prompt('Nombre de la lista') || '').trim(); if (n && !L[n]) { L[n] = []; store.set('lists', L); openList = n; render(); } };
  if (!names.length) { view.insertAdjacentHTML('beforeend', '<p class="empty">Crea tu primera lista y añade canciones desde el menú ··· de cualquier resultado.</p>'); return; }
  const g = document.createElement('div'); g.className = 'grid';
  names.forEach(n => { const c = document.createElement('button'); c.className = 'card';
    const first = L[n][0];
    c.innerHTML = `<img src="${esc(first ? cover(first) : 'icon.svg')}" alt="" onerror="this.src='icon.svg'"><b>${esc(n)}</b><small>${L[n].length} ${L[n].length === 1 ? 'canción' : 'canciones'}</small>`;
    c.onclick = () => { openList = n; render(); }; g.append(c); });
  view.append(g);
}

async function vOffline() {
  await refreshSaved();
  const list = [...saved.values()].filter(t => t.blob).sort((a, b) => b.added - a.added);
  const bytes = list.reduce((n, t) => n + t.blob.size, 0);
  view.innerHTML = `<h2>Sin conexión</h2><div class="row"><button class="btn" id="imp">${ic('upload')}Importar mis archivos</button>
    ${list.length ? `<button class="btn ghost" id="pa">${ic('play')}Reproducir todo</button>` : ''}<span class="empty" style="padding:0">${list.length} ${list.length === 1 ? 'canción' : 'canciones'} · ${(bytes / 1048576).toFixed(1)} MB</span></div>`;
  $('#imp').onclick = () => $('#files').click();
  view.insertAdjacentHTML('beforeend', `<h3>Conseguir música gratis</h3>
    <p class="empty" style="padding:0 0 8px">Descarga el MP3 desde estas webs y luego pulsa “Importar mis archivos” para tenerlo en Ondas sin conexión.</p>
    <div class="links">
      <a class="item" href="https://studio.youtube.com/channel/UC/music" target="_blank" rel="noopener">${ic('ext')}<span><b>Biblioteca de audio de YouTube</b><small>Música y sonidos gratis · mejor desde un ordenador</small></span></a>
      <a class="item" href="https://bandcamp.com/tag/free-download" target="_blank" rel="noopener">${ic('ext')}<span><b>Bandcamp · descargas gratis</b><small>Artistas que regalan su música</small></span></a>
      <a class="item" href="https://freemusicarchive.org" target="_blank" rel="noopener">${ic('ext')}<span><b>Free Music Archive</b><small>Música con licencia libre</small></span></a>
      <a class="item" href="https://www.jamendo.com" target="_blank" rel="noopener">${ic('ext')}<span><b>Jamendo</b><small>Música libre, con descarga</small></span></a>
    </div>`);
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
    <div class="card-note">Ondas reproduce música libre, fragmentos oficiales de iTunes y vídeos oficiales de YouTube con su propio reproductor. No descarga ni guarda música protegida por derechos de autor.</div>
    <h3>YouTube (canciones completas)</h3>
    <p class="empty" style="padding:0">Gratis, sin tarjeta. Crea una clave en <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Google Cloud</a>: proyecto nuevo → habilitar “YouTube Data API v3” → Credenciales → Crear clave de API. Pégala aquí; se guarda solo en este dispositivo.</p>
    <form class="row" id="yf"><input type="text" id="ykey" placeholder="Clave de API de YouTube" autocomplete="off" value="${esc(store.get('ytkey', ''))}"><button class="btn">Guardar</button></form>
    <h3>Jamendo (opcional)</h3>
    <p class="empty" style="padding:0">Cientos de miles de canciones Creative Commons. Crea una app gratuita en <a href="https://devportal.jamendo.com" target="_blank" rel="noopener" style="color:var(--ac)">devportal.jamendo.com</a> y pega aquí tu <i>client_id</i>.</p>
    <form class="row" id="jf"><input type="text" id="jid" placeholder="client_id" value="${esc(store.get('jamendo', ''))}"><button class="btn">Guardar</button></form>
    <h3>Almacenamiento</h3><p class="empty" style="padding:0">${est || 'No disponible'}</p>
    <button class="btn ghost" id="clr">Borrar todas las descargas</button>`;
  $('#yf').onsubmit = e => { e.preventDefault(); store.set('ytkey', $('#ykey').value.trim()); toast('Clave guardada'); };
  $('#jf').onsubmit = e => { e.preventDefault(); store.set('jamendo', $('#jid').value.trim()); toast('Guardado'); };
  $('#clr').onclick = async () => { if (!confirm('¿Borrar todas las descargas y la biblioteca?')) return; for (const id of saved.keys()) await dbDel(id); await refreshSaved(); toast('Borrado'); render(); };
}

// ---------- Arranque ----------
{ const m = location.hash.match(/^#ytkey=([\w-]{20,})$/); if (m) { store.set('ytkey', m[1]); history.replaceState(null, '', location.pathname + location.search); setTimeout(() => toast('Clave de YouTube guardada'), 600); } }
const netBar = () => { $('#net').hidden = online(); if (!online() && current === 'search') { current = 'offline'; } if (view.dataset.ready) render(); };
addEventListener('online', netBar); addEventListener('offline', netBar);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => { await refreshSaved(); netBar(); view.dataset.ready = 1; render(); })();

addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('#play').click(); } });
