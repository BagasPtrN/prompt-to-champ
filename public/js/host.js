'use strict';
/* HOST — layar fasilitator (proyektor). Server = sumber kebenaran. */

/* ---------- koneksi & auth ---------- */
const code = location.pathname.split('/').pop().toUpperCase();
let token = localStorage.getItem('ptc_host_' + code);
if (location.hash.startsWith('#t=')){
  token = location.hash.slice(3);
  localStorage.setItem('ptc_host_' + code, token);
  history.replaceState(null, '', '/h/' + code);
}
if (!token){
  document.getElementById('fatal-tx').textContent = 'Token host tidak ditemukan — buka room ini dari laptop yang membuatnya.';
  document.getElementById('fatal').style.display = 'block';
}

const socket = io();
socket.on('connect', () => token && socket.emit('host:auth', { code, hostToken: token }));
socket.on('auth:failed', () => {
  document.getElementById('fatal-tx').textContent = 'Token host tidak valid.';
  document.getElementById('fatal').style.display = 'block';
});
socket.on('host:replaced', () => {
  document.getElementById('fatal-tx').textContent = 'Layar host dibuka di tab lain.';
  document.getElementById('fatal').style.display = 'block';
});
socket.on('room:closed', () => {
  document.getElementById('fatal-tx').textContent = 'Room sudah ditutup. Terima kasih!';
  document.getElementById('fatal').style.display = 'block';
});
socket.on('action:result', (r) => { if (r && r.ok === false && r.reason) toast(r.reason, true); });

/* ---------- state ---------- */
let S = null;                 /* snapshot terakhir */
let briefsLocal = null;       /* salinan brief utk editor */
let briefOrderLocal = null;
let editIdx = -1;
let lastPhase = null;

socket.on('state', (st) => {
  Clock.sync(st.now);
  S = st;
  if (st.__host && st.__host.briefs && !briefsLocal){
    briefsLocal = JSON.parse(JSON.stringify(st.__host.briefs));
    briefOrderLocal = (st.__host.briefOrder || []).slice();
  }
  render(st);
});

/* ---------- elemen ---------- */
const $ = id => document.getElementById(id);
const PHASES = ['lobby','brief','prompting','generating','gallery','voting','reveal','scores','podium'];

function img(file){ return `/img/${code}/${encodeURIComponent(file)}`; }

function render(st){
  $('t-code').textContent = 'ROOM ' + st.code;
  $('t-round').textContent = st.roundIndex >= 0
    ? `· RONDE ${st.roundIndex + 1}/${st.totalRounds} · ${phaseName(st.phase)}` : '';

  /* kontrol umum */
  const timed = ['brief','prompting','voting'].includes(st.phase);
  $('c-addtime').disabled = !timed || st.paused;
  $('c-skip').disabled = ['lobby','reveal','scores','podium'].includes(st.phase) || st.paused;
  $('c-pause').textContent = st.paused ? '▶ LANJUT' : '⏸ JEDA';
  $('c-pause').disabled = !st.paused && !st.endsAt;

  PHASES.forEach(p => { const el = $('ph-' + p); if (el) el.style.display = p === st.phase ? 'block' : 'none'; });

  if (st.phase !== lastPhase){
    if (lastPhase !== null) SFX.click();
    if (st.phase === 'podium'){ SFX.fanfare(); spawnConfetti(); }
    lastPhase = st.phase;
  }

  ({
    lobby: renderLobby, brief: renderBrief, prompting: renderPrompting,
    generating: renderGenerating, gallery: renderGallery, voting: renderVoting,
    reveal: renderReveal, scores: renderScores, podium: renderPodium,
  }[st.phase] || (()=>{}))(st);
}

function phaseName(p){
  return { lobby:'LOBBY', brief:'BRIEF', prompting:'PROMPT', generating:'GENERATE',
    gallery:'GALERI', voting:'VOTING', reveal:'REVEAL', scores:'SKOR', podium:'PODIUM' }[p] || p;
}

