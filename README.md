# GitHub & Vercel Deployer Telegram Bot

A pure Telegram Bot & WebSocket automation engine for multi-account GitHub deployments and **multi-token Vercel deployments**.

## Fitur Bot

### 🐙 Fitur GitHub (`GH_TOKENS`)
1. **🚀 Auto Deploy Folder**:
   - Memilih folder atau sub-path di dalam base directory (`deployments/`).
   - Membersihkan file sampah otomatis (`.DS_Store`, `__pycache__`, dll).
   - Memeriksa/membuat repository di GitHub via API jika belum ada.
   - `git init`, `git config`, remote branch, commit, dan push otomatis dengan live log streaming.

2. **📦 Unzip & Deploy ZIP**:
   - Menerima file `.zip` langsung di chat Telegram.
   - Ekstraksi otomatis dan perataan struktur folder (directory flattening jika bertingkat).
   - Pembersihan sampah dan push otomatis ke GitHub repository.

3. **📥 Clone Repo ke VPS / Local**:
   - Validasi URL repository GitHub (`https://github.com/owner/repo`).
   - Auto-detect: Jika folder sudah ada, menjalankan `git pull`; jika belum, menjalankan `git clone` dengan kredensial token terautentikasi.

4. **🗑 List & Hapus Repo**:
   - Menampilkan daftar repository aktif akun GitHub pengguna dengan inline keyboard.
   - Fitur hapus repository dengan konfirmasi tombol interaktif.

---

### ▲ Fitur Vercel (`VERCEL_TOKENS`)
*(Fitur sama seperti GitHub tanpa Clone, dengan dukungan multi-token)*
1. **▲ Deploy Folder ke Vercel**:
   - Memilih folder proyek lokal dan langsung di-deploy ke Vercel via Vercel Deployments API v13.
   - Live stream log status build Vercel (INITIALIZING -> BUILDING -> READY).
   - Menghasilkan URL produksi langsung (`https://<project>.vercel.app`).

2. **📦 Unzip & Deploy ke Vercel**:
   - Menerima file `.zip` di chat Telegram saat akun Vercel aktif.
   - Ekstraksi otomatis, auto-flatten, dan langsung dideploy ke Vercel.

3. **🗑 List & Hapus Project Vercel**:
   - Menampilkan daftar project aktif Vercel beserta URL live.
   - Tombol hapus project Vercel secara permanen dengan konfirmasi interaktif.

---

### 👤 Dukungan Multi-Token & Multi-Akun
- **GitHub**: Parsing dari `GH_TOKENS` (dipisahkan koma).
- **Vercel**: Parsing dari `VERCEL_TOKENS` (dipisahkan koma).
- **Pilihan Akun di `/start`**: User wajib memilih akun (GitHub atau Vercel) terlebih dahulu sebelum menu fitur dibuka.
- **`🔄 Ganti Akun / Platform`**: Berpindah akun GitHub atau Vercel kapan saja dengan 1 klik.

---

## Menjalankan Bot & Pengujian

### Menjalankan Bot
```bash
pnpm dev
# atau
npm run dev
```

### Menjalankan Runtime Test Suite
Setiap fitur bot (GitHub, Vercel, Filesystem, Git, WebSocket, Telegram State) memiliki pengujian runtime terisolasi:
```bash
pnpm test:runtime
# atau
npm run test:runtime
```
Juga dapat menjalankan pengujian berbasis native `node:test`:
```bash
pnpm test
# atau
npm test
```

## Environment Variables (`.env`)
```env
GH_TOKENS=ghp_token1,ghp_token2
VERCEL_TOKENS=vercel_token_1,vercel_token_2
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
BASE_DIR=/app/applet/deployments
PORT=3000
```
