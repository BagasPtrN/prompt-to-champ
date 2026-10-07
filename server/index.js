'use strict';
/* ============================================================
   JADIPROMPTER — server entry point
   Express + Socket.IO. Jalankan: npm start  (default :3000)
   ============================================================ */

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { Server } = require('socket.io');

const rooms = require('./rooms');
const products = require('./products');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '1mb' }));
/* no-cache = browser selalu cek ulang ke server (etag) supaya update kode langsung terlihat */
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache'),
}));

/* ---------------- Halaman ---------------- */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/h/:code', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'host.html')));
app.get('/p/:code', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'player.html')));

/* ---------------- API ---------------- */
app.post('/api/create', async (req, res) => {
  const room = await rooms.createRoom(io);
  res.json({ ok: true, code: room.code, hostToken: room.hostToken, joinUrl: room.joinUrl });
});

app.get('/api/room/:code/exists', (req, res) => {
  const room = rooms.getRoom(req.params.code);
  res.json({ ok: !!room && !room.closed });
});

/* foto produk brief (upload host atau ilustrasi otomatis) — HARUS sebelum route /img/:code/:file */
app.get('/img/product/:id', products.serveProduct);

/* upload foto produk dari editor host (base64 via JSON, tanpa dependensi multipart) */
app.post('/api/product-image', (req, res) => {
  const { id, mime, data } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, reason: 'ID produk wajib.' });
  const r = products.saveUpload(id, mime, data);
  res.json(r);
});

/* file gambar per room */
app.get('/img/:code/:file', (req, res) => {
  const room = rooms.getRoom(req.params.code);
  if (!room) return res.status(404).end();
  const file = path.basename(req.params.file); /* cegah path traversal */
  const full = path.join(room.imagesDir, file);
  if (!fs.existsSync(full)) return res.status(404).end();
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'application/octet-stream';
  res.setHeader('Content-Type', type);
  /* nama file poster unik & tidak berubah — aman di-cache browser (mencegah kedip) */
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(full).pipe(res);
});