/* ---------- LOBBY ---------- */
function renderLobby(st){
  if (!S.__host || !S.__host.briefs) return;
  $('qrbox').innerHTML = S.__host.qr
    ? `<img src="${S.__host.qr}" alt="QR join">`
    : '<div class="micro" style="color:#17100f">QR gagal dibuat</div>';
  $('code-big').textContent = st.code;
  const url = st.joinUrl || '';
  $('join-url').innerHTML = url ? `buka di HP: <b>${esc(url)}</b>` : '';
  $('btn-copyurl').onclick = () => {
    navigator.clipboard?.writeText(url).then(() => toast('Link tersalin ✓'));
  };

  const act = st.players.filter(p => !p.spectator);
  $('pcount').textContent = act.length + (st.players.some(p => p.spectator) ? ` (+${st.players.filter(p=>p.spectator).length} penonton)` : '');
  $('playerlist').innerHTML = st.players.map(p => `
    <div class="pchip ${p.connected ? '' : 'off'} ${p.spectator ? 'spec' : ''}" title="${p.spectator ? 'menunggu ronde berikutnya' : ''}">
      <span class="dot"></span>${esc(p.name)}${p.bot ? '<span class="bottag">BOT</span>' : ''}
      <button class="k" data-kick="${p.pid}" title="keluarkan">✕</button>
    </div>`).join('') || '<div class="micro">menunggu pemain scan QR…</div>';
  $('playerlist').querySelectorAll('[data-kick]').forEach(b =>
    b.onclick = () => socket.emit('host:action', { action: 'kick', data: { pid: b.dataset.kick } }));

  /* bot: tambah/hapus agar bisa langsung main walau pemain kurang */
  const nBots = st.players.filter(p => p.bot).length;
  $('btn-addbot').onclick = () => socket.emit('host:action', { action: 'addBot' });
  $('btn-rmbot').style.display = nBots ? 'inline-block' : 'none';
  $('btn-rmbot').onclick = () => socket.emit('host:action', { action: 'removeBot' });
  $('bot-hint').textContent = nBots
    ? `${nBots} bot aktif — mereka ikut menulis & menilai`
    : 'sendirian? tambah bot sampai 3 pemain, langsung bisa main';

  $('btn-start').disabled = act.length < 3;
  $('start-hint').textContent = act.length < 3 ? `butuh ${3 - act.length} pemain lagi` : `${act.length} pemain siap 🎉`;

  /* pengaturan — isi sekali dari state */
  if ($('s-rounds').dataset.synced !== '1'){
    $('s-rounds').value = st.settings.rounds;
    $('s-promptms').value = String(st.settings.promptMs);
    $('s-votems').value = String(st.settings.ratingPerMs || 12000);
    $('s-cat').value = st.settings.categoryMode;
    $('s-regen').checked = st.settings.allowRegen;
    $('s-tips').checked = st.settings.showTips;
    $('s-jury').checked = st.settings.juryEnabled;
    $('s-autostart').checked = st.settings.autoStart;
    $('s-autoat').value = st.settings.autoStartAt;
    $('s-rounds').dataset.synced = '1';
  }

  renderBriefEditor(st);
}

