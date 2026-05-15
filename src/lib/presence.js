import { supabase } from './supabase';

/** Map presence state → { [userId]: true } */
export function presenceStateToOnlineIds(state) {
  const ids = {};
  if (!state || typeof state !== 'object') return ids;

  // Key channel = session.user.id (sama dengan players.id / profiles.id / targetUser.id)
  Object.keys(state).forEach((key) => {
    if (key && key !== 'undefined') ids[key] = true;
  });
  return ids;
}

function dispatchPresenceSync(ids) {
  if (typeof window === 'undefined') return;
  window.__chroLastPresenceOnlineIds = ids;
  window.dispatchEvent(new CustomEvent('chro-presence-sync', { detail: ids }));
}

let channel = null;
let activeUserId = null;
let heartbeatTimer = null;

export function startGlobalPresence(userId) {
  if (!userId) return;

  if (channel && activeUserId === userId) {
    dispatchPresenceSync(presenceStateToOnlineIds(channel.presenceState()));
    return channel;
  }

  if (channel) {
    stopGlobalPresence();
  }

  activeUserId = userId;
  channel = supabase.channel('global-presence', {
    config: { presence: { key: userId } },
  });

  const push = () => {
    if (channel) dispatchPresenceSync(presenceStateToOnlineIds(channel.presenceState()));
  };

  const trackSelf = async () => {
    if (!channel) return;
    await channel.track({
      online_at: new Date().toISOString(),
    });
    push();
  };

  channel
    .on('presence', { event: 'sync' }, push)
    .on('presence', { event: 'join' }, push)
    .on('presence', { event: 'leave' }, push);

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await trackSelf();
    }
  });

  heartbeatTimer = setInterval(() => {
    if (channel?.state === 'joined') trackSelf();
  }, 25000);

  return channel;
}

export function stopGlobalPresence() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (channel) {
    channel.untrack();
    supabase.removeChannel(channel);
    channel = null;
  }
  activeUserId = null;
}
