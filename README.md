# ChroOpsia — Multiplayer Color Vision Game

ChroOpsia adalah aplikasi web berbasis **React + Vite** untuk permainan pengenalan warna (Color Race & Ishihara) dengan mode **multiplayer realtime** hingga 8 pemain. Backend menggunakan **Supabase** (PostgreSQL, Auth, Realtime Presence & Postgres Changes).

---

## Fitur Utama

- **Lobby & Waiting Room** — buat/join room publik atau privat dengan kode room.
- **Realtime multiplayer** — sinkronisasi pemain, chat, dan status room via Supabase Realtime.
- **Undangan teman** — cari akun terdaftar, cek status online/offline, kirim undangan; penerima bisa terima/tolak lewat modal global.
- **Presence global** — status online mengikuti `session.user.id` di seluruh halaman (lobby, home, waiting room).
- **Autentikasi** — email/password, Google OAuth, atau main sebagai guest.
- **Profil pemain** — tabel `profiles` untuk pencarian user; `players.id` = UUID auth user.

---

## Prasyarat

| Tool | Versi disarankan |
|------|------------------|
| Node.js | 18+ |
| npm | 9+ |
| Akun [Supabase](https://supabase.com) | Project aktif |

---

## Setup Aplikasi (Langkah untuk Dosen / Evaluator)

### 1. Clone & install dependensi

```bash
git clone <url-repo-anda>
cd ChroOpsia_Pemweb
npm install
```

### 2. Environment variables

Buat file `.env` di root project (sejajar dengan `package.json`):

```env
VITE_SUPABASE_URL=https://<PROJECT-ID>.supabase.co
VITE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
```

Nilai di atas diambil dari **Supabase Dashboard → Project Settings → API**.

### 3. Setup database Supabase

Buka **SQL Editor** di dashboard Supabase, lalu jalankan script berikut **berurutan**:

1. **`supabase_schema.sql`** — tabel `rooms` dan `players` (dasar multiplayer).
2. **`supabase/setup_profiles_and_invites.sql`** — tabel `profiles`, `invites`, trigger profil, backfill user, realtime publication.
3. **`supabase/fix_invites_rls.sql`** — perbaikan policy RLS insert/select pada `invites` (jika undangan tidak masuk DB).

**Realtime (wajib):** di **Database → Publications → supabase_realtime**, pastikan tabel ini aktif:

- `rooms`
- `players`
- `profiles`
- `invites`

### 4. (Opsional) Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → OAuth consent screen → App name: **ChroOpsia**.
2. Buat **OAuth 2.0 Client ID**.
3. Supabase → **Authentication → Providers → Google** → masukkan Client ID & Secret.
4. Tambahkan redirect URL: `http://localhost:5173` dan URL production (mis. Vercel).

### 5. Menjalankan aplikasi

**Development (lokal):**

```bash
npm run dev
```

Buka URL yang ditampilkan di terminal (biasanya `http://localhost:5173`).

**Production build:**

```bash
npm run build
npm run preview
```

**Deploy (contoh Vercel):** set environment variable `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di dashboard hosting, lalu deploy branch `main`.

---

## Struktur Database (Ringkas)

| Tabel | Fungsi |
|-------|--------|
| `rooms` | Data room (`code`, host, status, game_type, …) |
| `players` | Pemain di room; **`id` = UUID auth user** (`session.user.id`) |
| `profiles` | Daftar akun terdaftar (untuk pencarian & undangan) |
| `invites` | Log undangan (`from_id`, `to_id`, `room_code`, `status`) |

**Konvensi penamaan di kode:**

- React (state/router): **camelCase** → `roomCode`
- Supabase (kolom DB): **snake_case** → `room_code`

---

## Alur Undangan Multiplayer

1. Host membuat room di Lobby → baris `players` dibuat dengan `id = auth user id`.
2. Host membuka **Invite Friends** di Waiting Room → mencari user di `profiles`.
3. Jika target **online** dan **belum ada di room**, insert ke `invites` + broadcast realtime.
4. Penerima melihat modal **Undangan permainan** (di `App.jsx`, semua halaman).
5. Saat **Terima**, aplikasi memanggil `joinRoomAsPlayer()` → insert ke `players` → navigasi ke waiting room.
6. Pemain yang **sudah di room yang sama** tidak bisa diundang lagi; notifikasi undangan untuk room yang sama diabaikan.

---

## Struktur Folder Penting

```
src/
  App.jsx                 # Presence global, listener undangan, modal terima/tolak
  pages/
    Lobby.jsx             # Buat/join room
    WaitingRoom.jsx       # Lobby in-game, chat, undang teman
  components/
    UserSearchSidebar.jsx # Pencarian & undangan (sidebar)
    InviteToast.jsx       # Notifikasi toast sukses/gagal
  lib/
    supabase.js           # Klien Supabase
    profileSync.js        # Sync & search profiles
    presence.js           # Channel global-presence
    invites.js            # Insert/broadcast/listen undangan
    roomJoin.js           # Join room saat terima undangan
supabase/
  setup_profiles_and_invites.sql
  fix_invites_rls.sql
```

---

## Troubleshooting

| Gejala | Solusi |
|--------|--------|
| Pencarian user kosong | Jalankan `setup_profiles_and_invites.sql`; pastikan user pernah login |
| Tabel `invites` tetap 0 baris | Jalankan `fix_invites_rls.sql`; pastikan pengirim **login** (bukan guest) |
| Status selalu Offline | Kedua akun harus login; buka web di tab terpisah |
| Terima undangan tapi pemain tetap 1 | Deploy versi terbaru; `joinRoomAsPlayer` harus insert ke `players` |
| Undangan muncul padahal sudah 1 room | Pastikan `players.id` = UUID auth; host join ulang setelah update |

---

## Lisensi & Kredit

Proyek pembelajaran Pemrograman Web — ChroOpsia Team.
