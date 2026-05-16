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

  const name = session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    session.user.email?.split('@')[0] ||
    'Player';
  return name.trim();
}

/** Apakah user sudah ada di room ini? */
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

export async function getRoomMemberAuthIds(roomCode) {
  if (!roomCode) return new Set();
  const { data } = await supabase
    .from('players')
    .select('id')
    .eq('room_code', roomCode);
  const ids = new Set();
  (data || []).forEach((p) => {
    if (p.id) ids.add(p.id);
  });
  return ids;
}

/** Bersihkan record player yang nyangkut */
async function cleanupStaleSessions(userId, currentRoomCode = null) {
  if (!userId || userId.startsWith('guest_')) return;
  try {
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
  } catch (e) {
    console.error("Cleanup stale sessions failed:", e);
  }
}

/** Gabung ke room */
export async function joinRoomAsPlayer(session, roomCode, guestName = null) {
  const isGuest = !session?.user;

  // Jika database menggunakan UUID, guest_ prefix bisa memicu error, kita gunakan UUIDv4 dummy / string acak yang bersih
  const userId = isGuest ? crypto.randomUUID() : session.user.id;
  const playerName = isGuest ? (guestName || localStorage.getItem('guestName') || 'Guest') : getSessionPlayerName(session);

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('code, status')
    .eq('code', roomCode)
    .single();

  if (roomError || !room) {
    return { ok: false, error: new Error('Room tidak ditemukan.') };
  }

  if (room.status !== 'waiting') {
    return { ok: false, error: new Error('Permainan sudah dimulai.') };
  }

  if (!isGuest) {
    await cleanupStaleSessions(userId, roomCode);
  }

  // Masukkan pemain ke database
  const { error: joinError } = await supabase.from('players').insert([
    {
      id: userId,
      room_code: roomCode,
      name: playerName,
      ready: false,
      score: 0,
      current_question: 1,
      finished: false,
    },
  ]);

  if (joinError) {
    if (joinError.code === '23505') { // Unique constraint violation (sudah bergabung)
      setCurrentRoomCode(roomCode);
      return { ok: true, playerName, alreadyJoined: true };
    }
    return { ok: false, error: joinError };
  }

  setCurrentRoomCode(roomCode);
  return { ok: true, playerName, alreadyJoined: false };
}

/** Buat room baru */
export async function createRoomAsPlayer(session, type, settings = {}, guestName = null) {
  const isGuest = !session?.user;
  const userId = isGuest ? crypto.randomUUID() : session.user.id;
  const playerName = isGuest ? (guestName || localStorage.getItem('guestName') || 'Guest') : getSessionPlayerName(session);

  if (!isGuest) {
    await cleanupStaleSessions(userId);
  }

  const prefix = type === 'public' ? 'PUB-' : 'PRV-';
  const code = `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;

  try {
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

    const { error: joinError } = await supabase.from('players').insert([
      {
        id: userId,
        room_code: code,
        name: playerName,
        ready: true,
        score: 0,
        current_question: 1,
        finished: false,
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

export async function isUserInGame(userId) {
  if (!userId || userId.startsWith('guest_')) return false;

  const { data, error } = await supabase
    .from('players')
    .select('id, rooms!inner(status)')
    .eq('id', userId)
    .eq('finished', false)
    .eq('rooms.status', 'playing')
    .maybeSingle();

  if (error) return false;
  return Boolean(data);
}

export async function getUsersActiveGames(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const { data } = await supabase
    .from('players')
    .select('id, rooms!inner(status)')
    .in('id', userIds)
    .eq('finished', false)
    .eq('rooms.status', 'playing');

  const activeMap = {};
  (data || []).forEach(p => { activeMap[p.id] = true; });
  return activeMap;
}