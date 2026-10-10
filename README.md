# GitHub Pull & Deployer Telegram Bot

A pure Telegram Bot & WebSocket automation engine for multi-account GitHub deployments, auto folder git pushing, ZIP extraction & deployment, and repository management.

## Fitur Bot

1. **🚀 Auto Deploy Folder**:
   - Memilih folder atau sub-path di dalam base directory (`deployments/`).
   - Membersihkan file sampah otomatis (`.DS_Store`, `__pycache__`, dll).
   - Memeriksa/membuat repository di GitHub via API jika belum ada.
   - `git init`, `git config`, remote branch, commit, dan push otomatis dengan live log streaming.

2. **📦 Unzip & Deploy ZIP**:
   - Menerima kiriman file `.zip` langsung di chat Telegram.
   - Ekstraksi otomatis dan perataan struktur folder (directory flattening jika bertingkat).
   - Pembersihan sampah dan push otomatis ke GitHub repository.

3. **📥 Clone Repo ke VPS / Local**:
   - Validasi URL repository GitHub (`https://github.com/owner/repo`).
   - Auto-detect: Jika folder sudah ada, menjalankan `git pull`; jika belum, menjalankan `git clone` dengan kredensial token terautentikasi.

4. **🗑 List & Hapus Repo**:
   - Menampilkan daftar repository aktif akun GitHub pengguna dengan inline keyboard.
   - Fitur hapus repository dengan konfirmasi tombol interaktif.

5. **👤 Multi-Account GitHub Support**:
   - Parsing token dari variabel lingkungan `GH_TOKENS` (dipisahkan koma) atau `GH_TOKEN`.
   - Deteksi akun otomatis via GitHub API (username, email, quota).
   - Tombol pemilihan akun interaktif saat deploy atau clone.

6. **📡 WebSocket Live Streaming Server**:
   - Terintegrasi di port 3000 (`/ws`) untuk memancarkan log eksekusi langsung ke subscriber WebSocket dan dapat me-relay log ke Telegram.

## Menjalankan Bot & Pengujian

### Instalasi Dependensi
```bash
pnpm install
# atau
npm install
```

### Menjalankan Bot
```bash
pnpm dev
# atau
npm run dev
```

### Menjalankan Runtime Test Suite
Setiap fitur bot memiliki pengujian runtime terisolasi:
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
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
BASE_DIR=/app/applet/deployments
PORT=3000
```
