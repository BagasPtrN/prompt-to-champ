# ✦ Prompt to Champ

Game multiplayer real-time untuk pelatihan **AI untuk UMKM**: semua pemain mendapat brief produk yang sama, menulis **prompt**, AI membuat **poster** dari prompt itu, lalu semua saling voting. Yang diadu bukan kemampuan menggambar — tapi kemampuan **menulis prompt**. Juaranya digelari **Prompt Champ**.

Dibuat untuk sesi pelatihan: 3–30 pemain, 1 laptop fasilitator (proyektor), peserta main dari HP.

---

## 1. Install (Windows)

1. Install **Node.js LTS** (18 atau lebih baru) dari <https://nodejs.org> — cukup next-next-default.
2. Buka **Command Prompt / PowerShell** di folder game ini, lalu:

   ```bat
   npm install
   npm start
   ```

3. Server jalan di `http://localhost:3000`.

## 2. Cara main (alat)

1. Di **laptop fasilitator**: buka `http://localhost:3000` → **BUAT ROOM**. Layar host muncul dengan **kode room + QR code**.
2. **Peserta** (HP, Wi-Fi yang sama): scan QR, atau buka link yang tampil, isi nama → masuk.
3. Game bisa mulai dengan 3 cara: **otomatis** saat jumlah pemain mencapai target, **tombol MULAI SEKARANG di HP pemain** (prototipe — butuh ≥3 pemain online), atau tombol **MULAI GAME** di host.
4. Alur per ronde otomatis:

   | Fase | Durasi | Apa yang terjadi |
   |---|---|---|
   | BRIEF | 15 dtk | Brief produk + **foto produk** tampil di proyektor & HP |
   | PROMPTING | 90 dtk (aturable) | **Mode mudah**: pilih gaya/cahaya/kamera/latar/font/suasana — prompt tersusun otomatis (ada tombol mode tulis bebas). Boleh generate ulang 1× |
   | GENERATING | beberapa detik | Poster dibuat paralel; **foto produk ditempel di tengah poster** |
   | PENILAIAN | 12 dtk/poster (aturable) | Poster tampil **satu per satu**; semua pemain memberi **nilai 1–10** (posternya sendiri otomatis dilewati). Poster berpindah lebih cepat jika semua sudah menilai |
   | REVEAL | host klik | Poster dibuka dari nilai terendah ke juara — **pembuat + prompt lengkap + rata-rata nilai** tampil (momen belajar!) |
   | SKOR | host klik | Papan skor kumulatif |

5. Skor: **total nilai rating** dari pemain lain + **Pilihan Juri +5** (host, opsional) + **bonus cepat +1** (3 pengunci pertama). Seri ditentukan jumlah nilai-10 terbanyak.
6. Akhir game: **podium 3 besar**, rekap semua poster + prompt, unduh **ZIP** dan **rekap HTML** (bisa dicetak/di-save PDF dari browser).

Kontrol host di bilah atas layar host: **JEDA/LANJUT · +30 DETIK · LEWATI FASE**, kick pemain (lobby), tutup room (podium).

## 3. Menghubungkan HP peserta (Wi-Fi yang sama)

1. Laptop dan semua HP harus terhubung ke **Wi-Fi/hotspot yang sama**.
2. Cari alamat IP laptop — Command Prompt:

   ```bat
   ipconfig
   ```

   Cari bagian **Wireless LAN adapter Wi-Fi** → baris **IPv4 Address** (misal `192.168.1.7`).
3. Peserta membuka di HP: `http://192.168.1.7:3000` (contoh — sesuaikan IP-mu). Link & QR di layar host **sudah otomatis memakai IP ini**.
4. Kalau HP tidak bisa membuka:
   - Pastikan firewall Windows mengizinkan Node.js (muncul dialog saat pertama kali `npm start` — centang **Private networks**).
   - Beberapa Wi-Fi kampus/kantor punya *AP/client isolation* yang memblokir koneksi antar perangkat — gunakan hotspot HP atau router sendiri.
5. Saat paket data seluler HP aktif, beberapa HP memaksa laman lewat data — matikan sementara data seluler jika HP tidak bisa membuka alamat IP.

## 4. Ganti provider gambar

Default: **`mock`** — poster placeholder lokal (SVG bergaya poster sesuai kategori & prompt). Gratis, instan, cocok untuk latihan/testing tanpa API key.

Cara pakai provider sungguhan (contoh OpenAI `gpt-image-1`, paling baik merender teks nama brand/tagline di poster):

1. Buka folder `server/imageProviders/`, rename `openai.example.js` menjadi `openai.js`.
2. Salin `.env.example` menjadi `.env`, isi:

   ```env
   IMAGE_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   ```

3. Restart `npm start`. Selesai — semua pemain otomatis pakai provider baru.

