'use strict';
/* SFX + util bersama — JadiPrompter */

/* ---------- util ---------- */
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtCountdown(ms){
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? (m + ':' + String(s % 60).padStart(2, '0')) : String(s);
}
function toast(msg, isErr){
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

/* ---------- suara (WebAudio, tanpa aset) ---------- */
const SFX = (() => {
  let ctx = null;
  let muted = localStorage.getItem('ptc_mute') === '1';
  function ac(){
    if (!ctx){ try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} }
    return ctx;
  }
  function tone(f, dur, delay, type, vol){
    if (muted) return; const c = ac(); if (!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + (dur || 0.12) + 0.05);
  }
  return {
    click(){ tone(540,.08,0,'triangle',.1); },
    send(){ tone(500,.1,0); tone(740,.14,.09); },
    tick(){ tone(1050,.05,0,'square',.05); },
    reveal(){ tone(392,.12,0,'triangle',.14); tone(523,.14,.1,'triangle',.14); tone(659,.22,.2,'triangle',.14); },
    champion(){ [523,659,784,1047,1319].forEach((f,i)=>tone(f,.18,i*.11,'triangle',.15)); },
    fanfare(){ [392,523,659,784,659,784,1047].forEach((f,i)=>tone(f,.2,i*.13,'sawtooth',.08)); },
    get muted(){ return muted; },
    toggle(){ muted = !muted; localStorage.setItem('ptc_mute', muted ? '1' : '0'); return muted; },
    warm(){ ac(); },
  };
})();

/* tombol mute seragam: <button class="ghostbtn" data-mute>🔊 SUARA</button> */
function initMuteButtons(){
  const paint = () => document.querySelectorAll('[data-mute]').forEach(b => {
    b.textContent = SFX.muted ? '🔇 SUARA' : '🔊 SUARA';
  });
  document.querySelectorAll('[data-mute]').forEach(b => b.addEventListener('click', () => {
    SFX.toggle(); paint(); if (!SFX.muted) SFX.click();
  }));
  paint();
}

/* ---------- jam server ---------- */
const Clock = {
  offset: 0,
  sync(serverNow){ this.offset = serverNow - Date.now(); },
  remaining(endsAt){ return endsAt ? (endsAt - (Date.now() + this.offset)) : null; },
};

/* detak timer global: callback dipanggil tiap 250ms */
function runTicker(cb){
  let lastSec = null;
  setInterval(() => {
    const info = cb();
    if (!info) return;
    const sec = Math.ceil(info.ms / 1000);
    if (info.ms > 0 && sec <= 5 && sec !== lastSec){ lastSec = sec; SFX.tick(); }
    if (sec > 5) lastSec = null;
  }, 250);
}