function renderBriefEditor(st){
  if (!briefsLocal) return;
  const queued = briefOrderLocal.map(id => briefsLocal.findIndex(b => b.id === id)).filter(i => i >= 0);
  $('bcount').textContent = briefOrderLocal.length + ' di antrian';
  $('border-info').textContent = briefOrderLocal.map(id => {
    const b = briefsLocal.find(x => x.id === id);
    return b ? b.product : '?';
  }).slice(0, st.settings.rounds).join(' → ') || '-';

  const rows = queued.map((bi, qi) => {
    const b = briefsLocal[bi];
    return `<div class="pchip">
      <img class="blist-thumb" src="/img/product/${b.id}" alt="">
      <span class="micro" style="color:var(--accent-light)">${qi + 1}</span>
      <span>${esc(b.product)}</span>
      <span class="micro" style="margin-left:auto">${esc(b.brand)}</span>
      <button class="k" data-up="${b.id}" title="naik">▲</button>
      <button class="k" data-down="${b.id}" title="turun">▼</button>
      <button class="k" data-edit="${b.id}" title="ubah">✎</button>
      <button class="k" data-del="${b.id}" title="hapus">✕</button>
    </div>`;
  }).join('');
  const unqueued = briefsLocal
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !briefOrderLocal.includes(b.id))
    .map(({ b }) => `<div class="pchip spec">
      <img class="blist-thumb" src="/img/product/${b.id}" alt="">
      <span>${esc(b.product)}</span><span class="micro" style="margin-left:auto">cadangan</span>
      <button class="k" data-addq="${b.id}" title="masukkan antrian">＋</button>
    </div>`).join('');
  $('brieflist').innerHTML = rows + unqueued;

  const wire = (sel, fn) => $('brieflist').querySelectorAll(sel).forEach(b => b.onclick = fn);
  wire('[data-up]', b => moveBrief(b.dataset.up, -1));
  wire('[data-down]', b => moveBrief(b.dataset.down, +1));
  wire('[data-del]', b => {
    briefOrderLocal = briefOrderLocal.filter(x => x !== b.dataset.del);
    briefsLocal = briefsLocal.filter(x => x.id !== b.dataset.del);
  });
  wire('[data-addq]', b => briefOrderLocal.push(b.dataset.addq));
  wire('[data-edit]', b => openBriefForm(briefsLocal.findIndex(x => x.id === b.dataset.edit)));
  $('brieflist').scrollTop = $('brieflist').scrollTop; /* pertahankan scroll */
}

function moveBrief(id, dir){
  const i = briefOrderLocal.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= briefOrderLocal.length) return;
  [briefOrderLocal[i], briefOrderLocal[j]] = [briefOrderLocal[j], briefOrderLocal[i]];
}

let pendingImage = null; /* File foto produk yang menunggu diunggah */

function openBriefForm(idx){
  editIdx = idx;
  pendingImage = null;
  $('briefform').style.display = 'block';
  $('bf-title').textContent = idx >= 0 ? 'EDIT BRIEF' : 'BRIEF BARU';
  const b = idx >= 0 ? briefsLocal[idx] : { category: 'beverages', product: '', brand: '', desc: '', target: '', price: '', usp: '', mandatory: '' };
  $('bf-cat').value = b.category; $('bf-product').value = b.product; $('bf-brand').value = b.brand;
  $('bf-desc').value = b.desc; $('bf-target').value = b.target; $('bf-price').value = b.price;
  $('bf-usp').value = b.usp; $('bf-mandatory').value = b.mandatory;
  $('bf-img').value = '';
  paintImagePreview(idx >= 0 ? b.id : null, null);
  $('bf-product').focus();
}

function paintImagePreview(briefId, dataUrl){
  const src = dataUrl || (briefId ? `/img/product/${briefId}` : '');
  $('bf-img-preview').innerHTML = src
    ? `<img src="${src}" alt="pratinjau foto produk">` + (dataUrl ? '<div class="micro" style="margin-top:4px">foto baru — tekan SIMPAN untuk dipakai</div>' : '')
    : '<div class="micro">belum ada foto (ilustrasi otomatis akan dipakai)</div>';
}

$('bf-img').addEventListener('change', () => {
  const f = $('bf-img').files && $('bf-img').files[0];
  if (!f){ pendingImage = null; paintImagePreview(editIdx >= 0 ? briefsLocal[editIdx].id : null, null); return; }
  if (f.size > 4 * 1024 * 1024){ toast('Foto maksimal 4 MB.', true); $('bf-img').value = ''; return; }
  pendingImage = f;
  const rd = new FileReader();
  rd.onload = () => paintImagePreview(null, rd.result);
  rd.readAsDataURL(f);
});

