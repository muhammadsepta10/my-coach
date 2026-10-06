# My Coach

Coach latihan beban di rumah untuk satu orang, dengan satu set barbel/dumbel 40 kg, kursi, lantai, tembok, dan satu anak tangga. Coach menyusun sesi, mengatur beban, dan menyesuaikan gerakan dengan kondisi tubuh pengguna.

## Program

**Hari latihan**:
Satu dari A (Dada + Bicep), B (Back + Tricep), C (Lower), atau Hari Aktif, yang dijalankan bergulir.
_Avoid_: Split, day

**Bank gerakan**:
Seluruh kumpulan gerakan yang bisa dipilih coach.
_Avoid_: Library, katalog

**Slot**:
Fungsi tetap dalam satu hari latihan (mis. "Dorong dada", "Hinge") yang diisi tepat satu gerakan per sesi.

**Kandidat**:
Gerakan yang boleh mengisi sebuah slot; kandidat pertama adalah gerakan asli (⭐).
_Avoid_: Alternatif, variasi (variasi = tingkat kesulitan gerakan bodyweight)

**Slot primer**:
Slot gerakan utama yang isinya tetap selama satu blok supaya progres beban terukur.

**Slot aksesori**:
Slot pelengkap yang isinya berganti tiap sesi.

**Kolam core**:
Kumpulan gerakan core bersama; tiap sesi diambil satu anti-gerakan dan satu lainnya.

**Blok**:
Periode 4 minggu (setelah 2 minggu kalibrasi) tempat isi slot primer tetap.

**Gerakan saudara**:
Gerakan lain yang bebannya bisa dipakai untuk memperkirakan beban awal sebuah gerakan baru.

## Kondisi tubuh

**Cedera**:
Keluhan pada satu area tubuh (dan sisinya) yang membatasi gerakan yang boleh dipilih; bisa ditambah, diubah statusnya, dan ditandai sembuh kapan saja.
_Avoid_: Injury, sakit, keluhan

**Area tubuh**:
Bagian tubuh yang bisa cedera: lutut, engkel, pinggul, punggung bawah, bahu, siku, pergelangan tangan, leher, tulang kering/betis.

**Sisi**:
Kiri atau kanan untuk area yang berpasangan; dicatat untuk riwayat, tidak membedakan gerakan yang dipilih.

**Status cedera**:
Tingkat keparahan cedera yang dipilih pengguna: Akut, Pemulihan, atau Pulih.

**Akut**:
Status cedera di mana gerakan yang membebani areanya tidak dipilih sama sekali.

**Pemulihan**:
Status cedera di mana hanya gerakan yang ringan untuk areanya yang boleh, dibuka bertahap saat nyeri stabil.

**Pulih**:
Status cedera di mana semua gerakan boleh, tetapi nyeri tetap dipantau.

**Cek nyeri**:
Skor nyeri 0–10 untuk cedera aktif, ditanya sebelum sesi, sesudah sesi yang membebani areanya, dan keesokan harinya, atau dilaporkan pengguna kapan saja selama sesi; dipakai coach untuk menyarankan perubahan status.
_Avoid_: Knee check (khusus lutut)

**Cedera aktif**:
Cedera yang belum ditandai sembuh, apa pun statusnya.

**Beban area**:
Seberapa berat sebuah gerakan membebani satu area tubuh: ringan, sedang, atau berat; area yang tidak disebut berarti tidak dibebani.
_Avoid_: Knee tier, tingkat lutut (kini berlaku untuk semua area)

**Nyeri stabil**:
Cek nyeri ≤2 di sejumlah sesi berturut-turut yang membebani area cedera; dasar membuka gerakan sedang (2 sesi) dan menyarankan status Pulih (4 sesi).

**Akut sesi**:
Perlakuan Akut khusus untuk satu sesi karena cek nyeri ≥4 (sebelum atau di tengah sesi; di tengah sesi berlaku untuk gerakan yang tersisa), tanpa mengubah status cedera tersimpan.

## Asisten

**Asisten**:
Model bahasa di HP yang menjelaskan keputusan coach dan menerjemahkan ucapan bebas pengguna menjadi data; tidak pernah memutuskan beban, gerakan, atau status cedera.
_Avoid_: AI coach, chatbot, LLM (di teks untuk pengguna)

**Alasan keputusan**:
Catatan terstruktur yang dibuat coach untuk setiap keputusannya (beban naik/turun, deload, gerakan terkunci, gerakan diganti) beserta angka dan aturan yang dipakai; satu-satunya sumber yang boleh dijelaskan Asisten.
_Avoid_: Penjelasan AI, reasoning

**Teks templat**:
Kalimat baku yang menyampaikan alasan keputusan atau mengenali input tanpa Asisten; selalu tersedia walau model tidak diunduh.

**Ringkasan**:
Teks rangkuman yang dibuat Asisten saat diminta pengguna dan disimpan di riwayat; ada tiga jenis: Ringkasan sesi, Ringkasan 7 hari (7 hari terakhir), dan Ringkasan blok (ditawarkan saat blok selesai).
_Avoid_: Recap, laporan, ringkasan mingguan
