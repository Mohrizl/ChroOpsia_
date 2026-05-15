import { supabase } from './supabase';

/** Pastikan baris profiles ada untuk user yang login (daftar searchable). */
export async function ensureUserProfile(session) {
  if (!session?.user) return { ok: true };

  const { id, email, user_metadata: meta } = session.user;
  const fullName =
    meta?.full_name?.trim() ||
    meta?.name?.trim() ||
    (email ? email.split('@')[0] : null) ||
    'Player';

  const { error } = await supabase.from('profiles').upsert(
    {
      id,
      email: email || '',
      full_name: fullName,
      avatar_url: meta?.avatar_url || null,
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.warn('[profiles] sync gagal — pastikan tabel profiles sudah dibuat di Supabase:', error.message);
    return { ok: false, error };
  }
  return { ok: true };
}

/** Cari akun terdaftar (nama atau email), terpisah dari status online. */
export async function searchProfiles(query, excludeUserId) {
  const term = query.trim();
  if (term.length < 2) return { data: [], error: null };

  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
    .limit(10);

  if (error) return { data: [], error };

  const rows = (data || [])
    .filter((u) => !excludeUserId || u.id !== excludeUserId)
    .map((u) => ({
      id: u.id,
      name: u.full_name?.trim() || u.email?.split('@')[0] || 'Player',
    }));

  return { data: rows, error: null };
}