async function uploadProductImage(briefId){
  if (!pendingImage) return;
  const dataUrl = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(pendingImage); });
  const base64 = String(dataUrl).split(',')[1] || '';
  try {
    const r = await fetch('/api/product-image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: briefId, mime: pendingImage.type, data: base64 }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.reason || 'gagal');
    toast('Foto produk tersimpan ✓');
  } catch (e){ toast('Foto gagal diunggah: ' + e.message, true); }
  pendingImage = null;
}

$('btn-addbrief').onclick = () => openBriefForm(-1);
$('bf-cancel').onclick = () => { $('briefform').style.display = 'none'; editIdx = -1; pendingImage = null; };
$('bf-save').onclick = async () => {
  const b = {
    category: $('bf-cat').value, product: $('bf-product').value.trim(), brand: $('bf-brand').value.trim() || 'UMKM',
    desc: $('bf-desc').value.trim(), target: $('bf-target').value.trim(), price: $('bf-price').value.trim(),
    usp: $('bf-usp').value.trim(), mandatory: $('bf-mandatory').value.trim(),
  };
  if (!b.product){ toast('Nama produk wajib diisi.', true); return; }
  let id;
  if (editIdx >= 0){ id = briefsLocal[editIdx].id; briefsLocal[editIdx] = { ...b, id }; }
  else {
    id = 'c' + Date.now().toString(36);
    briefsLocal.push({ ...b, id }); briefOrderLocal.push(id);
  }
  if (pendingImage) await uploadProductImage(id);
  $('briefform').style.display = 'none'; editIdx = -1;
};
$('btn-savebriefs').onclick = () => {
  socket.emit('host:action', { action: 'briefs', data: { briefs: briefsLocal, briefOrder: briefOrderLocal } });
  toast('Brief disimpan ✓');
};

$('btn-savesettings').onclick = () => {
  socket.emit('host:action', { action: 'settings', data: {
    settings: {
      rounds: Number($('s-rounds').value), promptMs: Number($('s-promptms').value),
      voteMs: Number($('s-votems').value), ratingPerMs: Number($('s-votems').value), categoryMode: $('s-cat').value,
      allowRegen: $('s-regen').checked, showTips: $('s-tips').checked, juryEnabled: $('s-jury').checked,
      autoStart: $('s-autostart').checked, autoStartAt: Number($('s-autoat').value) || 5,
    },
  }});
  toast('Pengaturan disimpan ✓');
};

$('btn-start').onclick = () => socket.emit('host:action', { action: 'start' });

/* ---------- BRIEF ---------- */
function briefCardHTML(st, compact){
  const b = st.brief;
  if (!b) return '';
  const img = `<img class="prodimg" src="${b.image}" alt="Foto ${esc(b.product)}">`;
  const text = `
    <div class="cat"><span class="em">${b.emoji || b.categoryEmoji || '✦'}</span><span class="micro">${esc(b.categoryName)}</span></div>
    <h2>${esc(b.product)}</h2>
    <div class="br">${esc(b.brand)}</div>
    ${compact ? '' : `<p class="desc">${esc(b.desc)}</p>`}
    <div class="briefrows">
      <div class="cell"><div class="k">Harga</div><div class="v">${esc(b.price || '-')}</div></div>
      <div class="cell"><div class="k">Target</div><div class="v">${esc(b.target || '-')}</div></div>
      <div class="cell"><div class="k">Keunggulan</div><div class="v serif">${esc(b.usp || '-')}</div></div>
      <div class="cell"><div class="k">Teks wajib</div><div class="v">${b.mandatory ? esc(b.mandatory) : '—'}</div></div>
    </div>`;
  return compact ? `<div class="brief-mini">${img}<div style="flex:1">${text}</div></div>` : `<div class="bwrap">${img}<div>${text}</div></div>`;
}

