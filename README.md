# ChroOpsia - Multiplayer Color Vision Game

ChroOpsia adalah permainan berbasis web (Web App) yang menguji kepekaan dan kecepatan pemain terhadap pengenalan pola warna. Proyek ini mendukung fitur **Real-time Multiplayer** dan dilengkapi dengan sistem autentikasi serta fitur pencarian pemain terintegrasi.

## Fitur Utama
- **Real-Time Multiplayer Room**: Pemain dapat membuat *room* privat atau publik, mengundang pemain lain, dan bermain hingga 8 pemain sekaligus secara *realtime* menggunakan WebSockets (Supabase Realtime).
- **Mode Solo & Mode Multiplayer**: Mainkan mode Color Race atau Ishihara Test.
- **Pencarian Pemain Real-time (Search Player)**: Cari pemain lain yang terdaftar di sistem berdasarkan email atau nama mereka secara langsung dari dalam *Room*. Fitur ini memungkinkan Anda melihat apakah mereka sedang online atau offline.
- **Status Online/Offline Pengguna**: Pantau status pemain lain melalui indikator warna (hijau untuk online, abu-abu untuk offline), yang otomatis sinkron menggunakan Supabase Presence secara global.
- **Google OAuth Login**: Autentikasi aman tanpa kata sandi menggunakan akun Google, lengkap dengan opsi pendaftaran Email biasa.
- **Chat Realtime**: Kirim pesan ke sesama pemain di *Waiting Room*.
- **Keamanan & Efisiensi Database**: Menggunakan Row Level Security (RLS) serta fitur otomatis (Trigger) untuk sinkronisasi profil pemain.

---

## Persiapan dan Setup Aplikasi (Untuk Dosen / Evaluator)

Proyek ini menggunakan stack **React + Vite** untuk sisi *frontend*, dan **Supabase** (PostgreSQL) sebagai *backend* & autentikasi.

### 1. Kloning dan Install Dependensi
Buka terminal dan jalankan perintah berikut di direktori proyek:
```bash
npm install
```

### 2. Setup Environment Variables
Buat file `.env` di *root* proyek (satu tingkat dengan `package.json`) dan isi dengan konfigurasi Supabase Anda:
```env
VITE_SUPABASE_URL=https://<URL-SUPABASE-ANDA>.supabase.co
VITE_SUPABASE_ANON_KEY=<ANON-KEY-SUPABASE-ANDA>
```

### 3. Setup Database Supabase (Wajib!)
Aplikasi ini memerlukan beberapa tabel khusus agar fitur Multiplayer dan Pertemanan berfungsi penuh. Buka Supabase Dashboard > masuk ke **SQL Editor** > jalankan *query* berikut secara berurutan:

```sql
-- 1. Tabel Rooms (Untuk mengelola lobi)
create table public.rooms (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  host_name text not null,
  status text default 'waiting',
  is_private boolean default false,
  num_questions integer default 14,
  game_type text default 'color-race',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.rooms enable row level security;
create policy "Rooms are public for select" on public.rooms for select using (true);
create policy "Anyone can insert rooms" on public.rooms for insert with check (true);
create policy "Anyone can update rooms" on public.rooms for update using (true);
create policy "Anyone can delete rooms" on public.rooms for delete using (true);

-- 2. Tabel Players (Untuk pemain di dalam room)
create table public.players (
  id uuid default gen_random_uuid() primary key,
  room_code text references public.rooms(code) on delete cascade not null,
  name text not null,
  score integer default 0,
  current_question integer default 1,
  finished boolean default false,
  is_bot boolean default false,
  ready boolean default false,
  correct_count integer default 0,
  wrong_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.players enable row level security;
create policy "Players are public for select" on public.players for select using (true);
create policy "Anyone can insert players" on public.players for insert with check (true);
create policy "Anyone can update players" on public.players for update using (true);
create policy "Anyone can delete players" on public.players for delete using (true);

-- 3. Tabel Profiles (Untuk menyimpan data semua akun terdaftar)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Profiles can be inserted by trigger" on public.profiles for insert with check (true);

-- 4. Trigger Otomatis Profil Baru (Setiap ada yang login/register)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 4. Setup Google OAuth (Opsional, untuk mengubah nama domain login)
Jika Anda ingin saat login Google tertulis **"Anda login ke ChroOpsia"** (bukannya `xxxxx.supabase.co`), ikuti langkah ini:
1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat proyek baru dan masuk ke tab **OAuth consent screen**.
3. Isi opsi **App name** dengan "ChroOpsia".
4. Pergi ke **Credentials** > Buat OAuth 2.0 Client IDs.
5. Masukkan Client ID dan Secret tersebut ke Supabase Dashboard Anda (Menu **Authentication** > **Providers** > **Google**).

### 5. Jalankan Aplikasi
Setelah dependensi terinstal dan `.env` disiapkan, jalankan:
```bash
npm run dev
```
Aplikasi akan bisa diakses melalui `https://chro-opsia.vercel.app/`. Selamat bermain!