/* ZIP semua poster + rekap prompt */
app.get('/api/room/:code/zip', (req, res) => {
  const room = rooms.getRoom(req.params.code);
  if (!room) return res.status(404).json({ ok: false, reason: 'Room tidak ditemukan' });
  const zipName = `jadiprompter-${room.code}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', () => res.end());
  archive.pipe(res);

  /* folder poster + rekap prompt */
  const recap = buildRecapData(room);
  if (fs.existsSync(room.imagesDir)){
    const files = fs.readdirSync(room.imagesDir).filter(f => /\.(svg|png)$/i.test(f)).sort();
    for (const f of files) archive.file(path.join(room.imagesDir, f), { name: `posters/${f}` });
  }
  archive.append(recap.text, { name: 'rekap-prompt.txt' });
  archive.append(recap.html, { name: 'rekap-prompt.html' });
  archive.finalize();
});

/* rekap HTML siap cetak */
app.get('/api/room/:code/rekap', (req, res) => {
  const room = rooms.getRoom(req.params.code);
  if (!room) return res.status(404).send('Room tidak ditemukan');
  const recap = buildRecapData(room);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(recap.html);
});

function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildRecapData(room){
  /* sumber utama: history per ronde yang dicatat server */
  const rounds = (room.history || []).slice().sort((a, b) => a.roundIndex - b.roundIndex);
  const ranking = room.finalRanking || rooms.publicState(room).leaderboard || [];

  const text = [
    `JADIPROMPTER — REKAP ROOM ${room.code}`,
    `Diunduh: ${new Date().toLocaleString('id-ID')}`,
    '',
    'PAPAN SKOR AKHIR:',
    ...ranking.map(r => `${r.rank}. ${r.name} — ${r.score} poin`),
    '',
    'POSTER & PROMPT:',
    ...rounds.flatMap(rd => [
      `— Ronde ${rd.roundIndex + 1} (${rd.brief.brand} — ${rd.brief.product}) —`,
      ...rd.items.map(it => `  [${it.letter}] ${it.name} (${it.roundTotal} poin): ${it.prompt}`),
    ]),
  ].join('\n');

  const sections = rounds.map(rd => `
    <h2>Ronde ${rd.roundIndex + 1} — ${esc(rd.brief.brand)} · ${esc(rd.brief.product)}</h2>
    <div class="grid">
      ${rd.items.map(it => `
        <div class="card">
          ${it.file ? `<img src="/img/${room.code}/${esc(it.file)}" alt="Poster ${esc(it.name)}">` : '<div class="noimg">gagal dibuat</div>'}
          <div class="meta">[${it.letter}] <b>${esc(it.name)}</b> — ${it.roundTotal} poin${it.speed ? ' <span class="bonus">+1 kecepatan</span>' : ''}${it.jury ? ' <span class="bonus">★ juri</span>' : ''}</div>
          <div class="prompt">"${esc(it.prompt)}"</div>
        </div>`).join('')}
    </div>`).join('');

  const rows = ranking.map(r => `<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.score}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>Rekap ${room.code} — JadiPrompter</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#faf9f6;color:#17100f;margin:24px}
  h1{color:#e3000c;letter-spacing:-.02em} h2{margin-top:28px;border-bottom:3px solid #e3000c;padding-bottom:6px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
  .card{background:#fff;border:1px solid #ece8e2;border-radius:12px;overflow:hidden}
  .card img{width:100%;display:block;aspect-ratio:4/5;object-fit:cover}
  .noimg{aspect-ratio:4/5;display:flex;align-items:center;justify-content:center;background:#f3f0ea;color:#948b89}
  .meta{font-weight:bold;padding:8px 10px 2px;font-size:14px}.prompt{font-size:12px;color:#564a49;padding:0 10px 10px}
  .bonus{color:#e3000c;font-size:11px}
  table{border-collapse:collapse;margin-top:8px}td,th{border:1px solid #ece8e2;padding:6px 14px;text-align:left}
  th{background:#f3f0ea} .noprint{margin:12px 0}@media print{.noprint{display:none}}
</style></head><body>
<h1>✦ JadiPrompter — Rekap Room ${room.code}</h1>
<p>${new Date().toLocaleString('id-ID')} · ${room.activePlayers().length} pemain · ${rounds.length} ronde</p>
<div class="noprint"><button onclick="window.print()" style="padding:10px 18px;font-size:15px;background:#e3000c;color:#fff;border:none;border-radius:10px;cursor:pointer">Cetak / Simpan PDF</button></div>
<h2>Papan Skor</h2>
<table><tr><th>#</th><th>Nama</th><th>Poin</th></tr>${rows}</table>
${sections || '<p><i>Belum ada ronde selesai.</i></p>'}
</body></html>`;

  return { text, html };
}

/* ---------------- Socket.IO ---------------- */
io.on('connection', (socket) => {
  let bound = null; /* {type:'host'|'player', room, player?} */

  socket.on('host:auth', ({ code, hostToken } = {}) => {
    const room = rooms.getRoom(code);
    if (!room || room.hostToken !== hostToken){
      socket.emit('auth:failed', { reason: 'Token host tidak valid.' });
      return;
    }
    /* pindahkan host ke tab ini */
    if (room.hostSocket && room.hostSocket !== socket) room.hostSocket.emit('host:replaced');
    const firstConnect = !room.hostSocket;
    room.hostSocket = socket;
    bound = { type: 'host', room };
    socket.join(room.code);
    socket.emit('state', rooms.publicState(room));
    /* layar host baru terhubung — mungkin pemain sudah cukup untuk mulai otomatis */
    if (firstConnect && room.phase === 'lobby'){
      rooms.evaluateAutoStart(io, room);
      rooms.broadcast(io, room);
    }
  });

  socket.on('room:join', ({ code, name, token } = {}) => {
    const room = rooms.getRoom(code);
    if (!room || room.closed){ socket.emit('join:failed', { reason: 'Room tidak ditemukan atau sudah ditutup.' }); return; }
    const res = rooms.joinPlayer(io, room, { name, token });
    if (!res.ok){ socket.emit('join:failed', { reason: res.reason }); return; }
    const player = res.player;
    player.connected = true;
    room.playerSockets.set(player.pid, socket);
    bound = { type: 'player', room, player };
    socket.join(room.code);
    socket.emit('joined', { pid: player.pid, token: player.token, code: room.code });
    rooms.broadcast(io, room);
  });

  socket.on('host:action', ({ action, data } = {}) => {
    if (!bound || bound.type !== 'host' || !bound.room) return;
    const fn = rooms.hostActions[action];
    if (!fn) return;
    const res = fn(io, bound.room, data || {});
    socket.emit('action:result', { action, ...res });
  });

  socket.on('player:action', ({ action, data } = {}) => {
    if (!bound || bound.type !== 'player' || !bound.room || !bound.player) return;
    const res = rooms.playerAction(io, bound.room, bound.player, action, data || {});
    socket.emit('action:result', { action, ...res });
  });

  socket.on('disconnect', () => {
    if (!bound || !bound.room) return;
    if (bound.type === 'host'){
      if (bound.room.hostSocket === socket) bound.room.hostSocket = null;
    } else {
      const p = bound.player;
      p.connected = false;
      bound.room.playerSockets.delete(p.pid);
      rooms.broadcast(io, bound.room);
    }
  });
});

/* pengaman: error tak tertangani dicatat tapi server tetap hidup,
   supaya sesi pelatihan tidak mati mendadak di tengah jalan */
process.on('uncaughtException', (err) => {
  console.error('[server] UNCAUGHT:', err && err.stack || err);
});
process.on('unhandledRejection', (err) => {
  console.error('[server] UNHANDLED REJECTION:', err && err.stack || err);
});

server.listen(PORT, () => {
  console.log('==================================================');
  console.log('  ✦ JADIPROMPTER — server jalan');
  console.log(`  Lokal   : http://localhost:${PORT}`);
  console.log(`  Provider: ${require('./imageProviders').name}`);
  console.log('==================================================');
});