function renderBrief(st){
  $('brief-round').textContent = `RONDE ${st.roundIndex + 1}/${st.totalRounds}`;
  $('brief-card').innerHTML = briefCardHTML(st, false);
}

/* ---------- PROMPTING ---------- */
function renderPrompting(st){
  $('pr-brief').innerHTML = briefCardHTML(st, true);
  $('pr-count').textContent = `${st.counts.submitted}/${st.counts.total} TERKIRIM — ${st.counts.locked} TERKUNCI`;
  $('pr-players').innerHTML = st.players.map(p => `
    <div class="pchip ${p.connected ? '' : 'off'}">
      <span class="dot"></span>${esc(p.name)}
      <span class="st ${p.locked ? 'lk' : p.submitted ? 'on' : ''}">${p.spectator ? 'PENONTON' : p.locked ? 'TERKUNCI' : p.submitted ? 'TERKIRIM' : 'MENULIS'}</span>
    </div>`).join('');
}

/* ---------- GENERATING ---------- */
function renderGenerating(st){
  const total = st.counts.imagesTotal || 1;
  const done = st.counts.imagesOk;
  $('gen-count').textContent = `${done} dari ${total} poster selesai`;
  $('gen-bar').style.width = Math.round(done / total * 100) + '%';
}

/* ---------- VOTING: rating satu-per-satu (DOM statis: hanya tukar src) ---------- */
const vtImg = $('vt-img');
let vtShownFile = null, vtShownLetter = null;

/* sekali pasang: klik poster = pilihan juri */
$('vt-spot').onclick = () => {
  if (!S || !S.juryEnabled) return;
  const g = S.gallery[S.galleryCursor];
  if (g && g.pid) socket.emit('host:action', { action: 'jury', data: { pid: g.pid } });
};

function renderVoting(st){
  const g = st.gallery[st.galleryCursor];
  $('vt-count').textContent = g
    ? `POSTER ${st.galleryCursor + 1}/${st.galleryTotal} · ${st.counts.ratedCurrent}/${st.counts.ratersNeeded} SUDAH MENILAI`
    : 'menyiapkan…';
  if (!g) return;

  if (g.file !== vtShownFile){
    vtShownFile = g.file;
    if (g.file){
      if (vtImg.getAttribute('src') !== img(g.file)) vtImg.src = img(g.file);
      vtImg.style.display = 'block';
      $('vt-fail').style.display = 'none';
    } else {
      vtImg.style.display = 'none';
      $('vt-fail').style.display = 'flex';
    }
  }
  if (g.letter !== vtShownLetter){
    vtShownLetter = g.letter;
    $('vt-letter').textContent = g.letter;
  }
  $('vt-juri').style.display = g.isJury ? 'block' : 'none';
  $('vt-juryhint').textContent = st.juryEnabled
    ? (st.juryLetter ? `Pilihan juri: poster ${st.juryLetter}` : 'Klik poster untuk pilihan juri (+5)') : '';

  /* preload berikutnya */
  const nextG = st.gallery[st.galleryCursor + 1];
  if (nextG && nextG.file){ const pre = new Image(); pre.src = img(nextG.file); }
}

/* ---------- GALERI (fase lama — kini rating yang menjadi panggung) ---------- */
function renderGallery(){ /* tidak terpakai lagi: rating satu-per-satu menggantikan galeri */ }

/* ---------- REVEAL = PODIUM RONDE (semua sekaligus, tanpa satu-per-satu) ---------- */
let lastRevealKey = null; /* cegah render ulang & bunyi berulang di tiap broadcast */

