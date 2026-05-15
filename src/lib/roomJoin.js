import { supabase } from './supabase';

const CURRENT_ROOM_KEY = 'chro_current_room';

export function setCurrentRoomCode(roomCode) {
  if (roomCode) sessionStorage.setItem(CURRENT_ROOM_KEY, roomCode);
  else sessionStorage.removeItem(CURRENT_ROOM_KEY);
}

export function getCurrentRoomCode() {
  return sessionStorage.getItem(CURRENT_ROOM_KEY) || null;
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
 * Gabung ke room: insert baris players (id = auth user id).
 * Dipanggil saat terima undangan atau join manual.
 */
export async function joinRoomAsPlayer(session, roomCode) {
  if (!session?.user) {
    return { ok: false, error: new Error('Login diperlukan untuk masuk room.') };
  }

  const userId = session.user.id;
  const playerName =
    session.user.user_metadata?.full_name?.trim() ||
    session.user.email?.split('@')[0] ||
    'Player';

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

  if (await isUserInRoom(userId, roomCode)) {
    setCurrentRoomCode(roomCode);
    return { ok: true, playerName, alreadyJoined: true };
  }

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
