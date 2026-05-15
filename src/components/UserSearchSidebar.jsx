import React, { useState, useEffect } from 'react';
import { Search, UserPlus, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { searchProfiles } from '../lib/profileSync';
import { broadcastInviteToUser } from '../lib/invites';
import { isUserInRoom } from '../lib/roomJoin';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import InviteToast from './InviteToast';
import { useLocation } from 'react-router-dom';

export default function UserSearchSidebar({ session, isOpen, onClose, roomCode: roomCodeProp }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inviteToast, setInviteToast] = useState(null);
  const globalOnlineUsers = useOnlineUsers(isOpen);
  const [searchError, setSearchError] = useState(null);
  const location = useLocation();

  const roomCode =
    roomCodeProp ?? location.state?.roomCode ?? location.state?.room_code ?? undefined;

  const playerName =
    session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Player';

  useEffect(() => {
    if (!inviteToast) return;
    const t = setTimeout(() => setInviteToast(null), 3200);
    return () => clearTimeout(t);
  }, [inviteToast]);

  // Real-time search
  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      setSearchError(null);
      const { data, error } = await searchProfiles(searchQuery, session?.user?.id);
      if (error) {
        const msg = error.message || '';
        setSearchError(
          msg.includes('profiles') || error.code === '42P01'
            ? 'Tabel profiles belum ada di Supabase. Jalankan supabase/setup_profiles_and_invites.sql'
            : msg
        );
        setResults([]);
      } else {
        setResults(data.map((u) => ({ id: u.id, name: u.name })));
      }
      setLoading(false);
    };

    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, session?.user?.id]);

  const handleInvite = async (targetUser) => {
    if (!roomCode) {
      setInviteToast({ type: 'error', message: 'Room code belum tersedia. Masuk waiting room dulu.' });
      return;
    }

    const isOnline = globalOnlineUsers[targetUser.id];
    if (!isOnline) {
      setInviteToast({ type: 'error', message: `${targetUser.name} sedang offline.` });
      return;
    }

    if (await isUserInRoom(targetUser.id, roomCode)) {
      setInviteToast({ type: 'error', message: `${targetUser.name} sudah ada di room ini.` });
      return;
    }

    const { error } = await supabase.from('invites').insert({
      from_id: session.user.id,
      to_id: targetUser.id,
      room_code: roomCode,
      status: 'pending',
    });

    if (error) {
      setInviteToast({
        type: 'error',
        message: error.message || 'Gagal mengirim undangan.',
      });
      return;
    }

    await broadcastInviteToUser(targetUser.id, {
      room_code: roomCode,
      senderName: playerName,
      from_id: session.user.id,
    });

    setInviteToast({ type: 'success', message: `Undangan terkirim ke ${targetUser.name}.` });
  };

  if (!session?.user) return null;

  return (
    <>
      <InviteToast toast={inviteToast} />

      {/* Sidebar Overlay */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1001,
          }}
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: isOpen ? 0 : '-100%',
          width: '100%',
          maxWidth: '350px',
          height: '100vh',
          background: 'var(--bg-color)',
          boxShadow: '-4px 0 15px rgba(0,0,0,0.1)',
          transition: 'right 0.3s ease-in-out',
          zIndex: 1002,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--glass-border)',
        }}
      >
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              fontSize: '1.2rem',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Search size={20} color="var(--primary)" /> Search Users
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={24} />
          </button>
        </div>

        <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Cari email atau nama..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem 0.8rem 2.5rem',
                  borderRadius: '12px',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                }}
              />
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: '0.8rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
              {searchQuery.length < 2 ? 'Ketik untuk mencari...' : 'Hasil Pencarian'}
            </h3>

            {loading && (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <Loader2 className="animate-spin" size={24} color="var(--primary)" />
              </div>
            )}

            {!loading && searchError && (
              <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center', marginTop: '1rem' }}>
                {searchError}
              </p>
            )}

            {!loading && !searchError && searchQuery.length >= 2 && results.length === 0 && (
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  marginTop: '1rem',
                }}
              >
                Tidak ada akun ditemukan. Pastikan tabel profiles ada di Supabase.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {results.map((targetUser) => {
                const displayName = targetUser.name || 'Unknown Player';
                const initial = displayName.charAt(0).toUpperCase();
                const isOnline = Boolean(globalOnlineUsers[targetUser.id]);

                return (
                  <div
                    key={targetUser.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.8rem',
                      background: 'var(--input-bg)',
                      borderRadius: '12px',
                      border: '1px solid var(--glass-border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ position: 'relative' }}>
                        <div
                          style={{
                            width: '35px',
                            height: '35px',
                            borderRadius: '50%',
                            background:
                              'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                          }}
                        >
                          {initial}
                        </div>
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: isOnline ? 'var(--success)' : '#94a3b8',
                            border: '2px solid var(--bg-color)',
                          }}
                        />
                      </div>

                      <div>
                        <p
                          style={{
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            color: 'var(--text-main)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '140px',
                          }}
                        >
                          {displayName}
                        </p>
                        <p
                          style={{
                            fontSize: '0.7rem',
                            color: isOnline ? 'var(--success)' : 'var(--text-muted)',
                            fontWeight: isOnline ? 700 : 500,
                          }}
                        >
                          {isOnline ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>

                    {roomCode && (
                      <button
                        type="button"
                        onClick={() => isOnline && handleInvite(targetUser)}
                        disabled={!isOnline}
                        style={{
                          background: isOnline ? 'var(--primary-glow)' : 'rgba(148, 163, 184, 0.2)',
                          border: 'none',
                          color: isOnline ? 'var(--primary)' : 'var(--text-muted)',
                          padding: '0.5rem 0.65rem',
                          borderRadius: '8px',
                          cursor: isOnline ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: isOnline ? 1 : 0.65,
                        }}
                        title={isOnline ? 'Undang ke room' : 'Pemain sedang offline'}
                      >
                        <UserPlus size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '1rem',
            borderTop: '1px solid var(--glass-border)',
            background: 'rgba(99, 102, 241, 0.05)',
          }}
        >
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            {roomCode ? `Anda sedang di Room: ${roomCode}` : 'Masuk ke Room untuk mengundang pemain.'}
          </p>
        </div>
      </div>
    </>
  );
}
