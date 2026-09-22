# Dashboard Piutang Embalase

Dashboard React/Vite untuk memantau surplus, dibayar, sisa piutang, sisa botol, dan sisa krat per ID Agen. Paket ini siap dihubungkan ke GitHub lalu di-deploy ke Netlify.

## Fitur

- Ringkasan Surplus, Dibayar, Sisa Piutang, Sisa Botol, Sisa Krat, agen outstanding, dan jumlah agen.
- Sisa Botol dan Sisa Krat per ID Agen tampil di tabel agen dan detail akun.
- Filter cabang dan kategori, serta pencarian nama/ID agen.
- Detail kode faktur, tanggal faktur, surat jalan, botol, peti, dan nilai transaksi.
- Keterangan khusus per agen lengkap dengan waktu simpan.
- Upload workbook sekali; data dan keterangan tersimpan di Netlify Blobs dan diperbarui otomatis di browser lain.
- Polling revisi setiap 8 detik, saat jendela aktif, dan saat tab kembali terlihat.

## Format workbook

Gunakan `Ringkasan_Piutang_Embalase_September_2026.xlsx` yang disertakan. Dashboard membaca dua sheet berikut:

- `Data Agen`
- `Detail Faktur`

Kolom ID Agen diperlakukan sebagai teks agar ID tidak berubah. Dashboard membaca kolom `Sisa Botol` dan `Sisa Krat` dari sheet `Data Agen`. Catatan lama tetap dipertahankan saat upload ulang karena kunci catatan menggunakan ID Agen.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Mode lokal tetap dapat membuka data bawaan. Penyimpanan bersama baru aktif saat dijalankan di Netlify karena menggunakan Netlify Functions dan Netlify Blobs.

## Deploy ke Netlify

1. Upload isi folder ini ke sebuah repository GitHub.
2. Hubungkan repository tersebut di Netlify.
3. Netlify otomatis membaca `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Deploy tanpa konfigurasi environment tambahan.
5. Buka menu **Upload Data**, unggah workbook terbaru, lalu tunggu indikator menjadi **Tersinkron**.

Data bersama memakai Blob store `embalase-receivables-shared`, terpisah dari dashboard lain. Untuk URL publik, pertimbangkan membatasi akses melalui pengaturan Netlify karena versi ini tidak menerapkan autentikasi pengguna.

## Pemeriksaan build

```bash
npm run build
```
