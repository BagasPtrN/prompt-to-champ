'use strict';
/* ============================================================
   BRIEFS BAWAAN — 3 kategori × 5 brief produk UMKM Indonesia.
   Game bisa langsung dimainkan tanpa input host; host bebas
   mengubah / menambah / mengurangi lewat layar host (lobby).
   ============================================================ */

const CATEGORIES = {
  beverages: {
    id: 'beverages',
    name: 'Poster Minuman',
    emoji: '🥤',
    tips: [
      ['Subjek produk', 'Sebut minumannya jelas: gelas/plastik/kemasan, isi, warna minuman.'],
      ['Komposisi & kamera', 'Close-up 45° atau eye-level; minuman mengisi ±60% gambar.'],
      ['Detail khas minuman', 'Embun di gelas, percikan susu, es batu jernih, lapisan gula aren.'],
      ['Pencahayaan', 'Terang dan segar — cahaya alami lembut atau golden hour.'],
      ['Latar', 'Meja kayu kafe, latar marble, atau daun segar yang relevan.'],
      ['Warna & mood', 'Segar, bersih, bikin haus. Sebut 1–2 warna dominan.'],
      ['Teks poster', 'Nama brand di atas, tagline/promo di bawah — tulis persis teksnya.'],
    ],
    chips: ['embun di gelas', 'percikan susu', 'es batu jernih', 'close-up 45 derajat', 'cahaya alami lembut', 'latar meja kayu kafe', 'golden hour', 'flat design'],
  },
  food: {
    id: 'food',
    name: 'Poster Makanan',
    emoji: '🍽️',
    tips: [
      ['Subjek produk', 'Sebut makanannya jelas: bentuk, warna, tampilan saji.'],
      ['Komposisi & kamera', 'Close-up tekstur atau flat-lay dari atas; makanan dominan.'],
      ['Detail khas makanan', 'Uap panas tipis, topping jatuh, saus meleleh, kriuk terlihat.'],
      ['Pencahayaan', 'Hangat dan menggugah selera — sidelight lembut.'],
      ['Latar', 'Papan kayu, meja rumah makan, daun pisang, atau piring keramik.'],
      ['Warna & mood', 'Hangat, homey, bikin lapar. Sebut 1–2 warna dominan.'],
      ['Teks poster', 'Nama brand di atas, tagline/promo di bawah — tulis persis teksnya.'],
    ],
    chips: ['uap panas tipis', 'close-up tekstur', 'flat-lay dari atas', 'saus meleleh', 'latar papan kayu', 'cahaya hangat sidelight', 'ilustrasi retro', 'warna hangat homey'],
  },
  fashion: {
    id: 'fashion',
    name: 'Poster Fashion',
    emoji: '👕',
    tips: [
      ['Subjek produk', 'Sebut produk & bahannya: kemeja batik katun, hijab voal, tas kulit.'],
      ['Model & pose', 'Model setengah badan tersenyum, pose berjalan santai, atau produk saja (flat-lay).'],
      ['Komposisi & kamera', 'Eye-level untuk model; flat-lay untuk produk.'],
      ['Detail kain', 'Tekstur kain, motif, jahitan, dan warna terlihat jelas.'],
      ['Latar & lokasi', 'Dinding beton, gang kota, taman, atau studio polos.'],
      ['Pencahayaan', 'Cahaya alami pagi atau studio lembut.'],
      ['Teks poster', 'Nama brand di atas, tagline/promo di bawah — tulis persis teksnya.'],
    ],
    chips: ['model tersenyum setengah badan', 'pose berjalan santai', 'tekstur kain terlihat', 'latar dinding beton', 'cahaya pagi lembut', 'flat-lay produk', 'gaya editorial majalah'],
  },
};

/* Brief dengan FOTO PRODUK ASLI + CONTOH POSTER (aset bawaan
   di public/assets/products & public/assets/posters) — diprioritaskan
   agar permainan default langsung memakai aset nyata. */
const ASSET_BRIEF_IDS = ['dimsum', 'kue', 'pempek'];

