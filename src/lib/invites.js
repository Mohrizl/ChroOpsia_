import { supabase } from './supabase';

/** Channel broadcast per penerima — notifikasi instan di semua halaman. */
export function inviteBroadcastChannel(userId) {
  return `user-invites:${userId}`;
}

/** Tolak undangan di DB tanpa UI (penerima sedang bermain). */
export async function rejectInviteInBackground(inviteId) {
  if (!inviteId) return;
  await supabase.from('invites').update({ status: 'rejected' }).eq('id', inviteId);
}

/**
 * Kirim undangan: insert DB + broadcast ke penerima.
 * @returns {{ ok: boolean, data?: object, error?: Error }}
 */
export async function sendGameInvite({ fromId, toId, roomCode, senderName }) {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError || !authData?.session?.user) {
    return { ok: false, error: new Error('Anda harus login untuk mengirim undangan.') };
  }

  const from_id = fromId || authData.session.user.id;
  if (from_id !== authData.session.user.id) {
    return { ok: false, error: new Error('Sesi tidak valid. Login ulang.') };
  }

  const { data, error } = await supabase
    .from('invites')
    .insert({
      from_id,
      to_id: toId,
      room_code: roomCode,
      status: 'pending',
    })
    .select('id, room_code, from_id, to_id, created_at')
    .single();

  if (error) {
    console.error('[invites] insert gagal:', error.code, error.message, error.details);
    return { ok: false, error };
  }

  await broadcastInviteToUser(toId, {
    room_code: roomCode,
    senderName: senderName || 'Player',
    from_id,
    invite_id: data.id,
  });

  return { ok: true, data };
}

export async function broadcastInviteToUser(toId, payload) {
  const ch = supabase.channel(inviteBroadcastChannel(toId), {
    config: { broadcast: { self: false } },
  });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      supabase.removeChannel(ch);
      resolve();
    }, 4000);

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.send({
          type: 'broadcast',
          event: 'game-invite',
          payload,
        });
        clearTimeout(timeout);
        supabase.removeChannel(ch);
        resolve();
      }
    });
  });
}

/**
 * Dengarkan undangan masuk (postgres_changes + broadcast).
 * @returns {() => void} cleanup
 */
export function subscribeToIncomingInvites(userId, onInvite) {
  if (!userId) return () => {};

  const handleRow = (row) => {
    if (!row?.room_code) return;
    onInvite({
      roomCode: row.room_code,
      fromId: row.from_id,
      inviteId: row.id,
      senderName: null,
    });
  };

  const pgChannel = supabase
    .channel(`pg-invites:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'invites',
        filter: `to_id=eq.${userId}`,
      },
      (payload) => handleRow(payload.new)
    )
    .subscribe();

  const bcChannel = supabase
    .channel(inviteBroadcastChannel(userId), { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'game-invite' }, ({ payload }) => {
      if (!payload?.room_code) return;
      onInvite({
        roomCode: payload.room_code,
        fromId: payload.from_id,
        inviteId: payload.invite_id,
        senderName: payload.senderName,
      });
    })
    .subscribe();

  return () => {
    supabase.removeChannel(pgChannel);
    supabase.removeChannel(bcChannel);
  };
}
