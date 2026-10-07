'use strict';
/* ============================================================
   BOT TEST — simulasi pemain untuk menguji game tanpa HP.
   Pakai:  node test/bots.js [KODE] [JUMLAH]
   Jika KODE kosong: membuat room baru sendiri (host juga bot).
   Semua fase didorong otomatis: brief → prompt → gallery →
   voting → reveal → scores, sampai podium.
   ============================================================ */

const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CODE_ARG = process.argv[2] || '';
const N = Math.max(3, Math.min(30, parseInt(process.argv[3] || '10', 10)));

const NAMA = ['Bu Rina','Pak Deng','Sari','Budi','Mega','Joko','Lina','Andi','Fitri','Rangga','Tika','Dewi','Eko','Wulan','Fajar','Nadia','Gilang','Ratna','Hasan','Yuni','Tono','Vina','Iqbal','Mira','Deni','Lala','Agus','Nia','Rico','Zahra'];

const VOCAB = {
  beverages: [
    'foto close-up {produk} di gelas plastik bening penuh es batu jernih, embun di gelas, percikan susu, latar meja kayu kafe, cahaya alami lembut, tulis nama brand {brand} besar di atas dan tagline di bawah',
    '{produk} dua gelas dengan latar marble putih, potongan lemon segar jatuh, cahaya terang segar, warna dominan hijau dan putih, gaya foto produk komersial, nama {brand} di tengah poster',
    'ilustrasi flat design {produk} dengan buah di sekeliling, latar warna pastel, teks nama {brand} playful di atas, harga di bawah, gaya poster medsos yang ceria',
  ],
  food: [
    'close-up tekstur {produk} dari atas dengan uap panas tipis, saus meleleh, latar papan kayu rustik, cahaya hangat sidelight, warna coklat dan merah hangat, nama {brand} tebal di atas',
    '{produk} disajikan di piring keramik putih dengan lalapan segar, flat-lay dari atas, cahaya alami, gaya foto menu rumah makan, nama {brand} dan promo di bawah poster',
    'ilustrasi retro {produk} dengan bumbu di sekelilingnya, latar merah kuning cerah, teks besar nama {brand} gaya poster warung klasik Indonesia',
  ],
  fashion: [
    'model setengah badan tersenyum memakai {produk}, latar dinding beton, cahaya pagi lembut, pose santai, tekstur kain terlihat jelas, nama {brand} minimalis di atas, harga di bawah',
    '{produk} flat-lay rapi di atas kain linen krem dengan aksesori pendukung, foto dari atas, cahaya studio lembut, gaya editorial majalah, brand {brand} di pojok poster',
    'model berjalan santai di gang kota memakai {produk}, golden hour, gaya street photography, warna netral earth tone, nama {brand} besar tipografi modern',
  ],
};
function pick(a){ return a[Math.floor(Math.random() * a.length)]; }
function makePrompt(brief){
  return pick(VOCAB[brief.category] || VOCAB.beverages)
    .replaceAll('{produk}', brief.product)
    .replaceAll('{brand}', brief.brand)
    .slice(0, 400);
}

/* ---------- log ringkas ---------- */
let logCount = 0;
function log(...a){ if (logCount++ < 400) console.log('[bot]', ...a); }

