import { supabase } from './supabase';

const CURRENT_ROOM_KEY = 'chro_current_room';

export function setCurrentRoomCode(roomCode) {
  if (roomCode) sessionStorage.setItem(CURRENT_ROOM_KEY, roomCode);
  else sessionStorage.removeItem(CURRENT_ROOM_KEY);
}

export function getCurrentRoomCode() {
  return sessionStorage.getItem(CURRENT_ROOM_KEY) || null;
}

/** Get consistent player name from session */
export function getSessionPlayerName(session) {
  if (!session?.user) return localStorage.getItem('guestName') || 'Player';
  
  // Priority: full_name > name > email prefix > Player
  const name = session.user.user_metadata?.full_name || 
               session.user.user_metadata?.name || 
               session.user.email?.split('@')[0] || 
               'Player';
  return name.trim();
}

/** Apakah user (auth id = players.id) sudah ada di room ini? */
export async function isUserInRoom(userId, roomCode) {
  if (!userId || !roomCode) return false;
  const { data } = await supabase
    .from('players')
    .select('id')
    .eq('room_code', roomCode)
    .eq('id', userId)
    .maybeSingle();
  return Boolean(data);
}

/** UUID auth semua pemain manusia di room (untuk filter undangan). */
export async function getRoomMemberAuthIds(roomCode) {
  if (!roomCode) return new Set();
  const { data } = await supabase
    .from('players')
    .select('id, is_bot')
    .eq('room_code', roomCode);
  const ids = new Set();
  (data || []).forEach((p) => {
    if (!p.is_bot && p.id) ids.add(p.id);
  });
  return ids;
}

/** 
 * Bersihkan record player yang "nyangkut" di room lain yang belum mulai.
 * Berguna saat user pindah room tanpa leave properly.
 */
async function cleanupStaleSessions(userId, currentRoomCode = null) {
  if (!userId) return;
  
  // Cari semua record player milik user ini di room yang statusnya 'waiting'
  // (kecuali room yang sedang ingin dimasuki/dipertahankan)
  const { data: stalePlayers } = await supabase
    .from('players')
    .select('room_code, rooms!inner(status)')
    .eq('id', userId)
    .eq('rooms.status', 'waiting');
    
  if (stalePlayers && stalePlayers.length > 0) {
    const codesToDelete = stalePlayers
      .map(p => p.room_code)
      .filter(code => code !== currentRoomCode);
      
    if (codesToDelete.length > 0) {
      await supabase.from('players').delete().eq('id', userId).in('room_code', codesToDelete);
    }
  }
}

/**
 * Gabung ke room: insert baris players (id = auth user id).
 */
export async function joinRoomAsPlayer(session, roomCode) {
  if (!session?.user) {
    return { ok: false, error: new Error('Login diperlukan untuk masuk room.') };
  }

  const userId = session.user.id;
  const playerName = getSessionPlayerName(session);

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('code, status')
    .eq('code', roomCode)
    .single();

  if (roomError || !room) {
    return { ok: false, error: new Error('Room tidak ditemukan.') };
  }
  
  // Jika game sudah mulai, tidak bisa join sembarangan
  if (room.status !== 'waiting') {
    return { ok: false, error: new Error('Permainan sudah dimulai.') };
  }

  // Bersihkan sesi lama di room lain agar tidak dianggap 'In-Game'
  await cleanupStaleSessions(userId, roomCode);

  // Cek apakah sudah terdaftar di room ini
  if (await isUserInRoom(userId, roomCode)) {
    setCurrentRoomCode(roomCode);
    return { ok: true, playerName, alreadyJoined: true };
  }

  // Cek kapasitas
  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('room_code', roomCode);

  if (count >= 8) {
    return { ok: false, error: new Error('Room sudah penuh (8/8).') };
  }

  const { error: joinError } = await supabase.from('players').insert([
    {
      id: userId,
      room_code: roomCode,
      name: playerName,
      ready: false,
      score: 0,
      current_question: 1,
      finished: false,
      is_bot: false,
    },
  ]);

  if (joinError) {
    if (joinError.code === '23505') {
      setCurrentRoomCode(roomCode);
      return { ok: true, playerName, alreadyJoined: true };
    }
    return { ok: false, error: joinError };
  }

  setCurrentRoomCode(roomCode);
  return { ok: true, playerName, alreadyJoined: false };
}

/**
 * Buat room baru dan masukkan host sebagai player pertama.
 */
export async function createRoomAsPlayer(session, type, settings = {}) {
  if (!session?.user) {
    return { ok: false, error: new Error('Login diperlukan untuk membuat room.') };
  }

  const userId = session.user.id;
  const playerName = getSessionPlayerName(session);
  
  // Bersihkan sesi lama sebelum buat room baru
  await cleanupStaleSessions(userId);

  const prefix = type === 'public' ? 'PUB-' : 'PRV-';
  const code = `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    // 1. Create room
    const { error: roomError } = await supabase.from('rooms').insert([
      {
        code,
        type,
        host_name: playerName,
        status: 'waiting',
        game_type: settings.gameType || 'color-race',
        time_limit: settings.timeLimit || 20,
        num_questions: settings.num_questions || 14,
      },
    ]);

    if (roomError) throw roomError;

    // 2. Add host as player
    const { error: joinError } = await supabase.from('players').insert([
      {
        id: userId,
        room_code: code,
        name: playerName,
        ready: true, 
        score: 0,
        current_question: 1,
        finished: false,
        is_bot: false,
      },
    ]);

    if (joinError) throw joinError;

    setCurrentRoomCode(code);
    return { ok: true, roomCode: code, playerName };
  } catch (err) {
    console.error('createRoomAsPlayer error:', err);
    return { ok: false, error: err };
  }
}

/** 
 * Cek apakah user sedang berada di tengah permainan AKTIF (status room = playing).
 * Ini digunakan untuk memblokir navigasi Lobby atau auto-reject undangan.
 */
export async function isUserInGame(userId) {
  if (!userId) return false;
  
  // Hanya anggap user 'In-Game' jika room statusnya 'playing'
  const { data, error } = await supabase
    .from('players')
    .select('id, rooms!inner(status)')
    .eq('id', userId)
    .eq('finished', false)
    .eq('rooms.status', 'playing')
    .maybeSingle();
    
  if (error) {
    console.error('isUserInGame error:', error);
    return false;
  }

  return Boolean(data);
}

/** Cek status game player secara bulk (untuk list pencarian). */
export async function getUsersActiveGames(userIds) {
  if (!userIds || userIds.length === 0) return {};
  
  const { data, error } = await supabase
    .from('players')
    .select('id, rooms!inner(status)')
    .in('id', userIds)
    .eq('finished', false)
    .eq('rooms.status', 'playing');
  
  if (error) {
    console.error('[players] active games bulk check failed:', error);
    return {};
  }

  const activeMap = {};
  (data || []).forEach(p => {
    activeMap[p.id] = true;
  });
  return activeMap;
}
