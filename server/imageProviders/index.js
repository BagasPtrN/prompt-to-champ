'use strict';
/* ============================================================
   FACTORY PROVIDER GAMBAR — dipilih lewat .env IMAGE_PROVIDER.
   mock  : placeholder SVG lokal (default, gratis)
   lainnya: file <nama>.js di folder ini (lihat openai.example.js)
   ============================================================ */

const providerName = (process.env.IMAGE_PROVIDER || 'mock').toLowerCase();
let provider;
try {
  provider = require('./' + providerName + '.js');
} catch (e){
  console.error(`[imageProviders] Provider "${providerName}" tidak tersedia (${e.code || e.message}). jatuh ke "mock".`);
  provider = require('./mock.js');
}

const MAX_PARALLEL = Math.max(1, Number(process.env.MAX_PARALLEL) || 6);
const TIMEOUT_MS = Math.max(5000, Number(process.env.IMAGE_TIMEOUT_MS) || 60000);

/** generate dengan retry 1x + timeout */
async function generateSafe(ctx, outDir){
  for (let attempt = 0; attempt < 2; attempt++){
    const result = await Promise.race([
      provider.generate(ctx, outDir),
      new Promise(res => setTimeout(() => res({ ok:false, error:'Timeout membuat gambar' }), TIMEOUT_MS)),
    ]);
    if (result && result.ok) return result;
    if (attempt === 1) return { ok:false, error:(result && result.error) || 'Gagal membuat gambar' };
  }
  return { ok:false, error:'Gagal membuat gambar' };
}

/** proses banyak tugas dengan batas paralel */
async function generateAll(tasks){
  /* tasks: [{ctx, outDir}] → hasil sejenis urutan sama */
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker(){
    while (cursor < tasks.length){
      const i = cursor++;
      results[i] = await generateSafe(tasks[i].ctx, tasks[i].outDir);
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, tasks.length) }, worker));
  return results;
}

module.exports = { generate: generateSafe, generateAll, name: providerName };