const BRIEFS = [
  /* ---------- BRIEF ASET ASLI (foto produk + contoh poster) ---------- */
  { id: 'dimsum', category: 'food', product: 'Dimsum Ayam Keju', brand: 'Dimsum Kang Dedi', emoji: '🥟',
    desc: 'Dimsum ayam keju kukus panas, disajikan di tray dengan topping nori dan saus.',
    target: 'Pembeli cemilan sore dan anak sekolah', price: 'Rp15.000',
    usp: 'Dikukus fresh saat dipesan, keju meleleh melimpah',
    mandatory: 'Promo 4 pcs 15 ribu' },
  { id: 'kue', category: 'food', product: 'Kue Ulang Tahun Custom', brand: 'Kue Bu Ratna', emoji: '🎂',
    desc: 'Kue ulang tahun custom dengan cream lembut dan topping buah segar.',
    target: 'Ulang tahun dan acara keluarga', price: 'Mulai Rp150.000',
    usp: 'Sponge lembut, cream tidak manis berlebih, desain sesuai permintaan',
    mandatory: 'Custom sesuai permintaan' },
  { id: 'pempek', category: 'food', product: 'Pempek Kapal Selam', brand: 'Pempek Asli Palembang', emoji: '🐟',
    desc: 'Pempek ikan tenggiri disajikan dengan cuko kental manis-asam segar.',
    target: 'Pembeli oleh-oleh dan makan siang', price: 'Rp25.000',
    usp: 'Ikan tenggiri asli, cuko kental manis asam segar',
    mandatory: 'Cuko gratis melimpah' },

  /* ---------- BEVERAGES ---------- */
  { id: 'bv1', category: 'beverages', product: 'Es Kopi Susu Gula Aren', brand: 'Kopi Senja', emoji: '☕',
    desc: 'Kopi susu dingin dengan sirup gula aren asli, racikan kedai kopi kecil.',
    target: 'Pekerja kantoran usia 22–35 tahun', price: 'Rp18.000',
    usp: 'Gula aren asli Suku dan espresso segar digelas hari yang sama',
    mandatory: 'Refill gratis sebelum jam 10' },
  { id: 'bv2', category: 'beverages', product: 'Es Teh Leci', brand: 'Teh Bohay', emoji: '🍹',
    desc: 'Teh melati dingin dengan buah leci utuh, manisnya dari buah asli.',
    target: 'Remaja dan mahasiswa', price: 'Rp10.000',
    usp: 'Leci utuh 3 buah setiap gelas, bukan cuma sirup',
    mandatory: 'Promo beli 2 gratis 1' },
  { id: 'bv3', category: 'beverages', product: 'Jus Alpukat Kental', brand: 'Alpukat Jus Segar', emoji: '🥑',
    desc: 'Jus alpukat kental dicampur susu cokelat, favorit keluarga.',
    target: 'Keluarga muda dan anak-anak', price: 'Rp15.000',
    usp: 'Alpukat mentega pilihan tanpa gula tambahan',
    mandatory: '' },
  { id: 'bv4', category: 'beverages', product: 'Es Cincau Susu', brand: 'Cincau Segar Ibu', emoji: '🧋',
    desc: 'Cincau hitam kenyal dengan susu putih dingin, minuman nostalgia.',
    target: 'Pembeli pasar dan ibu-ibu', price: 'Rp8.000',
    usp: 'Cincau dibuat sendiri setiap pagi, kenyal asli',
    mandatory: 'Harga ibu-ibu Rp8.000' },
  { id: 'bv5', category: 'beverages', product: 'Lemon Tea Dingin', brand: 'Sun Tea', emoji: '🍋',
    desc: 'Teh hitam dingin perasan lemon segar, penyegar siang hari.',
    target: 'Pengendara ojol dan pekerja lapangan', price: 'Rp6.000',
    usp: 'Lemon diperas di depan pembeli, tak ada sirup lemon',
    mandatory: 'Segar mantap RP6.000' },

  /* ---------- FOOD ---------- */
  { id: 'fd1', category: 'food', product: 'Keripik Tempe', brand: 'TempeKrispi', emoji: '🍘',
    desc: 'Keripik tempe renyah bumbu balado, kemasan pouch 100 gram.',
    target: 'Pembeli oleh-oleh dan cemilan kantor', price: 'Rp12.000',
    usp: 'Digoreng renyah dua tahap, tahan renyah 2 minggu',
    mandatory: 'Renyo sejati 100gr' },
  { id: 'fd2', category: 'food', product: 'Nasi Ayam Geprek', brand: 'Geprek Bu Rina', emoji: '🍗',
    desc: 'Ayam geprek sambal bawang level 1–5 dengan nasi hangat dan lalapan.',
    target: 'Mahasiswa dan anak muda pedas', price: 'Rp13.000',
    usp: 'Sambal diulek saat dipesan, ayam digeprek di depan pembeli',
    mandatory: 'Level 1 sampai 5' },
  { id: 'fd3', category: 'food', product: 'Risoles Mayo', brand: 'Risol Mama', emoji: '🥟',
    desc: 'Risoles isi mayonis, sosis, telur, dan keju, kulit lembut kriuk.',
    target: 'Ibu-ibu arisan dan pesanan acara', price: 'Rp5.000',
    usp: 'Kulit lembut dibuat harian, isi melimpah tidak pelit',
    mandatory: 'Isi penuh RP5.000' },
  { id: 'fd4', category: 'food', product: 'Roti Bakar Cokelat Keju', brand: 'Roti Bakar Pak Deng', emoji: '🍞',
    desc: 'Roti bakar mentega lembut dengan cokelat dan keju parut melimpah.',
    target: 'Pelajar SMP–SMA sore hari', price: 'Rp10.000',
    usp: 'Dibakar arang kayu, mentega dicepak dua kali',
    mandatory: '' },
  { id: 'fd5', category: 'food', product: 'Martabak Mini', brand: 'Martabak Mini Kaka', emoji: '🥞',
    desc: 'Martabak manis mini 5 isi yang bisa dicampur dalam satu box.',
    target: 'Keluarga malam minggu', price: 'Rp25.000/box',
    usp: 'Adonan tipis lembut, 5 pilihan isi dalam satu box',
    mandatory: '1 box isi 10' },

  /* ---------- FASHION ---------- */
  { id: 'fs1', category: 'fashion', product: 'Kemeja Batik Pria', brand: 'Batik Laras', emoji: '👔',
    desc: 'Kemeja batik cap motif parang, katun premium, potongan reguler.',
    target: 'Pria usia kerja 25–45 tahun', price: 'Rp149.000',
    usp: 'Katun premium adem, jahitan rapi, warna tidak luntur',
    mandatory: 'Cuci tidak luntur' },
  { id: 'fs2', category: 'fashion', product: 'Kaos Polos Katun', brand: 'KaosKu', emoji: '👕',
    desc: 'Kaos oblong 30s jahitan rantai, 12 pilihan warna, unisex.',
    target: 'Remaja dan komunitas (custom sablon)', price: 'Rp45.000',
    usp: 'Bisa sablon 1 pcs, kaos tidak melar walau dicuci berkali-kali',
    mandatory: 'Sablon 1 pcs bisa' },
  { id: 'fs3', category: 'fashion', product: 'Hijab Voal Premium', brand: 'Veela', emoji: '🧕',
    desc: 'Hijab voal lembut tidak licin, mudah dibentuk, pinggir rapi.',
    target: 'Muslimah usia 18–35 tahun', price: 'Rp55.000',
    usp: 'Voal premium yang dibentuk sekali langsung rapi sepanjang hari',
    mandatory: '' },
  { id: 'fs4', category: 'fashion', product: 'Tas Kulit Lokal', brand: 'Kulit Nusantara', emoji: '👜',
    desc: 'Tas selempang kulit sapi asli, handmade pengrajin lokal.',
    target: 'Pria dan wanita karier', price: 'Rp285.000',
    usp: 'Kulit sapi asli garansi jahitan seumur hidup, handmade lokal',
    mandatory: 'Handmade lokal' },
  { id: 'fs5', category: 'fashion', product: 'Sneakers Lokal', brand: 'Langkah Kita', emoji: '👟',
    desc: 'Sepatu sneakers desain lokal, sol empuk, upper canvas tebal.',
    target: 'Anak muda urban 17–28 tahun', price: 'Rp199.000',
    usp: 'Desain orisinal Indonesia, sol empuk untuk jalan seharian',
    mandatory: 'Desain orisinal Indonesia' },
];