function renderReveal(st){
  const items = (st.reveal || []).slice().sort((a, b) => b.roundTotal - a.roundTotal);
  $('rv-sub').textContent = `HASIL RONDE ${st.roundIndex + 1}`;
  if (!items.length){ $('rv-wrap').innerHTML = '<div class="micro">tidak ada poster</div>'; return; }

  const key = st.roundIndex + ':' + items.length + ':' + items[0].roundTotal;
  if (lastRevealKey === key) return; /* sama persis — jangan render ulang (anti-kedip) */
  lastRevealKey = key;

  SFX.champion();
  spawnConfetti(50);
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const top3 = items.slice(0, 3);
  const others = items.slice(3);
  /* tribun: juara 2 (kiri) — juara 1 (tengah, tertinggi) — juara 3 (kanan) */
  const arrangement = [
    { it: top3[1], cls: 'tb2', rank: 2 },
    { it: top3[0], cls: 'tb1', rank: 1 },
    { it: top3[2], cls: 'tb3', rank: 3 },
  ].filter(x => x.it);

  $('rv-wrap').innerHTML = `
    <div class="roundpodium">
      ${arrangement.map(({ it, cls, rank }) => `
        <div class="tribune ${cls}">
          <div class="medal">${medals[rank]}</div>
          <div class="tp">
            ${it.file ? `<img src="${img(it.file)}" alt="Poster ${it.letter}">` : '<div class="nofile">gagal dibuat</div>'}
          </div>
          <div class="who">${esc(it.name)}</div>
          <div class="pts">⭐${it.ratings.avg} · ${it.roundTotal} poin${it.jury ? ' · ★juri' : ''}${it.speed ? ' · ⚡' : ''}</div>
          <div class="promptmini">❯ ${esc(it.prompt || '')}</div>
          <div class="step">${rank}</div>
        </div>`).join('')}
    </div>
    ${others.length ? `
      <div class="micro" style="margin:18px 0 10px">POSTER LAINNYA</div>
      <div class="otherow">
        ${others.map(it => `
          <div class="ocell">
            ${it.file ? `<img src="${img(it.file)}" loading="lazy" alt="Poster ${it.letter}">` : '<div class="nofile">gagal</div>'}
            <div class="who">${esc(it.name)}</div>
            <div class="pts mono">⭐${it.ratings.avg}</div>
          </div>`).join('')}
      </div>` : ''}
    <div class="micro" style="margin-top:14px;text-align:center">PAPAN SKOR MENYUSUL OTOMATIS…</div>`;

  $('btn-nextreveal').textContent = 'PAPAN SKOR →';
  $('btn-nextreveal').onclick = () => socket.emit('host:action', { action: 'next' });
}

/* ---------- SCORES ---------- */
function renderScores(st){
  const lb = st.leaderboard || [];
  $('sc-list').innerHTML = lb.map((r, i) => `
    <div class="lbrow" style="animation-delay:${i * 60}ms">
      <span class="rank">${r.rank}</span><span class="nm">${esc(r.name)}</span>
      <span class="dl ${r.delta > 0 ? 'up' : r.delta < 0 ? 'dn' : 'eq'}">${r.delta > 0 ? '▲' + r.delta : r.delta < 0 ? '▼' + (-r.delta) : '—'}</span>
      <span class="sc">${r.score}</span>
    </div>`).join('');
  const last = st.roundIndex + 1 >= st.totalRounds;
  $('btn-nextround').textContent = last ? 'PODIUM AKHIR →' : 'RONDE BERIKUTNYA →';
  $('btn-nextround').onclick = () => socket.emit('host:action', { action: 'next' });
}

