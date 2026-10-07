'use strict';
/* ============================================================
   ROOM MANAGER + MESIN FASE — server adalah sumber kebenaran
   untuk timer & fase; klien hanya menampilkan.
   ============================================================ */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const os = require('os');

const { CATEGORIES, BRIEFS, ASSET_BRIEF_IDS, promptGroups } = require('./briefs');
const moderation = require('./moderation');
const imageProvider = require('./imageProviders');
const products = require('./products');

const DATA_DIR = path.join(__dirname, '..', 'data', 'rooms');
const ROUND_PODIUM_MS = 12000; /* podium ronde tampil 12 dtk lalu lanjut sendiri */
const SCORES_AUTO_MS = 9000;   /* papan skor tampil 9 dtk lalu ronde berikutnya/podium */
const GENERATE_CAP_MS = 120000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; /* tanpa huruf ambigu */

function id(){ return crypto.randomBytes(8).toString('hex'); }
function shuffle(a){ a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

class Room {
  constructor(code){
    this.code = code;
    this.hostToken = id();
    this.createdAt = Date.now();
    this.lastActive = Date.now();
    this.hostSocket = null;          /* socket aktif host (boleh diganti tab) */
    this.playerSockets = new Map();  /* pid -> socket */

    this.settings = {
      rounds: 3,
      briefMs: 15000,
      promptMs: 90000,
      voteMs: 45000,
      ratingPerMs: 12000,            /* detik per poster saat rating */
      allowRegen: true,
      showTips: true,
      juryEnabled: true,
      categoryMode: 'random',        /* random | beverages | food | fashion */
      autoStart: true,               /* mulai otomatis saat pemain cukup */
      autoStartAt: 5,                /* jumlah pemain target */
    };

    /* antrian brief — default: brief beraset asli dulu, sisanya acak */
    this.briefs = BRIEFS.map(b => ({ ...b }));
    this.briefOrder = pickBriefOrder(this);

    this.players = new Map();        /* pid -> player */
    this.phase = 'lobby';
    this.roundIndex = -1;
    this.round = null;               /* state ronde aktif */
    this.totals = new Map();         /* pid -> total kumulatif */
    this.firstVotesTotal = new Map();/* pid -> jumlah suara pilihan-1 kumulatif */
    this.lastLeaderboard = null;
    this.history = [];               /* rekap per ronde: {roundIndex, brief, items:[{pid,name,letter,prompt,file,points,speed,jury}]} */
    this.juryPick = null;            /* pid pilihan juri ronde ini */
    this.paused = false;
    this.remainingMs = null;
    this.endsAt = null;
    this.timer = null;
    this.carousel = null;
    this.autoStartTimer = null;      /* countdown mulai otomatis di lobby */
    this.autoStartEndsAt = null;
    this.closed = false;
    this.finalRanking = null;

    this.joinUrl = null;
    this.qr = null;
    this.imagesDir = path.join(DATA_DIR, code);
  }

  activePlayers(){ return [...this.players.values()].filter(p => !p.kicked); }
  votableCount(){ /* pemain dengan poster sukses ronde ini */
    if (!this.round) return 0;
    let n = 0;
    for (const [pid, s] of this.round.submissions){
      const p = this.players.get(pid);
      if (p && !p.kicked && !p.spectator && s.imageStatus === 'ok') n++;
    }
    return n;
  }
}

/* ---------------- Manajer ---------------- */
const rooms = new Map();

function makeCode(){
  for (let tries = 0; tries < 30; tries++){
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return 'XXXX';
}

function lanAddress(){
  const ifs = os.networkInterfaces();
  for (const list of Object.values(ifs)){
    for (const ni of list || []){
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return '127.0.0.1';
}

async function createRoom(io){
  const code = makeCode();
  const room = new Room(code);
  const port = process.env.PORT || 3000;
  room.joinUrl = `http://${lanAddress()}:${port}/p/${code}`;
  try { room.qr = await QRCode.toDataURL(room.joinUrl, { width: 320, margin: 1, color: { dark: '#17100f', light: '#ffffff' } }); }
  catch { room.qr = null; }
  rooms.set(code, room);
  console.log(`[rooms] Room dibuat: ${code} — join: ${room.joinUrl}`);
  return room;
}

function getRoom(code){ return rooms.get(String(code || '').toUpperCase()); }

function closeRoom(io, room){
  if (room.closed) return;
  room.closed = true;
  clearTimeout(room.timer); clearInterval(room.carousel);
  clearStartCountdown(room);
  /* io boleh null (mis. dipanggil sweeper TTL) — jangan sampai crash */
  if (io && typeof io.to === 'function') io.to(room.code).emit('room:closed');
  fs.rm(room.imagesDir, { recursive: true, force: true }, () => {});
  rooms.delete(room.code);
  console.log(`[rooms] Room ditutup: ${room.code}${io ? '' : ' (TTL kedaluwarsa, tidak ada siaran)'}`);
}

/* ---------------- Mulai otomatis / mulai oleh pemain ---------------- */
const AUTO_START_MS = 5000;

function lobbyPlayerCount(room){
  /* hanya pemain yang benar-benar terhubung yang dihitung —
     pemain putus (hantu) tidak boleh memicu mulai otomatis */
  return room.activePlayers().filter(p => !p.spectator && p.connected).length;
}

function clearStartCountdown(room){
  clearTimeout(room.autoStartTimer);
  room.autoStartTimer = null;
  room.autoStartEndsAt = null;
  room.autoStartForced = false;
}

/* mulai hitung mundur 5 detik; forced=true berarti dipicu tombol pemain */
function maybeStartCountdown(io, room, forced){
  if (room.closed || room.phase !== 'lobby' || room.autoStartTimer) return;
  if (lobbyPlayerCount(room) < 3) return;
  room.autoStartForced = !!forced;
  room.autoStartEndsAt = Date.now() + AUTO_START_MS;
  room.autoStartTimer = setTimeout(() => {
    clearStartCountdown(room);
    if (room.closed || room.phase !== 'lobby') return;
    if (lobbyPlayerCount(room) < 3){ broadcast(io, room); return; }
    console.log(`[room ${room.code}] game mulai ${forced ? 'oleh pemain' : 'otomatis (pemain cukup)'}`);
    const r = startGame(io, room);
    if (!r.ok) broadcast(io, room);
  }, AUTO_START_MS);
  broadcast(io, room);
}

/* evaluasi ulang: mulai jika pemain cukup, batal jika syarat hilang */
function evaluateAutoStart(io, room){
  if (room.closed) return;
  if (room.autoStartTimer){
    /* hitung mundur berjalan — batal hanya jika pemain online < 3 */
    if (room.phase !== 'lobby' || lobbyPlayerCount(room) < 3){
      clearStartCountdown(room);
      broadcast(io, room);
    }
    return;
  }
  const enough = room.phase === 'lobby'
    && room.settings.autoStart
    && lobbyPlayerCount(room) >= Math.max(3, room.settings.autoStartAt)
    && room.hostSocket; /* layar host harus terhubung */
  if (enough) maybeStartCountdown(io, room, false);
}

/* antri pembersihan room tua */
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms){
    if (now - room.lastActive > ROOM_TTL_MS) closeRoom(null, room);
  }
}, 30 * 60 * 1000).unref();

/* ---------------- Alur game ---------------- */

function briefById(room, bid){ return room.briefs.find(b => b.id === bid); }

function startGame(io, room){
  clearStartCountdown(room);
  if (room.activePlayers().filter(p => !p.spectator).length < 3 && room.activePlayers().length < 3){
    return { ok:false, reason:'Butuh minimal 3 pemain untuk mulai.' };
  }
  room.roundIndex = -1;
  room.totals.clear(); room.firstVotesTotal.clear();
  room.lastLeaderboard = null;
  nextRound(io, room);
  return { ok:true };
}

function nextRound(io, room){
  room.roundIndex += 1;
  /* pemain yang tadinya penonton kini ikut bermain */
  for (const p of room.players.values()) if (!p.kicked) p.spectator = false;

  const bid = room.briefOrder[room.roundIndex % room.briefOrder.length];
  const brief = briefById(room, bid);
  room.juryPick = null;

  room.round = {
    briefId: bid,
    category: brief.category,
    submissions: new Map(), /* pid -> {prompt, regenUsed, previewFile, lockedAt, imageStatus, imageFile, speedBonus} */
    galleryOrder: [],
    galleryCursor: -1,       /* indeks poster yang sedang dinilai (rating satu-per-satu) */
    ratings: new Map(),      /* posterPid -> Map<voterPid, skor 1-10> */
    revealCursor: -1,
    revealItems: null,
    roundResults: null,
  };
  setPhase(io, room, 'brief', room.settings.briefMs);
}

function setPhase(io, room, phase, durationMs){
  clearTimeout(room.timer); clearInterval(room.carousel);
  room.phase = phase;
  room.paused = false; room.remainingMs = null;
  room.endsAt = durationMs ? Date.now() + durationMs : null;
  if (durationMs){
    room.timer = setTimeout(() => phaseEnded(io, room), durationMs);
  }
  broadcast(io, room);
  console.log(`[room ${room.code}] fase -> ${phase}${durationMs ? ` (${Math.round(durationMs / 1000)}s)` : ''}`);
}

function phaseEnded(io, room){
  switch (room.phase){
    case 'brief': startPrompting(io, room); break;
    case 'prompting': startGenerating(io, room); break;
    case 'voting': finishVoting(io, room); break;
    default: break; /* fase lain dikendalikan proses/host */
  }
}

function startPrompting(io, room){
  setPhase(io, room, 'prompting', room.settings.promptMs);
}

async function startGenerating(io, room){
  /* kunci semua yang belum, tandai status pending */
  for (const [pid, s] of room.round.submissions){
    if (!s.lockedAt) s.lockedAt = Date.now();
    if (!s.imageStatus) s.imageStatus = 'pending';
  }
  setPhase(io, room, 'generating', null);

  const tasks = [];
  for (const [pid, s] of room.round.submissions){
    if (s.imageStatus === 'ok') continue; /* preview regen sudah ada */
    const p = room.players.get(pid);
    if (!p || p.kicked || p.spectator){ s.imageStatus = 'skip'; continue; }
    tasks.push({ pid, s });
  }

  /* pengaman: lanjut maksimal GENERATE_CAP_MS */
  const cap = setTimeout(() => proceedGallery(io, room), GENERATE_CAP_MS);

  if (tasks.length === 0){ clearTimeout(cap); proceedGallery(io, room); return; }

  const done = new Set();
  await imageProvider.generateAll(tasks.map(t => ({
    ctx: {
      prompt: t.s.prompt, brief: briefById(room, room.round.briefId), category: room.round.category,
      roomId: room.code, playerId: t.pid, roundIndex: room.roundIndex, regenUsed: t.s.regenUsed,
    },
    outDir: room.imagesDir,
  }))).then(results => {
    results.forEach((res, i) => {
      const { pid, s } = tasks[i];
      if (room.closed) return;
      if (res.ok){ s.imageStatus = 'ok'; s.imageFile = res.file; }
      else { s.imageStatus = 'fail'; s.imageError = res.error; }
      done.add(pid);
      broadcast(io, room);
    });
    clearTimeout(cap);
    if (!room.closed) proceedGallery(io, room);
  });
}

function proceedGallery(io, room){
  if (room.phase !== 'generating') return;
  /* urutan tampil anonim (acak) — dipakai untuk rating satu-per-satu */
  room.round.galleryOrder = shuffle([...room.round.submissions.entries()]
    .filter(([pid, s]) => { const p = room.players.get(pid); return p && !p.kicked && !p.spectator && s.imageStatus !== 'skip'; })
    .map(([pid]) => pid));
  startRating(io, room);
}

/* penilai yang sah untuk sebuah poster: online, bukan penonton, bukan pemiliknya */
function eligibleRaters(room, posterPid){
  return room.activePlayers().filter(p => !p.spectator && p.connected && p.pid !== posterPid);
}

/* sudah dinilai semua penilai yang sah? */
function allRated(room, posterPid){
  const m = room.round.ratings.get(posterPid);
  return eligibleRaters(room, posterPid).every(p => m && m.has(p.pid));
}

function startRating(io, room){
  const r = room.round;
  if (r.galleryOrder.length === 0){
    finishVoting(io, room, true);
    return;
  }
  room.phase = 'voting';
  r.galleryCursor = 0;
  scheduleNextRating(io, room);
}

/* maju ke poster berikutnya; selesai semua → tally */
function advanceRating(io, room){
  const r = room.round;
  if (r.galleryCursor + 1 >= r.galleryOrder.length){
    finishVoting(io, room, false);
    return;
  }
  r.galleryCursor += 1;
  scheduleNextRating(io, room);
}

function scheduleNextRating(io, room){
  const r = room.round;
  clearTimeout(room.timer);
  const perMs = Math.max(6000, room.settings.ratingPerMs || 12000);
  room.endsAt = Date.now() + perMs;
  room.timer = setTimeout(() => {
    if (room.phase === 'voting' && !room.paused) advanceRating(io, room);
  }, perMs);
  broadcast(io, room);
  console.log(`[room ${room.code}] rating poster ${r.galleryCursor + 1}/${r.galleryOrder.length}`);
}

function startVoting(io, room){ /* nama lama dipertahankan untuk hostActions.skip */
  if (room.phase === 'voting'){ finishVoting(io, room, false); return; }
  startRating(io, room);
}

function finishVoting(io, room, skipped = false){
  const r = room.round;
  clearTimeout(room.timer);

  const results = r.galleryOrder.map(pid => {
    const m = r.ratings.get(pid);
    const scores = m ? [...m.values()] : [];
    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = scores.length ? sum / scores.length : 0;
    const tens = scores.filter(s => s === 10).length;
    const isJury = room.settings.juryEnabled && room.juryPick === pid;
    const s = r.submissions.get(pid);
    const total = sum + (isJury ? 5 : 0);
    return {
      pid,
      letter: letterOf(room, pid),
      ratings: { sum, avg: Math.round(avg * 10) / 10, count: scores.length, tens },
      jury: isJury,
      speedBonus: s && s.speedBonus ? 1 : 0,
      roundTotal: total,
    };
  });

  /* reveal dari nilai terendah ke juara; seri: nilai-10 terbanyak di atas */
  results.sort((a, b) => (a.roundTotal - b.roundTotal)
    || (a.ratings.tens - b.ratings.tens)
    || (a.ratings.avg - b.ratings.avg)
    || a.pid.localeCompare(b.pid));
  r.revealItems = results;
  /* semua hasil langsung terbuka sekaligus — podium ronde (tanpa reveal satu-per-satu) */
  r.revealCursor = r.revealItems.length - 1;
  r.skippedVoting = skipped;

  setPhase(io, room, 'reveal', null);
  /* lanjut otomatis ke papan skor; host bisa klik LANJUT untuk mempercepat */
  room.timer = setTimeout(() => {
    if (room.phase === 'reveal') applyScores(io, room);
  }, ROUND_PODIUM_MS);
}

function letterOf(room, pid){
  const i = room.round.galleryOrder.indexOf(pid);
  return i < 0 ? '?' : String.fromCharCode(65 + i);
}

function applyScores(io, room){
  if (room.phase !== 'reveal' || !room.round || room.round.revealItems == null) return; /* jadi dobel */
  const r = room.round;

  /* simpan rekap ronde untuk halaman rekap & ZIP */
  room.history.push({
    roundIndex: room.roundIndex,
    brief: briefById(room, r.briefId),
    category: r.category,
    items: r.revealItems.map(item => ({
      ...item,
      roundIndex: room.roundIndex,
      name: room.players.get(item.pid)?.name || 'Pemain keluar',
      prompt: (r.submissions.get(item.pid) || {}).prompt || '',
      file: (r.submissions.get(item.pid) || {}).imageFile || null,
    })),
  });

  const prevTotals = new Map(room.totals);
  const prevRank = new Map();
  [...prevTotals.entries()]
    .sort((a, b) => b[1] - a[1] || (room.firstVotesTotal.get(a[0]) || 0) - (room.firstVotesTotal.get(b[0]) || 0))
    .forEach(([pid], i) => prevRank.set(pid, i + 1));

  for (const res of r.revealItems){
    const p = room.players.get(res.pid);
    const speed = res.speedBonus || 0;
    room.totals.set(res.pid, (room.totals.get(res.pid) || 0) + res.roundTotal + speed);
    room.firstVotesTotal.set(res.pid, (room.firstVotesTotal.get(res.pid) || 0) + (res.ratings.tens || 0));
    if (p) p.score = room.totals.get(res.pid);
  }

  const lb = leaderboard(room, prevRank);
  room.lastLeaderboard = lb;
  setPhase(io, room, 'scores', null);
  /* papan skor lanjut sendiri ke ronde berikutnya / podium */
  room.timer = setTimeout(() => {
    if (room.phase !== 'scores') return;
    if (room.roundIndex + 1 >= room.settings.rounds) endGame(io, room);
    else nextRound(io, room);
  }, SCORES_AUTO_MS);
}

function leaderboard(room, prevRank){
  const rows = [...room.totals.entries()].map(([pid, score]) => ({
    pid,
    name: room.players.get(pid)?.name || '?',
    score,
    firstVotes: room.firstVotesTotal.get(pid) || 0,
    prevRank: prevRank ? (prevRank.get(pid) || null) : null,
  }));
  rows.sort((a, b) => b.score - a.score || b.firstVotes - a.firstVotes || a.name.localeCompare(b.name));
  rows.forEach((row, i) => { row.rank = i + 1; row.delta = row.prevRank ? row.prevRank - row.rank : 0; });
  return rows;
}

function endGame(io, room){
  /* poster terbaik tiap pemain sepanjang game (rata-rata tertinggi) —
     dipakai di podium: top-3 tampil besar, sisanya grid di bawah */
  const best = new Map();
  for (const rd of (room.history || [])){
    for (const it of rd.items){
      if (!it.file) continue;
      const avg = (it.ratings && it.ratings.avg) || 0;
      const cur = best.get(it.pid);
      if (!cur || avg > ((cur.ratings && cur.ratings.avg) || 0)) best.set(it.pid, it);
    }
  }
  room.finalRanking = leaderboard(room, null).map(r => {
    const b = best.get(r.pid);
    return { ...r, poster: b ? { file: b.file, letter: b.letter, round: b.roundIndex + 1, avg: (b.ratings && b.ratings.avg) || 0 } : null };
  });
  setPhase(io, room, 'podium', null);
}

/* ---------------- Aksi host ---------------- */
const hostActions = {
  start(io, room){ return startGame(io, room); },
  next(io, room){
    if (room.phase === 'reveal'){ clearTimeout(room.timer); applyScores(io, room); return { ok:true }; }
    if (room.phase === 'scores'){
      clearTimeout(room.timer);
      if (room.roundIndex + 1 >= room.settings.rounds){ endGame(io, room); }
      else nextRound(io, room);
      return { ok:true };
    }
    return { ok:false, reason:'Tidak ada aksi "lanjut" di fase ini.' };
  },
  skip(io, room){
    if (room.paused) return { ok:false, reason:'Lanjutkan dulu dari jeda.' };
    if (room.phase === 'reveal'){ clearTimeout(room.timer); applyScores(io, room); return { ok:true }; }
    if (room.phase === 'brief') return phaseEnded(io, room), { ok:true };
    if (room.phase === 'prompting') return phaseEnded(io, room), { ok:true };
    if (room.phase === 'voting') return finishVoting(io, room), { ok:true };
    if (room.phase === 'generating'){ proceedGallery(io, room); return { ok:true }; }
    return { ok:false, reason:'Fase ini tidak bisa dilewati.' };
  },
  pause(io, room){
    if (room.paused) return { ok:false, reason:'Sudah jeda.' };
    if (!room.endsAt) return { ok:false, reason:'Fase ini tanpa hitung waktu.' };
    room.paused = true;
    room.remainingMs = Math.max(0, room.endsAt - Date.now());
    clearTimeout(room.timer);
    broadcast(io, room);
    return { ok:true };
  },
  resume(io, room){
    if (!room.paused) return { ok:false, reason:'Tidak sedang jeda.' };
    room.paused = false;
    const left = room.remainingMs || 0;
    room.endsAt = Date.now() + left;
    if (room.phase === 'voting'){
      /* lanjut penilaian: habis waktu poster → maju ke poster berikutnya */
      room.timer = setTimeout(() => { if (room.phase === 'voting') advanceRating(io, room); }, left);
    } else {
      room.timer = setTimeout(() => phaseEnded(io, room), left);
    }
    broadcast(io, room);
    return { ok:true };
  },
  addTime(io, room){
    if (room.paused) return { ok:false, reason:'Lanjutkan dulu dari jeda.' };
    if (room.phase !== 'prompting' && room.phase !== 'voting') return { ok:false, reason:'Tambah waktu hanya saat menulis prompt atau penilaian.' };
    room.endsAt += 30000;
    clearTimeout(room.timer);
    if (room.phase === 'voting'){
      room.timer = setTimeout(() => { if (room.phase === 'voting') advanceRating(io, room); }, room.endsAt - Date.now());
    } else {
      room.timer = setTimeout(() => phaseEnded(io, room), room.endsAt - Date.now());
    }
    broadcast(io, room);
    return { ok:true };
  },
  kick(io, room, { pid }){
    const p = room.players.get(pid);
    if (!p) return { ok:false, reason:'Pemain tidak ditemukan.' };
    p.kicked = true;
    const sock = room.playerSockets.get(pid);
    if (sock){ sock.emit('kicked'); room.playerSockets.delete(pid); }
    room.lastActive = Date.now();
    evaluateAutoStart(io, room);
    broadcast(io, room);
    return { ok:true };
  },
  jury(io, room, { pid }){
    if (!room.settings.juryEnabled) return { ok:false, reason:'Bonus juri dimatikan di pengaturan.' };
    if (room.phase !== 'gallery' && room.phase !== 'voting' && room.phase !== 'generating')
      return { ok:false, reason:'Pilihan juri dipilih saat galeri/voting.' };
    if (pid && !room.round.galleryOrder.includes(pid)) return { ok:false, reason:'Poster tidak valid.' };
    room.juryPick = room.juryPick === pid ? null : pid;
    broadcast(io, room);
    return { ok:true };
  },
  settings(io, room, { settings }){
    if (room.phase !== 'lobby') return { ok:false, reason:'Pengaturan hanya bisa diubah di lobby.' };
    const s = room.settings;
    const num = (v, min, max, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };
    if (settings.rounds != null) s.rounds = num(settings.rounds, 1, 10, s.rounds);
    if (settings.promptMs != null) s.promptMs = num(settings.promptMs, 30000, 300000, s.promptMs);
    if (settings.voteMs != null) s.voteMs = num(settings.voteMs, 15000, 120000, s.voteMs);
    if (settings.ratingPerMs != null) s.ratingPerMs = num(settings.ratingPerMs, 6000, 60000, s.ratingPerMs);
    if (settings.allowRegen != null) s.allowRegen = !!settings.allowRegen;
    if (settings.showTips != null) s.showTips = !!settings.showTips;
    if (settings.juryEnabled != null) s.juryEnabled = !!settings.juryEnabled;
    if (settings.autoStart != null) s.autoStart = !!settings.autoStart;
    if (settings.autoStartAt != null) s.autoStartAt = num(settings.autoStartAt, 3, 30, s.autoStartAt);
    if (settings.categoryMode != null && CATEGORIES[settings.categoryMode]) s.categoryMode = settings.categoryMode;
    /* antrian brief selalu dirapikan setelah pengaturan berubah */
    room.briefOrder = pickBriefOrder(room);
    evaluateAutoStart(io, room);
    broadcast(io, room);
    return { ok:true };
  },
  briefs(io, room, { briefs, briefOrder }){
    if (room.phase !== 'lobby') return { ok:false, reason:'Brief hanya bisa diubah di lobby.' };
    if (Array.isArray(briefs)){
      const clean = briefs.filter(b => b && String(b.product || '').trim()).map((b, i) => ({
        id: String(b.id || 'c' + i + '-' + id().slice(0, 4)),
        category: CATEGORIES[b.category] ? b.category : 'beverages',
        product: String(b.product).slice(0, 60),
        brand: String(b.brand || 'UMKM').slice(0, 30),
        desc: String(b.desc || '').slice(0, 200),
        target: String(b.target || '').slice(0, 80),
        price: String(b.price || '').slice(0, 30),
        usp: String(b.usp || '').slice(0, 120),
        mandatory: String(b.mandatory || '').slice(0, 60),
      }));
      room.briefs = clean.length ? clean : BRIEFS.map(b => ({ ...b }));
    }
    if (Array.isArray(briefOrder)) room.briefOrder = briefOrder.filter(x => room.briefs.some(b => b.id === x));
    if (!room.briefOrder.length) room.briefOrder = pickBriefOrder(room);
    broadcast(io, room);
    return { ok:true };
  },
  end(io, room){ endGame(io, room); return { ok:true }; },
  close(io, room){ closeRoom(io, room); return { ok:true }; },
};

function pickBriefOrder(room){
  const s = room.settings;
  let pool = room.briefs;
  if (s.categoryMode !== 'random') pool = pool.filter(b => b.category === s.categoryMode);
  if (!pool.length) pool = room.briefs;
  /* brief beraset (foto produk + contoh poster asli) selalu di awal */
  const asset = pool.filter(b => ASSET_BRIEF_IDS.includes(b.id)).map(b => b.id);
  const rest = shuffle(pool.filter(b => !ASSET_BRIEF_IDS.includes(b.id)).map(b => b.id));
  return asset.concat(rest).slice(0, s.rounds);
}


/* ---------------- Aksi pemain ---------------- */
function joinPlayer(io, room, { name, token }){
  room.lastActive = Date.now();
  /* reconnect via token */
  if (token){
    for (const p of room.players.values()){
      if (p.token === token && !p.kicked) return { ok:true, player:p };
    }
  }
  const v = moderation.validateName(name);
  if (!v.ok) return { ok:false, reason:v.reason };
  let finalName = v.name, n = 2;
  while ([...room.players.values()].some(p => p.name.toLowerCase() === finalName.toLowerCase())) {
    finalName = v.name.slice(0, 11) + ' ' + n++;
  }
  const inLobby = room.phase === 'lobby';
  const player = {
    pid: id(), token: id(), name: finalName, score: 0,
    spectator: !inLobby, kicked: false, connected: true,
  };
  room.players.set(player.pid, player);
  evaluateAutoStart(io, room);
  broadcast(io, room);
  return { ok:true, player };
}

function playerAction(io, room, player, action, data){
  room.lastActive = Date.now();
  const r = room.round;
  if (player.kicked) return { ok:false, reason:'Kamu dikeluarkan dari room.' };

  /* prototipe: pemain boleh mulai game sendiri dari lobby */
  if (action === 'start'){
    if (room.phase !== 'lobby') return { ok:false, reason:'Game sudah berjalan.' };
    if (player.spectator) return { ok:false, reason:'Kamu penonton ronde ini.' };
    if (room.autoStartTimer) return { ok:false, reason:'Hitungan mundur sudah berjalan — siap-siap!' };
    if (lobbyPlayerCount(room) < 3) return { ok:false, reason:'Butuh minimal 3 pemain online.' };
    maybeStartCountdown(io, room, true);
    return { ok:true };
  }

  if (action === 'prompt'){
    if (room.phase !== 'prompting') return { ok:false, reason:'Bukan fase menulis prompt.' };
    const v = moderation.validatePrompt(data.prompt);
    if (!v.ok) return v;
    let s = r.submissions.get(player.pid);
    if (s && s.lockedAt) return { ok:false, reason:'Prompt sudah dikunci.' };
    if (s && s.regenUsed) return { ok:false, reason:'Prompt sudah final setelah generate ulang.' };
    if (!s) s = { prompt:'', regenUsed:false, previewFile:null, lockedAt:null, imageStatus:null, imageFile:null, speedBonus:0 };
    s.prompt = String(data.prompt).trim().slice(0, 400);
    r.submissions.set(player.pid, s);
    broadcast(io, room);
    return { ok:true };
  }

  if (action === 'lock'){
    if (room.phase !== 'prompting') return { ok:false, reason:'Bukan fase menulis prompt.' };
    const s = r.submissions.get(player.pid);
    if (!s || !s.prompt) return { ok:false, reason:'Kirim prompt dulu sebelum dikunci.' };
    if (s.lockedAt) return { ok:false, reason:'Sudah dikunci.' };
    s.lockedAt = Date.now();
    /* bonus kecepatan: 3 pengunci pertama */
    const lockedCount = [...r.submissions.values()].filter(x => x.lockedAt && x.speedBonus).length;
    if (lockedCount < 3) s.speedBonus = 1;
    broadcast(io, room);
    return { ok:true };
  }

  if (action === 'regen'){
    if (room.phase !== 'prompting') return { ok:false, reason:'Bukan fase menulis prompt.' };
    if (!room.settings.allowRegen) return { ok:false, reason:'Generate ulang dimatikan host.' };
    const s = r.submissions.get(player.pid);
    if (!s || !s.prompt) return { ok:false, reason:'Kirim prompt dulu.' };
    if (s.lockedAt) return { ok:false, reason:'Prompt sudah dikunci.' };
    if (s.regenUsed) return { ok:false, reason:'Kesempatan generate ulang sudah dipakai.' };
    s.regenUsed = true; /* prompt final sejak regen */
    broadcast(io, room);
    /* generate pratinjau sekarang (mock instan; provider nyata pun manis) */
    imageProvider.generate({
      prompt: s.prompt, brief: briefById(room, room.round.briefId), category: room.round.category,
      roomId: room.code, playerId: player.pid, roundIndex: room.roundIndex, regenUsed: true,
    }, room.imagesDir).then(res => {
      if (room.closed) return;
      if (res.ok){ s.imageStatus = 'ok'; s.imageFile = res.file; s.previewFile = res.file; }
      else { s.imageStatus = null; }
      broadcast(io, room);
    });
    return { ok:true };
  }

  if (action === 'rate'){
    if (room.phase !== 'voting') return { ok:false, reason:'Bukan fase penilaian.' };
    if (player.spectator) return { ok:false, reason:'Penonton belum bisa menilai ronde ini.' };
    const score = Number(data.score);
    if (!Number.isInteger(score) || score < 1 || score > 10) return { ok:false, reason:'Nilai harus angka 1 sampai 10.' };
    /* hanya poster yang sedang tampil yang dinilai */
    const idx = r.galleryCursor;
    const posterPid = r.galleryOrder[idx];
    if (posterPid == null) return { ok:false, reason:'Tidak ada poster yang dinilai.' };
    if (posterPid === player.pid) return { ok:false, reason:'Ini poster milikmu — otomatis dilewati.' };
    if (data.letter && letterOf(room, posterPid) !== String(data.letter).toUpperCase())
      return { ok:false, reason:'Poster sudah berganti — nilai yang baru ya.' };
    let m = r.ratings.get(posterPid);
    if (!m){ m = new Map(); r.ratings.set(posterPid, m); }
    m.set(player.pid, score); /* boleh diganti sampai poster berganti */
    /* semua penilai sudah menilai → lanjut lebih cepat */
    if (allRated(room, posterPid)){ advanceRating(io, room); }
    else { broadcast(io, room); }
    return { ok:true };
  }

  return { ok:false, reason:'Aksi tidak dikenal.' };
}

/* ---------------- Snapshot state ---------------- */
function publicState(room){
  const brief = room.round ? briefById(room, room.round.briefId) : null;
  const cat = brief ? CATEGORIES[brief.category] : null;
  const r = room.round;

  const gallery = r ? r.galleryOrder.map((pid, i) => {
    const s = r.submissions.get(pid);
    return {
      letter: String.fromCharCode(65 + i),
      pid,
      file: s && s.imageStatus === 'ok' ? s.imageFile : null,
      status: s ? s.imageStatus : 'skip',
      isJury: room.juryPick === pid,
    };
  }) : [];

  const reveal = [];
  if (r && r.revealItems){
    r.revealItems.forEach((item, i) => {
      if (i <= r.revealCursor){
        const p = room.players.get(item.pid);
        reveal.push({
          ...item,
          name: p ? p.name : '?',
          prompt: (r.submissions.get(item.pid) || {}).prompt || '',
          file: (r.submissions.get(item.pid) || {}).imageFile || null,
        });
      }
    });
  }

  const players = room.activePlayers().map(p => {
    const s = r && r.submissions.get(p.pid);
    return {
      pid: p.pid, name: p.name, connected: p.connected, spectator: p.spectator,
      score: room.totals.get(p.pid) || 0,
      submitted: !!(s && s.prompt), locked: !!(s && s.lockedAt),
      voted: !!(r && room.phase === 'voting' && r.ratings.get(r.galleryOrder[r.galleryCursor])?.has(p.pid)),
    };
  });

  return {
    now: Date.now(),
    code: room.code,
    phase: room.phase,
    paused: room.paused,
    roundIndex: room.roundIndex,
    totalRounds: room.settings.rounds,
    settings: room.settings,
    brief: brief ? {
      ...brief,
      image: '/img/product/' + brief.id,
      emoji: products.emojiFor(brief),
      categoryName: cat ? cat.name : '',
      categoryEmoji: cat ? cat.emoji : '',
    } : null,
    categoryTips: cat && room.settings.showTips ? cat.tips : null,
    categoryChips: cat ? cat.chips : [],
    promptGroups: cat ? promptGroups(brief.category) : [],
    players,
    counts: {
      total: players.filter(p => !p.spectator).length,
      online: players.filter(p => !p.spectator && p.connected).length,
      submitted: players.filter(p => p.submitted).length,
      locked: players.filter(p => p.locked).length,
      ratedCurrent: r && room.phase === 'voting' ? (() => { const cur = r.galleryOrder[r.galleryCursor]; return cur != null ? (r.ratings.get(cur) || new Map()).size : 0; })() : 0,
      ratersNeeded: r && room.phase === 'voting' ? eligibleRaters(room, r.galleryOrder[r.galleryCursor]).length : 0,
      imagesOk: r ? [...r.submissions.values()].filter(s => s.imageStatus === 'ok').length : 0,
      imagesTotal: r ? [...r.submissions.values()].filter(s => s.imageStatus && s.imageStatus !== 'skip').length : 0,
    },
    gallery,
    galleryCursor: r ? r.galleryCursor : -1,
    galleryTotal: r ? r.galleryOrder.length : 0,
    reveal,
    revealCursor: r ? r.revealCursor : -1,
    revealTotal: r && r.revealItems ? r.revealItems.length : 0,
    revealChampion: r && r.revealItems && r.revealCursor === r.revealItems.length - 1
      ? r.revealItems.length : null,
    juryEnabled: room.settings.juryEnabled,
    juryLetter: room.juryPick ? letterOf(room, room.juryPick) : null,
    leaderboard: room.lastLeaderboard,
    finalRanking: room.finalRanking,
    endsAt: room.paused ? null : room.endsAt,
    pausedRemaining: room.paused ? room.remainingMs : null,
    autoStartEndsAt: room.phase === 'lobby' ? (room.autoStartEndsAt || null) : null,
    joinUrl: room.joinUrl,
    /* data host-saja */
    __host: {
      qr: room.qr,
      briefs: room.phase === 'lobby' ? room.briefs : undefined,
      briefOrder: room.phase === 'lobby' ? room.briefOrder : undefined,
      revealAll: r && r.revealItems ? r.revealItems.map(item => ({
        ...item,
        name: room.players.get(item.pid)?.name || '?',
      })) : undefined,
    },
  };
}

function playerState(room, player){
  const st = publicState(room);
  delete st.__host;
  const r = room.round;
  const s = r ? r.submissions.get(player.pid) : null;
  st.me = {
    pid: player.pid,
    name: player.name,
    spectator: player.spectator,
    submission: s ? {
      prompt: s.prompt, locked: !!s.lockedAt, regenUsed: !!s.regenUsed,
      preview: s.previewFile || null, status: s.imageStatus,
    } : null,
    rating: (() => {
      if (!r || room.phase !== 'voting') return null;
      const cur = r.galleryOrder[r.galleryCursor];
      if (cur == null) return null;
      const m = r.ratings.get(cur);
      return {
        letter: letterOf(room, cur),
        isMine: cur === player.pid,
        myScore: m ? (m.get(player.pid) || null) : null,
        ratedCount: m ? m.size : 0,
      };
    })(),
    canRegen: room.settings.allowRegen && s && !s.regenUsed && !s.lockedAt,
  };
  /* privasi: pemain tidak melihat pid pemain lain & suara mentah */
  st.gallery = st.gallery.map(g => ({ letter:g.letter, file:g.file, status:g.status, isJury:g.isJury }));
  st.players = st.players.map(p => ({ ...p, pid: p.pid === player.pid ? p.pid : undefined }));
  return st;
}

/* ---------------- Broadcast ---------------- */
function broadcast(io, room){
  if (!io || room.closed) return;
  const hostState = publicState(room);
  if (room.hostSocket) room.hostSocket.emit('state', hostState);
  for (const [pid, sock] of room.playerSockets){
    const p = room.players.get(pid);
    if (!p) continue;
    sock.emit('state', playerState(room, p));
  }
}

module.exports = {
  rooms, createRoom, getRoom, closeRoom, joinPlayer, playerAction,
  hostActions, broadcast, publicState, playerState, pickBriefOrder,
  evaluateAutoStart,
};