function briefsFor(categoryId){
  return BRIEFS.filter(b => b.category === categoryId);
}

/* ============================================================
   TEMPLATE PROMPT PILIHAN — mode mudah untuk pemain awam/orang tua.
   Tiap grup pilih SATU opsi; prompt tersusun otomatis dan rapi.
   ============================================================ */
const LATAR_BY_CATEGORY = {
  beverages: ['meja kayu kafe', 'marble putih bersih', 'latar daun segar', 'kaca dan es batu'],
  food: ['papan kayu rustik', 'piring keramik putih', 'meja rumah makan', 'daun pisang tradisional'],
  fashion: ['dinding beton industrial', 'studio polos terang', 'jalanan kota', 'taman hijau'],
};

function promptGroups(categoryId){
  const latar = LATAR_BY_CATEGORY[categoryId] || LATAR_BY_CATEGORY.beverages;
  return [
    { id: 'gaya',   label: 'GAYA GAMBAR',       options: ['foto produk realistis', 'ilustrasi flat design', 'ilustrasi kartun 3D'] },
    { id: 'cahaya', label: 'PENCAHAYAAN',        options: ['cahaya studio terang', 'cahaya alami lembut', 'golden hour hangat', 'dramatis gelap'] },
    { id: 'kamera', label: 'SUDUT KAMERA',       options: ['close-up detail produk', 'eye-level dari depan', 'flat-lay dari atas'] },
    { id: 'latar',  label: 'LATAR BELAKANG',     options: latar },
    { id: 'font',   label: 'GAYA TULISAN BRAND', options: ['modern tebal', 'klasik elegan', 'playful bulat', 'minimalis tipis'] },
    { id: 'mood',   label: 'SUASANA WARNA',      options: ['hangat dan bersahabat', 'segar dan cerah', 'elegan dan mewah', 'ceria dan playful'] },
  ];
}

/* susun prompt rapi dari pilihan pemain */
function composePrompt(brief, picks, extra){
  const p = picks || {};
  const parts = [
    `Poster ${brief.product}`,
    p.gaya, p.kamera, p.cahaya,
    p.latar ? 'latar ' + p.latar : null,
    p.mood ? 'suasana ' + p.mood : null,
    p.font ? `nama brand "${brief.brand}" dengan tulisan ${p.font}` : null,
  ].filter(Boolean);
  let out = parts.join(', ');
  const tambahan = String(extra || '').trim();
  if (tambahan) out += '. Tambahan: ' + tambahan;
  return out.slice(0, 400);
}

module.exports = { CATEGORIES, BRIEFS, ASSET_BRIEF_IDS, briefsFor, promptGroups, composePrompt };