/* ---------- PODIUM ---------- */
function renderPodium(st){
  const rank = st.finalRanking || [];
  const top = rank.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean); /* 2-1-3 */
  const medals = { 1: '👑', 2: '🥈', 3: '🥉' };
  $('pod-box').innerHTML = order.map(p => `
    <div class="pod p${p.rank}">
      <div class="crown">${medals[p.rank] || ''}</div>
      ${p.poster
        ? `<div class="poster"><img src="${img(p.poster.file)}" alt="Poster ${esc(p.name)}"></div>`
        : `<div class="avatar">${esc((p.name || '?')[0] || '?')}</div>`}
      <div class="nm">${esc(p.name)}${p.poster ? ` <span class="micro">⭐${p.poster.avg}</span>` : ''}</div>
      <div class="bar">${p.score}</div>
    </div>`).join('');

  /* poster pemain lainnya di bawah podium */
  const rest = rank.slice(3).filter(r => r.poster);
  $('pod-posters-title').style.display = rest.length ? 'block' : 'none';
  $('pod-posters').innerHTML = rest.map(r => `
    <div class="pcell">
      <span class="lb">#${r.rank}</span>
      <img src="${img(r.poster.file)}" loading="lazy" alt="Poster ${esc(r.name)}">
      <div style="padding:8px 10px;font-size:13px;font-weight:700">${esc(r.name)} <span class="micro">⭐${r.poster.avg} · ${r.score} pts</span></div>
    </div>`).join('');

  $('pod-list').innerHTML = rank.map((r, i) => `
    <div class="lbrow" style="animation-delay:${i * 40}ms">
      <span class="rank">${r.rank}</span><span class="nm">${esc(r.name)}</span>
      <span class="dl eq">${r.firstVotes}× nilai 10</span><span class="sc">${r.score}</span>
    </div>`).join('');
  $('btn-zip').href = `/api/room/${st.code}/zip`;
  $('btn-rekap').href = `/api/room/${st.code}/rekap`;
}
$('btn-closeroom').onclick = () => {
  if (confirm('Tutup room? Poster akan dihapus dari server.')) socket.emit('host:action', { action: 'close' });
};

/* ---------- kontrol umum ---------- */
$('c-pause').onclick = () => socket.emit('host:action', { action: S && S.paused ? 'resume' : 'pause' });
$('c-addtime').onclick = () => socket.emit('host:action', { action: 'addTime' });
$('c-skip').onclick = () => { if (confirm('Lewati fase ini?')) socket.emit('host:action', { action: 'skip' }); };

/* ---------- ticker countdown ---------- */
runTicker(() => {
  if (!S) return null;
  const map = { brief: 'brief-timer', prompting: 'pr-timer', voting: 'vt-timer' };
  const el = map[S.phase] && $(map[S.phase]);
  if (!el || S.paused){ if (el) el.classList.remove('low'); return null; }
  const ms = Clock.remaining(S.paused ? null : S.endsAt);
  if (ms == null) return null;
  const total = { brief: S.settings.briefMs, prompting: S.settings.promptMs, voting: S.settings.ratingPerMs || 12000 }[S.phase] || ms;
  el.querySelector('.num').textContent = fmtCountdown(ms);
  const pct = Math.max(0, Math.min(100, ms / total * 100));
  el.querySelector('.bar i').style.width = pct + '%';
  el.classList.toggle('low', ms <= 10000);
  return { ms };
});

/* ---------- confetti ---------- */
function spawnConfetti(n = 90){
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#e3000c', '#ff7a80', '#f5c069', '#f6efee', '#ffd9db'];
  for (let i = 0; i < n; i++){
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = (1.6 + Math.random() * 1.8) + 's';
    c.style.animationDelay = (Math.random() * 0.7) + 's';
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(c);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

/* ---------- hitung mundur mulai otomatis (lobby) ---------- */
let asLastSec = null;
setInterval(() => {
  const on = S && S.phase === 'lobby' && S.autoStartEndsAt;
  const banner = $('as-banner');
  if (!on){ banner.style.display = 'none'; asLastSec = null; return; }
  banner.style.display = 'block';
  const ms = Clock.remaining(S.autoStartEndsAt);
  const sec = Math.max(0, Math.ceil(ms / 1000));
  $('as-count').textContent = sec;
  if (sec !== asLastSec){ asLastSec = sec; if (sec > 0) SFX.tick(); }
}, 250);

initMuteButtons();
