'use strict';
/* ============================================================
   MODERASI SEDERHANA — filter kata kasar/tidak pantas sebelum
   prompt/nama dikirim ke provider gambar atau ditampilkan.
   Daftar kata bisa ditambah host non-teknis lewat file ini.
   ============================================================ */

const BAD_WORDS = [
  'anjing','anjg','bangsat','bgst','babi','bajingan','kontol','kntl','memek','mmk',
  'ngentot','ngntot','entot','jembut','jmbt','pantat','pntk','penis','vagina',
  'titit','tete','toket','tki','bokep','bkp','porn','porno','fuck','fck','shit',
  'bitch','slut','whore','dick','cock','pussy','asshole','nigg','bugil','telanjang',
  'sex','seks','ngewe','ewe','gila babi','keparat','tai','taek','tahi','setan',
];

const REPLACE_CHAR = '*';

function normalize(s){
  return String(s || '')
    .toLowerCase()
    .replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e')
    .replace(/4/g,'a').replace(/5/g,'s').replace(/7/g,'t')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g,' ')
    .trim();
}

/** true jika teks mengandung kata terlarang */
function containsBadWord(text){
  const n = ' ' + normalize(text) + ' ';
  return BAD_WORDS.some(w => n.includes(' ' + w + ' ') || n.includes(' ' + w + ','));
}

/** mask kata kasar menjadi **** untuk tampilan ramah */
function maskBadWords(text){
  let out = String(text || '');
  for (const w of BAD_WORDS){
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
    out = out.replace(re, w[0] + REPLACE_CHAR.repeat(Math.max(1, w.length - 1)));
  }
  return out;
}

/** validasi prompt pemain: return {ok, reason} */
function validatePrompt(text){
  const t = String(text || '').trim();
  if (!t) return { ok:false, reason:'Prompt masih kosong — tulis dulu ya.' };
  if (t.length < 10) return { ok:false, reason:'Prompt terlalu pendek (minimal 10 karakter).' };
  if (t.length > 400) return { ok:false, reason:'Prompt maksimal 400 karakter.' };
  if (containsBadWord(t)) return { ok:false, reason:'Prompt mengandung kata yang tidak pantas. Tolong ubah ya.' };
  return { ok:true };
}

/** validasi nama pemain: return {ok, reason, name} */
function validateName(name){
  let n = String(name || '').trim().slice(0, 14);
  if (!n) return { ok:false, reason:'Nama tidak boleh kosong.' };
  if (containsBadWord(n)) return { ok:false, reason:'Nama mengandung kata yang tidak pantas.' };
  return { ok:true, name:n };
}

module.exports = { containsBadWord, maskBadWords, validatePrompt, validateName };
