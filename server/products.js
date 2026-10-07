'use strict';
/* ============================================================
   FOTO PRODUK — sumber gambar untuk brief & komposit poster.
   1. Jika host mengunggah foto asli (data/products/<id>.png/jpg)
      → foto itulah yang dipakai.
   2. Jika belum → ilustrasi SVG digenerate otomatis per produk
      (emoji produk + nama, warna sesuai kategori).
   ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BRIEFS, CATEGORIES } = require('./briefs');

const DIR = path.join(__dirname, '..', 'data', 'products');
const BUILTIN_DIR = path.join(__dirname, '..', 'public', 'assets', 'products'); /* foto asli bawaan */
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

function esc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function wrap(text, max){
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words){
    if ((cur + ' ' + w).trim().length > max){ if (cur) lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 3);
}

/** emoji khas produk (fallback: emoji kategori) */
function emojiFor(brief){
  if (brief && brief.emoji) return brief.emoji;
  const def = BRIEFS.find(b => b.id === brief.id);
  if (def && def.emoji) return def.emoji;
  return (CATEGORIES[brief.category] || {}).emoji || '🛍️';
}

function findUpload(id){
  if (!/^[A-Za-z0-9_-]+$/.test(String(id || ''))) return null;
  for (const ext of Object.values(MIME_EXT)){
    const p = path.join(DIR, id + ext);
    if (fs.existsSync(p)) return p;
  }
  /* foto asli bawaan (aset produk UMKM) — dipakai jika host belum upload */
  for (const ext of Object.values(MIME_EXT)){
    const p = path.join(BUILTIN_DIR, id + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** ilustrasi produk default (SVG 600×750, potret) */
function illustrationSVG(brief){
  const cat = CATEGORIES[brief.category] || CATEGORIES.beverages;
  const hueA = { beverages: 200, food: 25, fashion: 275 }[brief.category] || 200;
  const hueB = { beverages: 40, food: 350, fashion: 15 }[brief.category] || 40;
  const nameLines = wrap(brief.product || 'Produk', 18);
  const nameSpans = nameLines
    .map((l, i) => `<tspan x="300" dy="${i === 0 ? 0 : 52}">${esc(l)}</tspan>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750" font-family="Arial, Helvetica, sans-serif">
  <defs>
    <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hueA} 45% 20%)"/>
      <stop offset="1" stop-color="hsl(${hueB} 55% 38%)"/>
    </linearGradient>
  </defs>
  <rect width="600" height="750" fill="url(#pg)"/>
  <rect x="18" y="18" width="564" height="714" rx="20" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="3"/>
  <text x="300" y="110" text-anchor="middle" font-size="26" letter-spacing="9" fill="rgba(255,255,255,.85)" font-weight="bold">${esc(String(brief.brand || 'UMKM').toUpperCase())}</text>
  <text x="300" y="400" text-anchor="middle" font-size="190">${emojiFor(brief)}</text>
  <text x="300" y="555" text-anchor="middle" font-size="44" font-weight="900" fill="#fff">${nameSpans}</text>
  <text x="300" y="660" text-anchor="middle" font-size="26" fill="#ffe08a" font-weight="bold">${esc(brief.price || '')}</text>
  <text x="300" y="708" text-anchor="middle" font-size="13" letter-spacing="5" fill="rgba(255,255,255,.5)">FOTO PRODUK · ${esc(cat.name.toUpperCase())}</text>
</svg>`;
}

/**
 * Data-URI foto produk untuk ditanam di poster.
 * @param {object} brief  brief lengkap (punya id, category, product, brand, price)
 * @returns {{uri:string, uploaded:boolean}}
 */
function productDataURI(brief){
  const f = findUpload(brief.id);
  if (f){
    const ext = path.extname(f);
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'image/webp';
    return { uri: 'data:' + mime + ';base64,' + fs.readFileSync(f).toString('base64'), uploaded: true };
  }
  const svg = illustrationSVG(brief);
  return { uri: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), uploaded: false };
}

/** Simpan foto upload host (body: {id, mime, data(base64)}) */
function saveUpload(id, mime, dataB64){
  if (!/^[A-Za-z0-9_-]+$/.test(String(id || ''))) return { ok: false, reason: 'ID produk tidak valid.' };
  const ext = MIME_EXT[mime];
  if (!ext) return { ok: false, reason: 'Format harus PNG, JPG, atau WebP.' };
  const buf = Buffer.from(String(dataB64 || ''), 'base64');
  if (!buf || buf.length < 100) return { ok: false, reason: 'File kosong atau rusak.' };
  if (buf.length > 4 * 1024 * 1024) return { ok: false, reason: 'Foto maksimal 4 MB.' };
  fs.mkdirSync(DIR, { recursive: true });
  /* hapus file lama dengan ekstensi beda, lalu tulis yang baru */
  for (const e of Object.values(MIME_EXT)){
    const p = path.join(DIR, id + e);
    if (fs.existsSync(p) && e !== ext) fs.unlinkSync(p);
  }
  fs.writeFileSync(path.join(DIR, id + ext), buf);
  return { ok: true };
}

/** Sajikan foto produk via HTTP: file upload jika ada, else SVG generatif */
function serveProduct(req, res){
  const id = path.basename(req.params.id || '');
  const f = findUpload(id);
  if (f){
    const ext = path.extname(f);
    res.setHeader('Content-Type', ext === '.png' ? 'image/png' : ext === '.jpg' ? 'image/jpeg' : 'image/webp');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(f).pipe(res);
    return;
  }
  const def = BRIEFS.find(b => b.id === id);
  const brief = def || {
    id, category: CATEGORIES[req.query.cat] ? req.query.cat : 'beverages',
    product: String(req.query.name || 'Produk').slice(0, 60),
    brand: String(req.query.brand || 'UMKM').slice(0, 30),
    price: String(req.query.price || '').slice(0, 30),
  };
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(illustrationSVG(brief));
}

module.exports = { productDataURI, saveUpload, serveProduct, emojiFor, illustrationSVG };
