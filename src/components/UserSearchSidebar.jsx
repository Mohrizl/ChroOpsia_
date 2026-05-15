import React, { useState, useEffect } from 'react';
import { Search, UserPlus, X, Send, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLocation } from 'react-router-dom';

export default function UserSearchSidebar({ session, isOpen, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({});
  const location = useLocation();

  // Get roomCode from location state if we are in WaitingRoom
  const room_code = location.state?.room_code || location.state?.roomCode;
  const playerName = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Player';

  // Listen to global presence
  useEffect(() => {
    if (!session?.user) return;

    const channel = supabase.channel('global-presence');

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const onlineMap = {};
      Object.keys(state).forEach(key => {
        onlineMap[key] = true;
      });
      setOnlineUsers(onlineMap);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user]);

  // Real-time search
  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from('players')
        .select('id, name')
        .ilike('name', `%${searchQuery}%`) // Gunakan ilike langsung pada kolom name
        .limit(10);

      if (!error && data) {
        // Pastikan session.user.id ada sebelum filter
        setResults(data.filter(u => u.id !== session?.user?.id));
      }
      setLoading(false);
    };

    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, session?.user?.id]);

  const handleInvite = async (targetUser) => {
    if (!room_code) {
      alert('Masuk ke Room dulu!');
      return;
    }

    const { error: dbError } = await supabase
      .from('invites')
      .insert([
        {
          from_id: session.user.id,
          to_id: targetUser.id,
          room_code: room_code
        }
      ]);

    if (dbError) {
      console.error('Database Invite Error:', dbError);
      alert('Gagal kirim undangan ke database');
      return; 
    }

    try {
      const channel = supabase.channel(`notif-${targetUser.id}`);

      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({
            type: 'broadcast',
            event: 'invite',
            payload: {
              senderName: playerName,
              room_code: room_code
            }
          });

          alert(`Undangan berhasil dikirim ke ${targetUser.name}!`);
          supabase.removeChannel(channel);
        }
      });
    } catch (err) {
      console.error('Realtime Broadcast error:', err);
      alert(`Undangan tersimpan di sistem, namun gagal mengirim notifikasi realtime ke ${targetUser.name}.`);
    }
  };

  if (!session?.user) return null;

  return (
    <>
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
            zIndex: 1001
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
          borderLeft: '1px solid var(--glass-border)'
        }}
      >
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={20} color="var(--primary)" /> Search Users
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
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
                style={{ width: '100%', padding: '0.8rem 1rem 0.8rem 2.5rem', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '0.85rem' }}
              />
              <Search size={18} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
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

            {!loading && searchQuery.length >= 2 && results.length === 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>Tidak ada pengguna ditemukan.</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {results.map((u) => {
                const displayName = u.name || 'Unknown Player';
                const initial = displayName.charAt(0).toUpperCase();
                const isOnline = onlineUsers[u.id];

                return (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.8rem',
                      background: 'var(--input-bg)',
                      borderRadius: '12px',
                      border: '1px solid var(--glass-border)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ position: 'relative' }}>
                        {/* Avatar Bulat */}
                        <div style={{
                          width: '35px',
                          height: '35px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: '1rem'
                        }}>
                          {initial}
                        </div>
                        {/* Indikator Online/Offline */}
                        <span style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: isOnline ? 'var(--success)' : '#94a3b8',
                          border: '2px solid var(--bg-color)'
                        }}></span>
                      </div>

                      <div>
                        {/* Nama Player dari kolom 'name' */}
                        <p style={{
                          fontSize: '0.9rem',
                          fontWeight: 'bold',
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '140px'
                        }}>
                          {displayName}
                        </p>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {isOnline ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>

                    {/* Button Invite muncul jika roomCode tersedia */}
                    {room_code && (
                      <button
                        onClick={() => handleInvite(u)}
                        style={{
                          background: 'var(--primary-glow)',
                          border: 'none',
                          color: 'var(--primary)',
                          padding: '0.5rem',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Undang ke Room"
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

        <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(99, 102, 241, 0.05)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            {room_code ? `Anda sedang di Room: ${room_code}` : 'Masuk ke Room untuk mengundang pemain.'}
          </p>
        </div>
      </div>
    </>
  );
}