async function main(){
  /* room: pakai argumen atau buat baru */
  let code = CODE_ARG.toUpperCase();
  let hostToken = null;
  if (!code){
    const res = await fetch(BASE + '/api/create', { method: 'POST' });
    const data = await res.json();
    code = data.code; hostToken = data.hostToken;
    console.log(`[bot] Room dibuat: ${code} — buka ${BASE}/h/${code}`);
  } else {
    console.log(`[bot] Join room yang ada: ${code}`);
  }

  /* host socket (mendorong fase) */
  const host = io(BASE);
  let hostReady = !hostToken; /* tanpa token: host manusia yang menjalankan */

  if (hostToken){
    host.on('connect', () => { host.emit('host:auth', { code, hostToken }); });
    host.on('state', st => {
      hostReady = true;
      onHostState(st);
    });
  }

  let finished = false;
  const advancedAt = new Set();
  let lastTrace = '';
  function trace(st){
    const key = st.phase + st.roundIndex + (st.phase === 'reveal' ? ':' + st.revealCursor : '');
    if (key === lastTrace) return;
    lastTrace = key;
    console.log(`[host] R${st.roundIndex + 1} ${st.phase}` +
      (st.counts ? ` | pemain:${st.counts.total} kirim:${st.counts.submitted} kunci:${st.counts.locked} gambar:${st.counts.imagesOk}/${st.counts.imagesTotal} vote:${st.counts.voted}` : ''));
  }
  function onHostState(st){
    if (finished || !hostToken) return;
    trace(st);
    if (st.phase === 'reveal'){
      /* dorong reveal item per item, kunci dedup per ronde+cursor */
      const key = 'rv:' + st.roundIndex + ':' + st.revealCursor;
      if (!advancedAt.has(key)){
        advancedAt.add(key);
        setTimeout(() => host.emit('host:action', { action: 'next' }), st.revealCursor === st.revealTotal - 1 ? 1000 : 700);
      }
    }
    if (st.phase === 'scores'){
      /* jeda sebentar biar papan skor kebaca, lalu ronde berikutnya/podium */
      const key = 'sc:' + st.roundIndex;
      if (!advancedAt.has(key)){
        advancedAt.add(key);
        setTimeout(() => host.emit('host:action', { action: 'next' }), 1200);
      }
    }
  }

  /* pemain bot */
  const bots = [];
  for (let i = 0; i < N; i++){
    bots.push(makeBot(code, `${NAMA[i % NAMA.length]}${i >= NAMA.length ? ' ' + (Math.floor(i / NAMA.length) + 1) : ''}`));
    await sleep(60);
  }

  /* mulai game kalau kita host-nya */
  if (hostToken){
    await waitPhase(host, 'lobby');
    /* persingkat durasi pengujian */
    host.emit('host:action', { action: 'settings', data: { settings: { promptMs: 30000, voteMs: 15000 } } });
    await sleep(400);
    console.log(`[bot] ${bots.filter(b => b.joined).length}/${N} bot join — mulai game`);
    host.emit('host:action', { action: 'start' });
  }

  /* pantau selesai via host state */
  if (hostToken){
    host.on('state', st => { if (st.phase === 'podium') finish(st); });
  } else {
    /* tanpa host bot: temani selama 3 jam atau sampai room ditutup */
    setTimeout(() => finish(null), 3 * 60 * 60 * 1000);
  }

  function finish(st){
    if (finished) return; finished = true;
    console.log('[diag] finish dipanggil dari:', new Error().stack.split('\n').slice(1, 3).join(' | '));
    console.log('\n===== HASIL AKHIR =====');
    if (st && st.finalRanking){
      st.finalRanking.forEach(r => console.log(`  ${r.rank}. ${r.name} — ${r.score} poin (${r.firstVotes}× pilihan-1)`));
    } else console.log('  (podium belum tercapai)');
    console.log('=======================\n');
    setTimeout(() => process.exit(0), 600);
  }

  process.on('SIGINT', () => { console.log('\n[bot] berhenti manual'); process.exit(0); });
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function waitPhase(sock, phase, timeoutMs = 15000){
  return new Promise(res => {
    const t = setTimeout(res, timeoutMs);
    const h = st => { if (st.phase === phase){ clearTimeout(t); sock.off('state', h); res(); } };
    sock.on('state', h);
  });
}

function makeBot(code, name){
  const bot = { name, joined: false, sock: io(BASE), lastState: null };
  bot.sock.on('connect', () => {
    bot.sock.emit('room:join', { code, name });
  });
  bot.sock.on('joined', () => { bot.joined = true; });
  bot.sock.on('action:result', r => {
    /* rating ke-reject (poster sendiri/sudah berganti) → boleh coba poster berikutnya */
    if (r && r.action === 'rate' && r.ok === false){
      bot.rateAt = null;
    }
  });
  bot.sock.on('state', st => {
    bot.lastState = st;
    try { act(bot, st); } catch (e){ log('error', name, e.message); }
  });
  bot.sock.on('join:failed', r => { log(name, 'GAGAL JOIN:', r.reason); });
  bot.sock.on('room:closed', () => { log('Room ditutup — bot berhenti'); process.exit(0); });
  /* server tidak broadcast selama fase berjalan — bot menilai state terakhir
     secara periodik agar berperilaku seperti manusia yang mengetik sendiri */
  bot.timer = setInterval(() => {
    if (bot.lastState){
      try { act(bot, bot.lastState); } catch (e){}
    }
  }, 700);
  return bot;
}

function act(bot, st){
  const me = st.me;
  if (!me) return;

  if (st.phase === 'prompting' && !me.spectator){
    const sub = me.submission;
    if (!sub || !sub.locked){
      /* tulis prompt dengan jeda acak supaya ada bonus kecepatan beda-beda */
      if (bot.promptAt == null) bot.promptAt = Date.now() + Math.floor(Math.random() * 15000);
      if (Date.now() >= bot.promptAt){
        if (!sub || !sub.prompt){
          bot.sock.emit('player:action', { action: 'prompt', data: { prompt: makePrompt(st.brief) } });
        } else if (!bot.regenUsed && st.settings.allowRegen && Math.random() < 0.2){
          bot.regenUsed = true;
          bot.sock.emit('player:action', { action: 'regen' });
        } else {
          bot.sock.emit('player:action', { action: 'lock' });
        }
      }
    }
  }

  if (st.phase === 'voting' && !me.spectator){
    /* rating: nilai 1-10 poster yang sedang tampil (milik sendiri dilewati server) */
    const rt = me.rating;
    if (rt && !rt.isMine && !rt.myScore){
      if (bot.rateAt == null) bot.rateAt = Date.now() + Math.floor(Math.random() * 4000);
      if (Date.now() >= bot.rateAt && rt.letter !== bot.ratedLetter){
        bot.ratedLetter = rt.letter;
        bot.rateAt = null;
        const score = 4 + Math.floor(Math.random() * 7); /* 4-10, bot baik hati */
        bot.sock.emit('player:action', { action: 'rate', data: { letter: rt.letter, score } });
        log(bot.name, 'rate', rt.letter, '=', score);
      }
    }
  }
}

/* jaga proses tetap hidup */
setInterval(() => {}, 1 << 30);

main().catch(e => { console.error('[bot] FATAL:', e); process.exit(1); });
