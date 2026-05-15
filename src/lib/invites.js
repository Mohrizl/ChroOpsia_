import { supabase } from './supabase';

/** Channel broadcast per penerima — notifikasi instan di semua halaman. */
export function inviteBroadcastChannel(userId) {
  return `user-invites:${userId}`;
}

/**
 * Kirim undangan: insert DB + broadcast ke penerima.
 */
export async function sendGameInvite({ fromId, toId, roomCode, senderName }) {
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError || !authData?.session?.user) {
    return { ok: false, error: new Error('Anda harus login untuk mengirim undangan.') };
  }

  const from_id = fromId || authData.session.user.id;

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
    console.error('[invites] insert gagal:', error.message);
    return { ok: false, error };
  }

  // Broadcast realtime (Broadcast API)
  await broadcastInviteToUser(toId, {
    room_code: roomCode,
    senderName: senderName || 'Player',
    from_id,
    invite_id: data.id,
  });

  return { ok: true, data };
}

export async function broadcastInviteToUser(toId, payload) {
  // Gunakan channel unik per user ID
  const channelName = inviteBroadcastChannel(toId);
  const ch = supabase.channel(channelName, {
    config: { broadcast: { self: false } },
  });

  return new Promise((resolve) => {
    // Timeout jika subscribe gagal
    const timeout = setTimeout(() => {
      supabase.removeChannel(ch);
      resolve();
    }, 3000);

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.send({
          type: 'broadcast',
          event: 'game-invite',
          payload,
        });
        clearTimeout(timeout);
        // Jangan langsung remove channel agar message sempat terkirim
        setTimeout(() => {
          supabase.removeChannel(ch);
          resolve();
        }, 500);
      }
    });
  });
}

/**
 * Dengarkan undangan masuk (postgres_changes + broadcast).
 * Digunakan di App.jsx untuk modal global.
 */
export function subscribeToIncomingInvites(userId, onInvite) {
  if (!userId) return () => {};

  const handleInviteData = (room_code, from_id, invite_id, senderName = null) => {
    if (!room_code) return;
    onInvite({
      roomCode: room_code,
      fromId: from_id,
      inviteId: invite_id,
      senderName: senderName,
    });
  };

  // 1. Listen via Postgres Changes (DB level)
  const pgChannel = supabase
    .channel(`pg-invites-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'invites',
        filter: `to_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new;
        handleInviteData(row.room_code, row.from_id, row.id);
      }
    )
    .subscribe();

  // 2. Listen via Broadcast (In-memory level, faster)
  const bcChannel = supabase
    .channel(inviteBroadcastChannel(userId), { 
      config: { broadcast: { self: false } } 
    })
    .on('broadcast', { event: 'game-invite' }, ({ payload }) => {
      handleInviteData(payload.room_code, payload.from_id, payload.invite_id, payload.senderName);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(pgChannel);
    supabase.removeChannel(bcChannel);
  };
}
