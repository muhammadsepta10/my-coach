# Asisten berjalan di browser HP dan tidak punya wewenang atas latihan

My Coach mendapat model bahasa (Asisten) untuk menjelaskan keputusan coach, menerjemahkan input bebas (cek nyeri, cedera baru, feel set, berat badan), membuat ringkasan, dan menjawab pertanyaan teknik. Kami menjalankannya sepenuhnya di browser HP lewat WebGPU, bukan API cloud, Ollama di PC, atau AI bawaan Chrome, karena data tubuh dan cedera tidak boleh keluar dari HP dan app harus tetap jalan offline tanpa server (GitHub Pages). Konsekuensinya model harus kecil (≤2B), jadi Asisten tidak pernah memutuskan beban, gerakan, atau status cedera: ia hanya mengubah alasan keputusan yang dicatat coach menjadi kalimat, dan setiap data yang ia tafsirkan baru disimpan setelah pengguna mengonfirmasi lewat kartu konfirmasi. Jawaban teknik dibatasi pada teks bank gerakan; pertanyaan yang menyebut nyeri dialihkan ke cek nyeri/cedera.

## Considered Options

- **API cloud**: kualitas jauh lebih baik, tapi mengirim data cedera keluar HP dan butuh internet + biaya.
- **Ollama/LM Studio di PC lewat Wi-Fi**: model lebih besar, tapi tidak jalan di luar rumah dan halaman HTTPS GitHub Pages tidak bisa memanggil `http://` lokal.
- **Chrome Prompt API (Gemini Nano)**: belum didukung di Chrome Android, butuh RAM 16 GB, dan tidak mendukung Bahasa Indonesia.
- **Asisten yang memutuskan langsung**: ditolak; model kecil berhalusinasi, sedangkan aturan cedera menyangkut keselamatan.

## Consequences

- Asisten opsional dan opt-in (unduhan ~0,5–1 GB); app tetap berfungsi penuh dengan teks templat dan parser kata kunci bila model tidak ada atau HP tidak sanggup.
- Input hanya teks; suara ditunda karena pengenal suara Chrome mengirim audio ke server Google.
- Pilihan model final ditetapkan di ADR terpisah setelah uji coba di Samsung A33.
