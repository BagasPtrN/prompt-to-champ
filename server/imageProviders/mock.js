'use strict';
/* ============================================================
   PROVIDER MOCK — poster placeholder lokal berupa SVG.
   Poster MENEMPELKAN FOTO PRODUK dari brief (foto upload host
   atau ilustrasi otomatis) di tengah, dikelilingi elemen poster:
   brand, nama produk, harga, teks wajib, dan potongan prompt.
   Seed deterministik dari prompt → tiap poster terlihat beda.
   ============================================================ */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const products = require('../products');

function hashSeed(str){
  return parseInt(crypto.createHash('sha1').update(str).digest('hex').slice(0, 8), 16);
}
function rng(seed){
  let s = seed >>> 0;
  return function(){
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function esc(s){
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function wrap(text, max){
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words){
    if ((cur + ' ' + w).trim().length > max){ if (cur) lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 4);
}

const HUES = {
  beverages: [195, 40],
  food: [25, 350],
  fashion: [270, 15],
};

/**
 * Bangun SVG poster (720×900) dengan foto produk di tengah.
 */
function buildPosterSVG(ctx){
  const { prompt, seedExtra, brief, category, productURI } = ctx;
  const [hueA0, hueB0] = HUES[category] || HUES.beverages;
  const seed = hashSeed(prompt + '|' + (seedExtra || '') + '|' + brief.id);
  const r = rng(seed);
  const hueA = (hueA0 + Math.floor(r() * 60 - 30) + 360) % 360;
  const hueB = (hueB0 + Math.floor(r() * 60 - 30) + 360) % 360;
  const frameStyle = Math.floor(r() * 3); /* 0 polos, 1 strip, 2 titik */

  let deco = '';
  if (frameStyle === 1){
    for (let i = 0; i < 5; i++){
      const x = -80 + i * 200 + r() * 50;
      deco += `<rect x="${x.toFixed(0)}" y="-60" width="${(30 + r() * 40).toFixed(0)}" height="1040" fill="hsl(${(hueB + i * 20) % 360} 75% 60%)" opacity="0.18" transform="rotate(${(6 + r() * 8).toFixed(1)} 360 450)"/>`;
    }
  } else if (frameStyle === 2){
    for (let i = 0; i < 30; i++){
      deco += `<circle cx="${(r() * 720).toFixed(0)}" cy="${(r() * 900).toFixed(0)}" r="${(3 + r() * 7).toFixed(1)}" fill="hsl(${(hueB + i * 9) % 360} 85% 65%)" opacity="0.3"/>`;
    }
  }

  const brand = esc(String(brief.brand || 'UMKM').toUpperCase());
  const productLines = wrap(brief.product || 'Produk', 16);
  const productSpans = productLines
    .map((l, i) => `<tspan x="360" dy="${i === 0 ? 0 : 74}">${esc(l)}</tspan>`)
    .join('');
  const uspLines = wrap(brief.usp || '', 40);
  const uspSpans = uspLines
    .map((l, i) => `<tspan x="360" dy="${i === 0 ? 0 : 32}">${esc(l)}</tspan>`)
    .join('');
  const mandatory = (brief.mandatory || '').trim();
  const price = esc(brief.price || '');

  /* area foto produk: jendela besar di tengah (dipengaruhi prompt:
     pemain yang menyebut "close-up" mendapat jendela lebih besar) */
  const p = String(prompt || '').toLowerCase();
  const closeup = /(close[- ]?up|dekat|besar|detail)/.test(p);
  const phY = 210, phH = closeup ? 420 : 380;
  const nameY = phY + phH + 74;
  const uspY = nameY + (productLines.length - 1) * 74 + 48;
  const priceY = 848, mandY = price ? 884 : 852;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900" font-family="Arial, Helvetica, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hueA} 65% 17%)"/>
      <stop offset="1" stop-color="hsl(${hueB} 65% 36%)"/>
    </linearGradient>
    <clipPath id="phclip"><rect x="90" y="${phY}" width="540" height="${phH}" rx="24"/></clipPath>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(0,0,0,.35)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
  </defs>

  <rect width="720" height="900" fill="url(#bg)"/>
  ${deco}
  <rect x="24" y="24" width="672" height="852" rx="20" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="3"/>

  <text x="360" y="102" text-anchor="middle" font-size="30" letter-spacing="10" fill="rgba(255,255,255,.92)" font-weight="bold">${brand}</text>
  <line x1="250" y1="122" x2="470" y2="122" stroke="rgba(255,255,255,.55)" stroke-width="2"/>

  <!-- FOTO PRODUK -->
  <g>
    <rect x="84" y="${phY - 6}" width="552" height="${phH + 12}" rx="28" fill="rgba(0,0,0,.35)"/>
    <image href="${productURI}" x="90" y="${phY}" width="540" height="${phH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#phclip)"/>
    <rect x="90" y="${phY}" width="540" height="${phH}" rx="24" fill="url(#fade)" opacity=".45"/>
    <rect x="90" y="${phY}" width="540" height="${phH}" rx="24" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="3"/>
  </g>

  <text x="360" y="${nameY}" text-anchor="middle" font-size="64" font-weight="900" fill="#ffffff" letter-spacing="-1">${productSpans}</text>

  ${uspLines.length ? `<text x="360" y="${uspY}" text-anchor="middle" font-size="25" fill="rgba(255,255,255,.92)" font-style="italic">${uspSpans}</text>` : ''}

  ${price ? `<text x="360" y="${priceY}" text-anchor="middle" font-size="52" font-weight="900" fill="#fff" stroke="rgba(0,0,0,.3)" stroke-width="2" paint-order="stroke">${price}</text>` : ''}
  ${mandatory ? `<text x="360" y="${mandY}" text-anchor="middle" font-size="27" font-weight="bold" fill="#ffe08a">${esc(mandatory.toUpperCase())}</text>` : ''}
</svg>`;
}

/**
 * Contoh poster ASLI (aset bawaan) — jika ada untuk brief ini,
 * poster pemain = contoh poster itu dengan variasi zoom/crop/warna
 * deterministik per prompt, sehingga tiap pemain tampil beda.
 */
const POSTER_ASSET_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'posters');

function findPosterAsset(briefId){
  if (!/^[A-Za-z0-9_-]+$/.test(String(briefId || ''))) return null;
  for (const ext of ['.jpg', '.png', '.webp']){
    const p = path.join(POSTER_ASSET_DIR, briefId + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** ukuran gambar JPEG/PNG dari byte header (tanpa dependensi) */
function imageSize(buf, file){
  /* PNG: IHDR berisi width/height big-endian di offset 16 & 20 */
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50){
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  /* JPEG: scan marker sampai SOFn */
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8){
    let i = 2;
    while (i + 9 < buf.length){
      if (buf[i] !== 0xff){ i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc){
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

function buildAssetPosterSVG(ctx){
  const { prompt, seedExtra, brief, playerId } = ctx;
  /* playerId ikut seed → tiap pemain pasti dapat variasi beda walau prompt sama */
  const seed = hashSeed(playerId + '|' + prompt + '|' + (seedExtra || '') + '|' + brief.id + '|poster');
  const r = rng(seed);

  /* RASIO ASLI WAJIB UTUH: poster digambar "contain" (meet) di kanvas
     720×900 — tidak terpotong, tidak digepeng. Variasi antar pemain hanya
     lewat: ukuran fit (90–100%), tone warna, dan gaya latar blur. */
  const dim = ctx.posterDim || { w: 600, h: 900 };
  const fit = 0.9 + r() * 0.1;                    /* 0.90–1.00 dari fit penuh */
  const s = Math.min(720 / dim.w, 900 / dim.h) * fit;
  const w = dim.w * s, h = dim.h * s;
  const x = ((720 - w) / 2).toFixed(1), y = ((900 - h) / 2).toFixed(1);

  const hue = Math.round((r() * 2 - 1) * 14);     /* hue-rotate ±14° */
  const sat = (0.92 + r() * 0.16).toFixed(2);
  const bri = (0.95 + r() * 0.1).toFixed(2);
  const blur = (10 + r() * 14).toFixed(1);        /* blur latar 10–24px */
  const dark = (0.35 + r() * 0.25).toFixed(2);    /* gelap latar */

  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900">
  <defs>
    <filter id="bgb" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${blur}"/>
    </filter>
  </defs>

  <!-- latar: poster yang sama, cover penuh, blur + digelapkan -->
  <g filter="url(#bgb)">
    <image href="${ctx.posterURI}" x="0" y="0" width="720" height="900" preserveAspectRatio="xMidYMid slice"/>
  </g>
  <rect width="720" height="900" fill="rgba(12,9,9,${dark})"/>

  <!-- POSTER UTUH — rasio asli, tidak terpotong -->
  <image href="${ctx.posterURI}" x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"
         preserveAspectRatio="xMidYMid meet" style="filter:hue-rotate(${hue}deg) saturate(${sat}) brightness(${bri})"/>
  <rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none"
        stroke="rgba(255,255,255,.55)" stroke-width="3"/>
  <rect width="720" height="900" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="8"/>
</svg>`;
}

/**
 * Generate poster (antarmuka provider).
 */
async function generate(ctx, outDir){
  await new Promise(res => setTimeout(res, 400 + Math.random() * 900));
  try {
    const fname = `r${ctx.roundIndex + 1}_${ctx.playerId}${ctx.regenUsed ? 'b' : ''}.svg`;
    const posterAsset = findPosterAsset(ctx.brief.id);
    let svg;
    if (posterAsset){
      /* brief beraset: tampilkan contoh poster asli utuh (rasio asli
         dijaga, tidak terpotong) + variasi per pemain */
      const mime = path.extname(posterAsset) === '.png' ? 'image/png'
        : path.extname(posterAsset) === '.webp' ? 'image/webp' : 'image/jpeg';
      const buf = fs.readFileSync(posterAsset);
      const posterURI = 'data:' + mime + ';base64,' + buf.toString('base64');
      svg = buildAssetPosterSVG({ prompt: ctx.prompt, seedExtra: String(ctx.regenUsed), brief: ctx.brief, playerId: ctx.playerId, posterURI, posterDim: imageSize(buf, posterAsset) });
    } else {
      const { uri } = products.productDataURI(ctx.brief); /* foto produk (upload/illustrasi) */
      svg = buildPosterSVG({
        prompt: ctx.prompt, seedExtra: String(ctx.regenUsed), brief: ctx.brief,
        category: ctx.category, productURI: uri,
      });
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, fname), svg, 'utf8');
    return { ok: true, file: fname };
  } catch (e){
    return { ok: false, error: e.message };
  }
}

/** Bungkus prompt pemain dengan template sistem (untuk provider sungguhan). */
function buildPosterPrompt(playerPrompt, brief){
  return [
    'Buat poster iklan produk rasio potret 4:5, gaya menarik untuk media sosial UMKM Indonesia.',
    `Gunakan foto produk yang dilampirkan sebagai subjek utama poster (produk asli — jangan ubah bentuk produknya).`,
    `Brand: ${brief.brand}. Produk: ${brief.product}. Keunggulan: ${brief.usp}. Target: ${brief.target}. Harga: ${brief.price}.`,
    brief.mandatory ? `Wajib menuliskan teks "${brief.mandatory}" pada poster secara jelas dan benar.` : '',
    `Arahan visual dari pemain: ${playerPrompt}`,
    'Pastikan semua teks yang ditampilkan ditulis dengan benar tanpa typo.',
  ].filter(Boolean).join('\n');
}

module.exports = { generate, buildPosterPrompt };
