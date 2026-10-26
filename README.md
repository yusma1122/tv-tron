# PPDS Digital Signage

Pusat informasi digital PPDS Obstetri dan Ginekologi FKIK ULM–RSUD Ulin.
Aplikasi web statis (HTML + CSS + JavaScript murni) dengan Supabase sebagai database, autentikasi, dan penyimpanan media. Tanpa build, tanpa Node.js, tanpa backend sendiri.

## Struktur

| File | Fungsi |
|---|---|
| `index.html` | Halaman awal (tautan ke display & admin) |
| `display.html` | Tayangan untuk Smart TV (publik, hanya baca) |
| `admin.html` | Dashboard administrator (wajib login) |
| `css/`, `js/`, `assets/` | Stylesheet, skrip, logo contoh |
| `supabase/schema.sql` | Tabel, RLS, bucket storage, data awal |
| `config.example.js` | Contoh konfigurasi → salin jadi `config.js` |

## Langkah pemasangan

1. **Buat proyek Supabase** di https://supabase.com.
2. **Jalankan skema**: SQL Editor → tempel seluruh isi `supabase/schema.sql` → Run.
3. **Buat akun admin**: Authentication → Users → *Add user* (centang *Auto Confirm User*). Lalu jalankan di SQL Editor (ganti email):
   ```sql
   insert into public.profiles (id, display_name, role)
   select id, 'Administrator', 'admin' from auth.users where email = 'admin@contoh.ac.id'
   on conflict (id) do update set role = 'admin';
   ```
   Disarankan mematikan pendaftaran publik: Authentication → Providers → Email → matikan *Allow new users to sign up*.
4. **Isi konfigurasi**: salin `config.example.js` menjadi `config.js`, isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (Project Settings → API). Gunakan **anon/publishable key saja — jangan service_role**.
5. **Jalankan**:
   - Lokal: `python3 -m http.server 8080` di folder ini, buka `http://localhost:8080`.
   - Publik: unggah ke GitHub Pages / hosting statis lain (sertakan `config.js`; anon key memang aman dipublikasikan karena data dilindungi RLS).

## Memakai di TV

1. Buka `display.html` di browser TV.
2. Klik layar (atau tekan **F**) untuk layar penuh; klik juga mengaktifkan suara video.
3. Konten dari dashboard muncul otomatis sesuai *interval pemeriksaan pembaruan* (bawaan 60 detik).
4. Agar video bersuara otomatis tanpa klik (Chrome kiosk):
   `chrome --kiosk --autoplay-policy=no-user-gesture-required https://alamat-anda/display.html`
   Tanpa opsi ini, video selalu mulai tanpa suara (tidak ada popup); klik layar atau tekan M bila ingin menyalakan suara.

## Perilaku penting

- **Jadwal Hari Ini**: status (Sedang Berlangsung / Selesai / Berikutnya) dihitung dari jam perangkat TV — pastikan jam & zona waktu TV benar. Jadwal yang lewat tidak dihapus dari database.
- **Agenda Mendatang** otomatis menyembunyikan agenda yang sudah selesai.
- **Pengumuman** kategori *Akademik* tampil di slide "Informasi Akademik"; kategori lain di slide "Pengumuman". Prioritas *Tinggi* memakai desain khusus. Teks ditampilkan sebagai teks biasa (aman dari HTML/skrip).
- **Video**: bisa unggah file, tautan **YouTube** (disarankan; putar otomatis, lanjut ke slide berikutnya saat selesai, mulai tanpa suara), tautan **Google Drive** (file harus dibagikan "Siapa saja yang memiliki link"; Drive tidak memutar otomatis dan tidak memberi tahu saat selesai, jadi isi *durasi tayang* — kurang andal untuk TV), atau URL langsung ke berkas .mp4/.webm. Penyematan YouTube hanya jalan jika halaman dibuka lewat http(s) (localhost atau GitHub Pages), bukan dengan membuka file langsung.
- Jenis tayangan tanpa konten dilewati otomatis. Jika koneksi terputus, TV memakai cache lokal terakhir dan menampilkan status di footer, lalu mencoba lagi tiap ≤15 detik.
- Batas unggahan: foto JPG/PNG/WebP ≤ 5 MB, logo ≤ 2 MB, video MP4/WebM ≤ 50 MB (juga diberlakukan di bucket storage).

## Keamanan

- RLS aktif di semua tabel. Anonim hanya dapat **membaca** baris yang dipublikasikan (dan pengumuman dalam periode tayang). Tulis hanya untuk akun berperan `admin` di tabel `profiles`, yang tidak dapat diubah dari browser.
- Tidak ada service_role key di frontend.
- Jangan menampilkan data pasien / informasi klinis yang dapat mengidentifikasi pasien.
- Data contoh tidak disertakan; hanya pengaturan awal dan urutan tayangan.

## Di luar MVP (P1)

Statistik aktivitas, riwayat publikasi, banyak playlist, preview TV di dashboard, pemantauan perangkat.

## Pemecahan masalah video

- **YouTube "Error 153 / Video player configuration error"**: YouTube menolak pemutar yang dibuka tanpa alamat web (referer). Penyebab paling umum: `display.html` dibuka langsung dari file (`file:///...`). Solusi: jalankan lewat `python3 -m http.server 8080` lalu buka `http://localhost:8080/display.html`, atau pasang di GitHub Pages / hosting https. Video yang pemiliknya menonaktifkan penyematan juga memberi error; slide seperti ini dilewati otomatis.
- **Google Drive**: aplikasi mencoba memutar file langsung (autoplay tanpa suara). Jika Drive menolak (file besar/pemindaian virus), otomatis memakai pemutar Drive yang tidak bisa autoplay. Untuk TV, upload ke Supabase atau YouTube lebih andal.

## Mode gelap / terang (admin)

Tombol bulat di pojok kanan atas dashboard (dan halaman login) mengganti tema; pilihan diingat di browser.

## Tampilan video

Video diisi memenuhi area tayangan (mode *cover*, tanpa bar hitam). Konsekuensinya video yang rasionya tidak 16:9 (mis. vertikal) akan terpotong sedikit di tepinya.

## Subtitle

Subtitle/caption YouTube dimatikan otomatis di layar TV. Untuk video Google Drive, subtitle tidak bisa dikontrol dari aplikasi (diatur oleh pemutar Drive).
