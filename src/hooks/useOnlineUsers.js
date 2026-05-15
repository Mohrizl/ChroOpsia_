import { useState, useEffect } from 'react';

/** Status online dari global presence (App.jsx). */
export function useOnlineUsers(refreshWhenOpen = false) {
  const [onlineUsers, setOnlineUsers] = useState(() =>
    typeof window !== 'undefined' && window.__chroLastPresenceOnlineIds
      ? { ...window.__chroLastPresenceOnlineIds }
      : {}
  );

  useEffect(() => {
    const handler = (e) => {
      setOnlineUsers(e.detail && typeof e.detail === 'object' ? { ...e.detail } : {});
    };
    if (window.__chroLastPresenceOnlineIds) {
      setOnlineUsers({ ...window.__chroLastPresenceOnlineIds });
    }
    window.addEventListener('chro-presence-sync', handler);
    return () => window.removeEventListener('chro-presence-sync', handler);
  }, []);

  useEffect(() => {
    if (!refreshWhenOpen) return;
    const tick = () => {
      if (window.__chroLastPresenceOnlineIds) {
        setOnlineUsers({ ...window.__chroLastPresenceOnlineIds });
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [refreshWhenOpen]);

  return onlineUsers;
}
