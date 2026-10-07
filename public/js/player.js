'use strict';
/* PEMAIN — HP. Mobile-first, satu tangan. */

const code = location.pathname.split('/').pop().toUpperCase();
const tokenKey = 'ptc_token_' + code;
let myToken = localStorage.getItem(tokenKey);
let S = null;            /* state terakhir (versi pemain) */
let joined = false;
let lastPhase = null;

const $ = id => document.getElementById(id);
const socket = io();

function fatal(msg, em){
  $('f-em').textContent = em || '⚠️';
  $('f-tx').textContent = msg;
  showOnly('pj-fatal');
}
function showOnly(id){
  ['pj-join','pj-fatal','pj-lobby','pj-brief','pj-prompt','pj-gen','pj-gallery','pj-vote','pj-reveal','pj-scores','pj-podium']
    .forEach(s => { const el = $(s); if (el) el.style.display = s === id ? 'block' : 'none'; });
}
function img(file){ return `/img/${code}/${encodeURIComponent(file)}`; }

/* ---------- join ---------- */
socket.on('connect', () => {
  if (joined) return;
  if (myToken){
    socket.emit('room:join', { code, token: myToken }); /* reconnect */
  }
});
socket.on('join:failed', (r) => {
  myToken = null; localStorage.removeItem(tokenKey);
  showOnly('pj-join');
  toast(r.reason || 'Gagal masuk room.', true);
});
socket.on('joined', (d) => {
  joined = true;
  myToken = d.token;
  localStorage.setItem(tokenKey, myToken);
});
socket.on('kicked', () => { localStorage.removeItem(tokenKey); fatal('Kamu dikeluarkan dari room.', '🚪'); });
socket.on('room:closed', () => { localStorage.removeItem(tokenKey); fatal('Room ditutup. Terima kasih sudah main!', '🏁'); });
socket.on('action:result', (r) => { if (r && r.ok === false && r.reason) toast(r.reason, true); });

$('j-code').textContent = code;
$('j-name').value = localStorage.getItem('ptc_name') || '';
function tryJoin(){
  const name = $('j-name').value.trim();
  if (!name){ toast('Isi nama dulu ya.', true); return; }
  localStorage.setItem('ptc_name', name);
  socket.emit('room:join', { code, name });
}
$('j-go').onclick = tryJoin;
$('j-name').addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); });

/* ---------- state ---------- */
socket.on('state', (st) => {
  Clock.sync(st.now);
  S = st;
  $('t-info').textContent = st.phase !== 'lobby'
    ? `· R${st.roundIndex + 1}/${st.totalRounds} · ${st.counts ? st.counts.total : ''} PEMAIN` : '';
  render(st);
});

