# My Coach — Coach Gym Rumahan

PWA (bisa di-install di HP, jalan offline) yang berperan sebagai coach untuk latihan di rumah
dengan **1 set barbel 40 kg yang bisa dibongkar jadi dumbel**.

## Fitur

- **Latihan Hari Ini**: gerakan, set × repetisi, beban, dan **susunan pelat per sisi** + instruksi
  rakit/bongkar barbel ↔ dumbel. Urutan gerakan diatur agar bongkar-pasang minimal.
- **Ilustrasi contoh gerakan** untuk setiap gerakan (dibuat dengan Canva AI): posisi awal dan akhir
  berganti otomatis seperti animasi, tetap tersedia offline. Plus cara melakukan, kesalahan umum,
  dan link video YouTube.
- **Bank gerakan (73 gerakan)**: tiap hari tersusun dari slot (mis. "Dorong dada", "Hinge"), tiap slot punya
  2–3 alternatif. Slot utama tetap selama **blok 4 minggu** (diganti lebih cepat kalau mandek), slot pelengkap
  & core berganti tiap sesi. Tandai ❤️/🚫 di halaman Gerakan, atau **Ganti gerakan** dari Beranda/layar latihan.
  Beban awal gerakan baru diperkirakan dari gerakan "saudara" yang sudah punya data.
- **Rotasi bergulir** A (Dada + Bicep) → B (Back + Tricep) → C (Lower) → Hari Aktif. Fase 2 (A-B-C-A-B-C-Aktif)
  ditawarkan setelah 6 minggu kalau nyeri cedera aktif stabil.
- **Deteksi beban maksimal (e1RM)** dengan rumus Epley dari setiap set, set kalibrasi di sesi pertama,
  dan tes AMRAP tiap 4 minggu.
- **Double progression**: semua set mencapai batas atas → beban naik ke kombinasi pelat berikutnya.
  Kalau sudah mentok, rentang repetisi digeser lalu tempo lambat.
- **Cedera per area tubuh** (lutut, engkel, pinggul, punggung bawah, bahu, siku, pergelangan tangan, leher,
  tulang kering): tambah, ubah status, atau tandai sembuh kapan saja (Beranda / Pengaturan → Cedera). Tiap gerakan
  ditandai beban area (ringan/sedang/berat). *Akut*: area itu tidak dibebani sama sekali. *Pemulihan*: hanya gerakan
  ringan, gerakan sedang terbuka setelah nyeri ≤2 di 2 sesi. *Pulih*: semua boleh. Cek nyeri sebelum sesi, sesudah
  sesi, dan keesokan hari; nyeri ≥4 → area itu dilewati untuk sesi itu. Coach menyarankan status Pulih setelah 4 sesi stabil.
- **Deload** otomatis (maks tiap 8 minggu, atau lebih cepat kalau progres mandek / sering "berat" / nyeri cedera memburuk).
- Timer istirahat (getar + bunyi), pemanasan terpandu, layar tetap menyala saat latihan.
- Grafik e1RM, volume, berat badan. Ekspor/impor backup JSON.

> Aplikasi ini bukan pengganti dokter/fisioterapis.

## Pengembangan

```bash
npm install
npm run dev        # http://localhost:5173  (pratinjau semua ilustrasi: /?anim-preview)
npm test           # unit test logika coach
npm run typecheck
npm run build
```

Struktur:

- `src/coach/` — logika coach murni (pelat, e1RM, progresi, rotasi, cedera, deload, pemilihan gerakan, planner) + program latihan.
- `CONTEXT.md` — glosarium istilah domain (Slot, Blok, Cedera, Beban area, …).
- `public/exercises/` — ilustrasi gerakan (`<id>-a.webp` posisi awal, `<id>-b.webp` posisi akhir).
  Ilustrasi Canva 1200×600 dipecah dengan `scripts/split-illustration.sh <id> <png>`.
- `src/data/` — penyimpanan IndexedDB (Dexie) + service yang menghubungkan logika dan data.
- `src/ui/` — tampilan React.

## Deploy

Push ke `main` → GitHub Actions membangun & mempublikasikan ke GitHub Pages
(`https://muhammadsepta10.github.io/my-coach/`). Aktifkan sekali di
**Settings → Pages → Source: GitHub Actions**.
