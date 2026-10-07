'use strict';
/* ============================================================
   CONTOH PROVIDER SUNGUHAN — OpenAI gpt-image-1 (EDIT dengan foto produk)
   ------------------------------------------------------------
   Poster dibuat lewat endpoint /v1/images/edits: foto produk dari
   brief dilampirkan sebagai gambar dasar, jadi produk ASLI tampil
   di dalam poster (bukan hasil khayalan model).

   Cara mengaktifkan:
   1. Rename file ini menjadi:  openai.js
   2. Isi .env:  IMAGE_PROVIDER=openai  dan  OPENAI_API_KEY=sk-...
   3. Restart server (npm start)

   Catatan: /v1/images/edits menerima PNG/JPG/WebP. Jika host belum
   mengunggah foto produk, provider otomatis fallback ke endpoint
   /v1/images/generations (tanpa foto).

   Perkiraan biaya (per gambar, cek harga terkini):
   - gpt-image-1 low  1024x1536 : ~USD 0.02–0.04
   - gpt-image-1 high 1024x1536 : ~USD 0.08–0.13
   Game 10 pemain × 3 ronde ≈ 30 gambar ≈ USD 0.6–4.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

async function generate(ctx, outDir){
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY belum diisi di .env' };

  const prompt = [
    'Buat poster iklan produk rasio potret 4:5 untuk media sosial UMKM Indonesia.',
    ctx.brief.mandatory ? `Wajib menuliskan teks "${ctx.brief.mandatory}" secara jelas tanpa typo.` : '',
    `Brand: ${ctx.brief.brand}. Produk: ${ctx.brief.product}. Harga: ${ctx.brief.price}.`,
    'Gunakan foto produk terlampir sebagai subjek utama; jangan ubah bentuk produk.',
    `Arahan visual pemain: ${ctx.prompt}`,
  ].filter(Boolean).join('\n');

  try {
    let res;
    const photoFile = findProductPhoto(ctx.brief);

    if (photoFile){
      /* --- EDIT: foto produk asli dilampirkan --- */
      const fd = new FormData();
      fd.append('model', MODEL);
      fd.append('prompt', prompt);
      fd.append('image', new Blob([fs.readFileSync(photoFile)]), 'produk' + path.extname(photoFile));
      fd.append('size', '1024x1536');
      fd.append('quality', 'low');
      res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: fd,
        signal: AbortSignal.timeout(Number(process.env.IMAGE_TIMEOUT_MS) || 60000),
      });
    } else {
      /* --- GENERATIONS: belum ada foto produk --- */
      res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, prompt, size: '1024x1536', quality: 'low', n: 1 }),
        signal: AbortSignal.timeout(Number(process.env.IMAGE_TIMEOUT_MS) || 60000),
      });
    }

    if (!res.ok){
      const err = await res.text().catch(() => '');
      if (/content_policy|safety/i.test(err)) return { ok: false, error: 'Prompt ditolak sistem keamanan provider. Coba ubah kalimatnya.' };
      return { ok: false, error: `HTTP ${res.status}: ${err.slice(0, 180)}` };
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return { ok: false, error: 'Respon provider tidak berisi gambar.' };

    const fname = `r${ctx.roundIndex + 1}_${ctx.playerId}${ctx.regenUsed ? 'b' : ''}.png`;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, fname), Buffer.from(b64, 'base64'));
    return { ok: true, file: fname };
  } catch (e){
    return { ok: false, error: e.name === 'TimeoutError' ? 'Timeout membuat gambar' : e.message };
  }
}

/* cari foto upload host (PNG/JPG/WebP) untuk brief ini */
function findProductPhoto(brief){
  const dir = path.join(__dirname, '..', '..', 'data', 'products');
  for (const ext of ['.png', '.jpg', '.webp']){
    const p = path.join(dir, brief.id + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { generate };