Provider lain: duplikat `openai.example.js`, sesuaikan bagian `fetch`-nya, ekspor fungsi `generate(ctx, outDir)` yang mengembalikan `{ok, file}` atau `{ok:false, error}`. Prompt pemain sudah otomatis dibungkus template sistem (rasio poster + info brand) — saat reveal yang ditampilkan tetap **prompt asli pemain**.

**Perkiraan biaya per game (10 pemain × 3 ronde ≈ 30 gambar):**

| Provider | Kualitas | Perkiraan per game |
|---|---|---|
| mock | placeholder | **Rp 0** |
| OpenAI gpt-image-1 (low) | teks paling bagus | ± USD 0.6–1.5 (Rp 10–25 ribu) |
| OpenAI gpt-image-1 (high) | teks paling bagus | ± USD 2.5–4 (Rp 40–65 ribu) |
| Google Imagen / fal.ai | bagus, teks bervariasi | sekitar USD 1–2 |

API key **hanya di `.env` server** — tidak pernah dikirim ke browser peserta. Request dibatasi `MAX_PARALLEL` (default 6) dengan timeout per gambar + retry 1×.

## 5. Main sendiri / testing tanpa peserta sungguhan

### Cara mudah — tombol di layar host (tanpa terminal)

Di lobby host ada tombol **🤖 + TAMBAH BOT**. Klik sampai jumlah pemain
minimal 3 — hitung mundur mulai otomatis menyala dan game langsung jalan.
Bot adalah pemain AI sisi server: ikut menulis prompt, mengunci, dan menilai
poster 1–10 seperti pemain sungguhan. Tombol **− BOT** menghapus bot terakhir
(hanya bisa di lobby). Maksimal 12 bot per room.

> Praktis untuk latihan sendiri, cek alur pelatihan, atau mengisi kursi kosong
> saat peserta kurang di day pelatihan.

### Cara lama — bot dari terminal

Server harus jalan (`npm start`), lalu di terminal kedua:

```bat
node test\bots.js
node test\bots.js KODE 15
```

- Tanpa argumen: bot membuat room sendiri (room & host bot otomatis), 10 bot main sampai podium, skor akhir dicetak.
- Dengan kode room: bot join ke room yang kamu buka (host tetap kamu).

## 6. Catatan teknis & keputusan desain

- **Stack**: Node.js + Express + Socket.IO, frontend HTML/CSS/JS murni tanpa build step. State room di memori server; **server sumber kebenaran fase & timer** (klien hanya menampilkan + hitung mundur lokal).
- **Gaya visual** konsisten dengan game pelatihan lainnya (`game/duel-prompt/`) dan kuis JadiHebat: stage gelap, aksen merah `#e3000c`, tile tombol 3D, label mono uppercase, aksen serif italic, grid+glow panggung.
- **Reconnect**: token pemain disimpan di `localStorage` HP. Layar terkunci / tertutup → buka lagi → otomatis masuk ronde berjalan dengan skor utuh.
- **Join di tengah ronde** → jadi penonton sampai ronde berikutnya.
- **Moderasi**: filter kata kasar Indonesia/Inggris pada nama & prompt sebelum diproses; penolakan dari provider ditangani dengan pesan ramah (poster "gagal dibuat" tetap tampil tapi tidak bisa dipilih voting).
- **Generate ulang 1×**: prompt dikunci ulang versi terakhir; di provider mock hasil regen langsung terlihat sebagai pratinjau di HP.
- **Gambar** disimpan di `data/rooms/<KODE>/` dan **otomatis dihapus saat room ditutup**. Tombol tutup room ada di layar podium.
- Keputusan kecil: rekap akhir berupa **HTML siap cetak** (tombol cetak → simpan sebagai PDF) dan **ZIP** berisi semua poster + `rekap-prompt.txt`; default 3 ronde (bisa 1–10); kategori acak per ronde.
- Uji beban yang sudah dilakukan: 10 bot + host bot menuntaskan 3 ronde penuh via provider mock.

## 7. Struktur folder

```
prompt-to-champ/
├─ server/
│  ├─ index.js            # Express + Socket.IO + route QR/ZIP/rekap
│  ├─ rooms.js            # state room, mesin fase, timer, skor
│  ├─ briefs.js           # 3 kategori × 5 brief UMKM bawaan + tips/chips
│  ├─ moderation.js       # filter kata tidak pantas
│  └─ imageProviders/     # adapter gambar (mock, openai.example)
├─ public/                # frontend tanpa build step
│  ├─ index.html          # landing: buat room / join
│  ├─ host.html + js      # layar fasilitator (proyektor)
│  ├─ player.html + js    # layar pemain (HP)
│  ├─ css/style.css       # design system JadiHebat
│  └─ js/common.js        # suara, util, jam server
├─ test/bots.js           # bot pengujian
├─ .env.example
└─ package.json           # npm install && npm start
```
