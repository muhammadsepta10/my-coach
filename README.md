# My Coach — Coach Gym Rumahan

PWA (bisa di-install di HP, jalan offline) yang berperan sebagai coach untuk latihan di rumah
dengan **1 set barbel 40 kg yang bisa dibongkar jadi dumbel**.

## Fitur

- **Latihan Hari Ini**: gerakan, set × repetisi, beban, dan **susunan pelat per sisi** + instruksi
  rakit/bongkar barbel ↔ dumbel. Urutan gerakan diatur agar bongkar-pasang minimal.
- **Ilustrasi contoh gerakan** untuk setiap gerakan (dibuat dengan Canva AI): posisi awal dan akhir
  berganti otomatis seperti animasi, tetap tersedia offline. Plus cara melakukan, kesalahan umum,
  dan link video YouTube.
- **Rotasi bergulir** A (Dada + Bicep) → B (Back + Tricep) → C (Lower) → Hari Aktif. Fase 2 (A-B-C-A-B-C-Aktif)
  ditawarkan setelah 6 minggu kalau lutut stabil.
- **Deteksi beban maksimal (e1RM)** dengan rumus Epley dari setiap set, set kalibrasi di sesi pertama,
  dan tes AMRAP tiap 4 minggu.
- **Double progression**: semua set mencapai batas atas → beban naik ke kombinasi pelat berikutnya.
  Kalau sudah mentok, rentang repetisi digeser lalu tempo lambat.
- **Lutut kiri**: cek nyeri 0–10 sebelum/sesudah hari C dan keesokan harinya. Nyeri ≥4 → beban kaki −20%.
  Step-up baru terbuka setelah 2 sesi C dengan nyeri ≤2.
- **Deload** otomatis (maks tiap 8 minggu, atau lebih cepat kalau progres mandek / sering "berat" / lutut memburuk).
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

- `src/coach/` — logika coach murni (pelat, e1RM, progresi, rotasi, lutut, deload, planner) + program latihan.
- `public/exercises/` — ilustrasi gerakan (`<id>-a.webp` posisi awal, `<id>-b.webp` posisi akhir).
- `src/data/` — penyimpanan IndexedDB (Dexie) + service yang menghubungkan logika dan data.
- `src/ui/` — tampilan React.

## Deploy

Push ke `main` → GitHub Actions membangun & mempublikasikan ke GitHub Pages
(`https://muhammadsepta10.github.io/my-coach/`). Aktifkan sekali di
**Settings → Pages → Source: GitHub Actions**.