/* ---------- kartu "SEKARANG" — pengantar fase ala game show ---------- */
const NOW = {
  brief:      ['📋', 'Baca Brief Produk', 'Produk yang sama untuk semua — siap-siap menulis!'],
  prompting:  ['✍️', 'Menulis Prompt', 'Ceritakan poster impianmu dengan kata-kata biasa'],
  generating: ['🎨', 'AI Menggambar', 'Sabar sebentar, poster sedang dibuat…'],
  gallery:    ['🖼️', 'Galeri Poster', 'Nikmati karya semua pemain di layar besar'],
  voting:     ['🗳️', 'Pilih 3 Terbaik', 'Ketuk poster: nomor 1 yang paling kamu suka'],
  reveal:     ['👀', 'Saatnya Reveal', 'Siapa pembuat poster terbaik?'],
  scores:     ['🏆', 'Papan Skor', 'Beri tepuk tangan untuk semua pemain!'],
  podium:     ['👑', 'Prompt Champ', 'Selamat untuk juara hari ini!'],
};
let nowTimer = null;
let nowLastShown = null;
function showNow(phase){
  const cfg = NOW[phase];
  if (!cfg || nowLastShown === phase) return;
  nowLastShown = phase;
  const el = $('now');
  el.innerHTML = `<div class="e">${cfg[0]}</div><div class="t">${cfg[1]}</div><div class="s">${cfg[2]}</div>`;
  el.classList.add('on');
  SFX.reveal();
  clearTimeout(nowTimer);
  nowTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

function render(st){
  if (!joined){ showOnly('pj-join'); return; }
  if (st.phase !== lastPhase){
    if (joined && lastPhase !== null) showNow(st.phase);
    if (st.phase === 'podium'){ SFX.fanfare(); spawnMiniConfetti(); }
    else if (lastPhase !== null) SFX.click();
    lastPhase = st.phase;
  }
  ({
    lobby: rLobby, brief: rBrief, prompting: rPrompt, generating: rGen,
    gallery: rGallery, voting: rVote, reveal: rReveal, scores: rScores, podium: rPodium,
  }[st.phase] || (()=>{}))(st);
}

/* ---------- LOBBY ---------- */
function rLobby(st){
  showOnly('pj-lobby');
  $('lb-name').textContent = st.me ? st.me.name : '?';
  const wait = st.counts.total < 3 ? `BUTUH ${3 - st.counts.total} PEMAIN LAGI…` : 'SIAP MAIN…';
  $('lb-count').textContent = st.me && st.me.spectator
    ? 'KAMU PENONTON RONDE INI — IKUT MAIN RONDE BERIKUTNYA' : wait;

  /* tombol mulai sendiri (prototipe): butuh >= 3 online & bukan penonton */
  const btn = $('lb-start');
  const canStart = st.counts.online >= 3 && !(st.me && st.me.spectator);
  btn.disabled = !canStart;
  btn.textContent = st.autoStartEndsAt ? 'HITUNGAN MUNDUR BERJALAN…' : (canStart ? 'MULAI SEKARANG →' : `MULAI (${st.counts.online}/3 ONLINE)`);
  if (st.autoStartEndsAt) btn.disabled = true;

  $('lb-list').innerHTML = st.players.map(p => `
    <div class="lbrow"><span class="nm" style="font-size:14px">${esc(p.name)}${p.pid === (st.me && st.me.pid) ? ' (kamu)' : ''}${p.bot ? ' <span class="bottag">BOT</span>' : ''}</span>
    <span class="micro">${p.bot ? 'pemain AI' : p.spectator ? 'penonton' : p.connected ? 'online' : 'terputus'}</span></div>`).join('');
}
$('lb-start').onclick = () => socket.emit('player:action', { action: 'start' });

/* ---------- BRIEF ---------- */
function briefMini(st, big){
  const b = st.brief;
  if (!b) return '';
  const imgBlock = `<img class="prodimg" src="${b.image}" alt="Foto ${esc(b.product)}">`;
  const head = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="font-size:24px">${b.emoji || b.categoryEmoji || '✦'}</span><span class="micro">${esc(b.categoryName)}</span></div>
    <div style="font-weight:800;font-size:19px;letter-spacing:-.02em">${esc(b.product)}</div>
    <div class="micro" style="color:var(--accent-light);margin:4px 0 8px">${esc(b.brand)} · ${esc(b.price || '-')}</div>
    <div style="font-size:13.5px;color:rgba(var(--cream-rgb),.7);line-height:1.55">${esc(b.desc)}</div>
    <div style="font-size:13px;margin-top:8px" class="serif">${esc(b.usp || '')}</div>
    ${b.mandatory ? `<div class="micro" style="margin-top:8px;color:#f5c069">WAJIB DI POSTER: "${esc(b.mandatory)}"</div>` : ''}`;
  if (big){
    return `<div class="bwrap">${imgBlock}<div>${head}</div></div>`;
  }
  return `<div class="brief-mini">${imgBlock}<div>${head}</div></div>`;
}
function rBrief(st){ showOnly('pj-brief'); $('b-card').innerHTML = briefMini(st, true); }

/* ---------- PROMPTING (tulis bebas utama + bantuan kata) ---------- */
const ta = $('p-text');

/* sisipkan frasa ke textarea (kalau belum ada) */
function insertPhrase(phrase){
  if (ta.disabled) return;
  const cur = ta.value.trim();
  if (cur.includes(phrase)){ SFX.back(); return; } /* sudah ada — abaikan */
  ta.value = (cur ? cur.replace(/[.\s]+$/, '') + ', ' : '') + phrase;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  updateCounter();
  updateSendState();
  paintHelpSelections();
  SFX.click();
}

/* tandai pilihan bantuan yang sudah masuk ke prompt */
function paintHelpSelections(){
  const v = ta.value;
  document.querySelectorAll('#p-groups button').forEach(b => {
    b.classList.toggle('sel', v.includes(b.dataset.o));
  });
}

function renderGroups(st){
  const box = $('p-groups');
  if (box.dataset.for === st.brief.id) return;
  box.dataset.for = st.brief.id;
  /* satu baris per grup: label kecil + chip frasa yang mengalir wrap */
  box.innerHTML = st.promptGroups.map(g => `
    <div class="hrow" data-g="${g.id}">
      <span class="hl">${esc(g.label)}</span>
      <div class="hchips">
        ${g.options.map(o => `<button data-o="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>
    </div>`).join('');
  box.querySelectorAll('button').forEach(btn => btn.onclick = () => insertPhrase(btn.dataset.o));
  paintHelpSelections();
}

function updateSendState(){
  const sub = S && S.me && S.me.submission;
  const frozen = sub && (sub.locked || sub.regenUsed);
  $('p-send').disabled = !!frozen || !ta.value.trim();
  $('p-lock').disabled = !!locked2(sub) || !(sub && sub.prompt);
}
function locked2(sub){ return !!(sub && sub.locked); }

ta.addEventListener('input', () => { updateCounter(); updateSendState(); paintHelpSelections(); });

function rPrompt(st){
  showOnly('pj-prompt');
  if (st.me && st.me.spectator){
    showOnly('pj-lobby');
    $('lb-count').textContent = 'KAMU PENONTON RONDE INI — IKUT MAIN RONDE BERIKUTNYA';
    return;
  }
  $('p-brief').innerHTML = briefMini(st);
  renderGroups(st);

  const sub = st.me && st.me.submission;
  const locked = sub && sub.locked;
  const regenUsed = sub && sub.regenUsed;

  if (ta.dataset.round !== String(st.roundIndex)){
    ta.dataset.round = String(st.roundIndex);
    ta.value = (sub && sub.prompt) || '';
    updateCounter();
  }

  const frozen = !!locked || !!regenUsed;
  ta.disabled = frozen;
  document.querySelectorAll('#p-groups button').forEach(b => b.disabled = frozen);
  $('p-send').disabled = frozen || !ta.value.trim();
  $('p-lock').disabled = !!locked || !(sub && sub.prompt);
  $('p-lock').textContent = locked ? 'SUDAH KUNCI ✓' : 'KUNCI 🔒 FINAL';
  $('p-note').textContent = locked
    ? 'Prompt kamu terkunci — tunggu yang lain selesai…'
    : regenUsed ? 'Sudah final (kesempatan ulang sudah dipakai)'
    : (sub && sub.prompt) ? 'Terkirim ✓ — masih bisa diubah, atau kunci sekarang.'
    : 'Tulis bebas di kotak besar — bingung? buka 🖐 Bantuan kata di bawah.';

  $('p-regen').style.display = (st.me && st.me.canRegen && (sub && sub.prompt) && !locked) ? 'inline-block' : 'none';

  /* tips */
  if (!ta.dataset.tipsFor || ta.dataset.tipsFor !== st.brief.category){
    ta.dataset.tipsFor = st.brief.category;
    $('p-tips').innerHTML = st.categoryTips
      ? `<details><summary>Tips Prompt ${esc(st.brief.categoryName)}</summary>
         <div class="tip">${st.categoryTips.map(([t, d]) => `<b>${esc(t)}</b><span>${esc(d)}</span>`).join('')}</div></details>`
      : '';
  }

  if (sub && sub.preview){
    $('p-preview').style.display = 'block';
    $('p-preview').innerHTML = `<div class="micro" style="margin-bottom:6px">HASIL GENERATE ULANG</div><img src="${img(sub.preview)}" alt="pratinjau">`;
  } else $('p-preview').style.display = 'none';
}

function updateCounter(){
  const n = ta.value.length;
  $('p-counter').textContent = n + ' / 400 huruf';
  $('p-counter').classList.toggle('max', n >= 400);
}
function sendPrompt(){
  const text = ta.value.trim();
  if (!text) return;
  socket.emit('player:action', { action: 'prompt', data: { prompt: text } });
  SFX.send();
}
$('p-send').onclick = () => sendPrompt();
$('p-lock').onclick = () => {
  if (ta.value.trim() !== ((S.me.submission && S.me.submission.prompt) || '')) sendPrompt();
  setTimeout(() => socket.emit('player:action', { action: 'lock' }), 250);
  SFX.send();
};
$('p-regen').onclick = () => {
  if (ta.value.trim() !== ((S.me.submission && S.me.submission.prompt) || '')) sendPrompt();
  setTimeout(() => socket.emit('player:action', { action: 'regen' }), 250);
};

/* ---------- GENERATING ---------- */
function rGen(st){ showOnly('pj-gen'); }

/* ---------- GALERI ---------- */
function rGallery(st){
  showOnly('pj-gallery');
  const g = st.gallery[st.galleryCursor];
  $('g-spot').innerHTML = g && g.file
    ? `<div class="spot"><span class="lbadge" style="width:44px;height:44px;font-size:20px;top:-10px;left:-10px">${g.letter}</span><img src="${img(g.file)}" style="max-height:40vh;border-radius:14px" alt="Poster ${g.letter}"></div>`
    : '';
}

/* ---------- VOTING: rate 1-10 satu per satu ----------
   DOM statis: tidak ada innerHTML sama sekali — hanya tukar src gambar
   saat poster berganti + preload poster berikutnya supaya mulus. */
const vImg = $('v-img');
let vShownFile = null, vShownLetter = null;

/* sekali pasang: tombol nilai */
document.querySelectorAll('#v-rate button').forEach(b => b.onclick = () => {
  if (!(S && S.me && S.me.rating) || S.me.rating.isMine) return;
  socket.emit('player:action', { action: 'rate', data: { letter: S.me.rating.letter, score: Number(b.dataset.n) } });
  document.querySelectorAll('#v-rate button').forEach(x => x.classList.toggle('sel', x === b));
  $('v-status').textContent = `Nilai ${b.dataset.n} terkirim ✓ — bisa diganti sebelum poster berpindah`;
  SFX.click();
});

function rVote(st){
  showOnly('pj-vote');
  if (st.me && st.me.spectator){
    showOnly('pj-lobby');
    $('lb-count').textContent = 'PENONTON TIDAK IKUT MENILAI RONDE INI';
    return;
  }
  const rt = st.me && st.me.rating;
  const g = st.gallery[st.galleryCursor];
  if (!rt || !g) return;

  $('v-progress').textContent = `POSTER ${st.galleryCursor + 1}/${st.galleryTotal}`;

  /* gambar hanya berganti bila file berubah */
  if (g.file !== vShownFile){
    vShownFile = g.file;
    if (g.file){
      if (vImg.getAttribute('src') !== img(g.file)) vImg.src = img(g.file);
      vImg.style.display = 'block';
      $('v-fail').style.display = 'none';
    } else {
      vImg.style.display = 'none';
      $('v-fail').style.display = 'flex';
    }
  }
  if (rt.letter !== vShownLetter){
    vShownLetter = rt.letter;
    $('v-letter').textContent = rt.letter;
    document.querySelectorAll('#v-rate button').forEach(b => b.classList.remove('sel'));
  }

  $('v-mine').style.display = rt.isMine ? 'block' : 'none';
  $('v-rater').style.display = rt.isMine ? 'none' : 'block';
  if (!rt.isMine){
    document.querySelectorAll('#v-rate button').forEach(b =>
      b.classList.toggle('sel', Number(b.dataset.n) === rt.myScore));
    $('v-status').textContent = rt.myScore
      ? `Nilaimu: ${rt.myScore} — bisa diganti sebelum poster berpindah`
      : 'Belum menilai — ketuk angka di atas';
  }

  /* preload poster berikutnya supaya transisi langsung tampil */
  const nextG = st.gallery[st.galleryCursor + 1];
  if (nextG && nextG.file){
    const pre = new Image();
    pre.src = img(nextG.file);
  }
}

/* ---------- REVEAL = PODIUM RONDE (langsung semua hasil) ---------- */
let lastRevealKeyP = null;

function rReveal(st){
  showOnly('pj-reveal');
  const items = (st.reveal || []).slice().sort((a, b) => b.roundTotal - a.roundTotal);
  if (!items.length){ $('r-box').innerHTML = '<div class="micro">menyiapkan…</div>'; return; }

  const key = st.roundIndex + ':' + items.length + ':' + items[0].roundTotal;
  if (lastRevealKeyP === key) return; /* anti-kedip */
  lastRevealKeyP = key;

  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const top3 = items.slice(0, 3);
  const others = items.slice(3);
  const champ = top3[0];
  const runnerUp = top3.slice(1);

  const cardHTML = (it, rank, big) => `
    <div class="tribune ${big ? 'tb1' : ''}" style="${big ? 'order:-1;flex-basis:100%;max-width:none' : 'min-width:44%'}">
      <div class="medal">${medals[rank]}</div>
      <div class="tp">${it.file ? `<img src="${img(it.file)}" alt="" style="${big ? 'max-height:42vh;object-fit:contain;margin:0 auto' : ''}">` : '<div class="nofile">gagal</div>'}</div>
      <div class="who">${esc(it.name)}</div>
      <div class="pts">⭐${it.ratings.avg} · ${it.roundTotal} poin${it.jury ? ' · ★juri' : ''}${it.speed ? ' · ⚡' : ''}</div>
      ${big ? `<div class="promptmini">❯ ${esc(it.prompt || '')}</div>` : ''}
    </div>`;

  $('r-box').innerHTML = `
    <div class="micro" style="text-align:center;margin-bottom:10px">HASIL RONDE ${st.roundIndex + 1}</div>
    <div class="roundpodium" style="flex-wrap:wrap">
      ${cardHTML(champ, 1, true)}
      ${runnerUp.map((it, i) => cardHTML(it, i + 2, false)).join('')}
    </div>
    ${others.length ? `
      <div class="micro" style="margin:12px 0 8px">POSTER LAINNYA</div>
      <div class="otherow">
        ${others.map(it => `
          <div class="ocell">
            ${it.file ? `<img src="${img(it.file)}" loading="lazy" alt="">` : '<div class="nofile">gagal</div>'}
            <div class="who">${esc(it.name)}</div>
            <div class="pts mono">⭐${it.ratings.avg}</div>
          </div>`).join('')}
      </div>` : ''}
    <p class="micro" style="text-align:center;margin-top:12px">SKOR MENYUSUL OTOMATIS…</p>`;
}

/* ---------- SCORES ---------- */
function rScores(st){
  showOnly('pj-scores');
  const lb = st.leaderboard || [];
  $('s-list').innerHTML = lb.map((r, i) => `
    <div class="lbrow" style="animation-delay:${i * 50}ms;${r.pid === (st.me && st.me.pid) ? 'border-color:var(--accent);background:rgba(227,0,12,.08)' : ''}">
      <span class="rank">${r.rank}</span><span class="nm">${esc(r.name)}</span>
      <span class="sc">${r.score}</span>
    </div>`).join('');
}

/* ---------- PODIUM ---------- */
function rPodium(st){
  showOnly('pj-podium');
  const rank = st.finalRanking || [];
  const me = st.me && st.me.pid;
  const champ = rank[0];
  const meRow = rank.find(r => r.pid === me);
  $('pod-champ').textContent = champ ? `👑 ${champ.name} — Prompt Champ!` : '—';
  $('pod-you').textContent = meRow
    ? (meRow.rank === 1 ? 'KAMU JUARANYA! 🎉' : `Kamu peringkat ${meRow.rank} dengan ${meRow.score} poin — hebat!`)
    : 'Terima kasih sudah bermain!';

  /* top-3 dengan posternya */
  const medals = { 1: '👑', 2: '🥈', 3: '🥉' };
  $('pod-list').innerHTML =
    rank.slice(0, 3).map(r => `
      <div class="lbrow" style="border-color:rgba(245,192,105,.5);background:rgba(245,192,105,.07)">
        <span class="rank">${medals[r.rank] || r.rank}</span>
        ${r.poster ? `<img src="${img(r.poster.file)}" style="width:44px;height:55px;object-fit:cover;border-radius:8px;border:1px solid var(--line-dark)" alt="">` : ''}
        <span class="nm" style="font-size:14px">${esc(r.name)}<br><span class="micro">⭐${r.poster ? r.poster.avg : '-'} · ${r.score} pts</span></span>
      </div>`).join('') +
    /* sisa poster di bawah */
    (rank.slice(3).some(r => r.poster)
      ? '<div class="micro" style="margin:14px 0 8px">POSTER PEMAIN LAINNYA</div>' +
        '<div class="votegrid">' + rank.slice(3).filter(r => r.poster).map(r => `
          <div class="pcell">
            <span class="lb">#${r.rank}</span>
            <img src="${img(r.poster.file)}" loading="lazy" alt="Poster ${esc(r.name)}">
            <div style="padding:6px 8px;font-size:12px;font-weight:700">${esc(r.name)}</div>
          </div>`).join('') + '</div>'
      : '');
}

/* ---------- ticker ---------- */
runTicker(() => {
  if (!S || S.paused) return null;
  const map = { brief: 'b-timer', prompting: 'p-timer', voting: 'v-timer' };
  const el = map[S.phase] && $(map[S.phase]);
  if (!el) return null;
  const ms = Clock.remaining(S.endsAt);
  if (ms == null) return null;
  el.querySelector('.num').textContent = fmtCountdown(ms);
  el.classList.toggle('low', ms <= 10000);
  return { ms };
});

/* ---------- confetti mini ---------- */
function spawnMiniConfetti(){
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#e3000c', '#ff7a80', '#f5c069', '#f6efee'];
  for (let i = 0; i < 50; i++){
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
    c.style.animationDelay = (Math.random() * 0.6) + 's';
    box.appendChild(c);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

/* ---------- hitung mundur mulai otomatis (lobby) ---------- */
let asLastSecP = null;
setInterval(() => {
  const on = S && S.phase === 'lobby' && S.autoStartEndsAt;
  const banner = $('as-banner-p');
  if (!on){ banner.style.display = 'none'; asLastSecP = null; return; }
  banner.style.display = 'block';
  const ms = Clock.remaining(S.autoStartEndsAt);
  const sec = Math.max(0, Math.ceil(ms / 1000));
  $('as-count-p').textContent = sec;
  if (sec !== asLastSecP){ asLastSecP = sec; if (sec > 0) SFX.tick(); }
}, 250);

initMuteButtons();

/* tampilkan layar yang tepat SEBELUM event state pertama datang:
   - punya token → coba reconnect dulu (layar tunggu)
   - belum → langsung tampilkan form join */
if (myToken){
  $('lb-name').textContent = '…';
  $('lb-count').textContent = 'MENGHUBUNGKAN KEMBALI…';
  showOnly('pj-lobby');
} else {
  showOnly('pj-join');
}
