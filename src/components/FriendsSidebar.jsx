import React, { useState, useEffect } from 'react';
import { Users, UserPlus, X, UserMinus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function FriendsSidebar({ session, isOpen, onClose }) {
  const [friends, setFriends] = useState([]);
  const [friendEmail, setFriendEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFriends = async () => {
    if (!session?.user) return;
    try {
      const { data, error } = await supabase.from('friends').select('*').eq('user_id', session.user.id);
      if (error) throw error;
      setFriends(data || []);
      setError(null);
    } catch (err) {
      console.log('Friend system table not ready yet.');
      setError('Tabel friends belum siap di database.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFriends();
    }
  }, [isOpen]);

  // Realtime subscription for friends changes
  useEffect(() => {
    if (!session?.user) return;

    const friendsSubscription = supabase.channel('custom-friends-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friends', filter: `user_id=eq.${session.user.id}` },
        (payload) => {
          fetchFriends(); // Refresh friends list when there's an insert/update/delete
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(friendsSubscription);
    };
  }, [session?.user]);

  const handleAddFriend = async () => {
    if (!friendEmail || !session?.user) return;
    
    if (friends.length >= 10) {
      alert('Batas maksimal teman (10) telah tercapai!');
      return;
    }

    setLoading(true);
    try {
      // 1. Check if the user exists in profiles
      const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('email', friendEmail).single();
      
      if (profileError || !profileData) {
        alert(`Gagal! Pemain dengan email ${friendEmail} tidak ditemukan. Pastikan dia sudah mendaftar dan login.`);
        setLoading(false);
        return;
      }

      // 2. Prevent adding self
      if (profileData.id === session.user.id) {
        alert('Anda tidak bisa menambahkan diri sendiri sebagai teman!');
        setLoading(false);
        return;
      }

      // 3. Add to friends table
      const { error } = await supabase.from('friends').insert([
        { user_id: session.user.id, friend_email: friendEmail, name: profileData.full_name || profileData.email.split('@')[0], status: 'offline' }
      ]);
      if (error) {
        if (error.code === '23505') alert('Pemain ini sudah ada di daftar teman Anda.');
        else throw error;
      } else {
        alert('Teman berhasil ditambahkan!');
        setFriendEmail('');
        fetchFriends();
      }
    } catch (err) {
      console.error(err);
      alert('Tabel friends/profiles belum siap di database. Lihat README untuk setup SQL.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFriend = async (friendId) => {
    if (!session?.user) return;
    try {
      const { error } = await supabase.from('friends').delete().eq('id', friendId);
      if (error) throw error;
      // Optimistic update
      setFriends(friends.filter(f => f.id !== friendId));
    } catch (err) {
      console.error('Error deleting friend', err);
    }
  };

  if (!session?.user) return null; // Only show for logged in users

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
            <Users size={20} color="var(--primary)" /> Friends ({friends.length}/10)
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Add New Friend</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="email" 
                placeholder="Friend's email..." 
                value={friendEmail}
                onChange={(e) => setFriendEmail(e.target.value)}
                disabled={friends.length >= 10}
                style={{ flex: 1, padding: '0.6rem', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '0.85rem', opacity: friends.length >= 10 ? 0.5 : 1 }}
              />
              <button 
                className="btn btn-primary" 
                onClick={handleAddFriend}
                disabled={loading || friends.length >= 10}
                style={{ width: 'auto', padding: '0.6rem 1rem', borderRadius: '12px', opacity: friends.length >= 10 ? 0.5 : 1 }}
              >
                <UserPlus size={16} />
              </button>
            </div>
            {error && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.5rem' }}>{error}</p>}
          </div>

          <div>
            <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Your Friends</h3>
            {friends.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>Daftar teman masih kosong.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {friends.map((f, i) => {
                  const displayName = f.name || f.friend_email || f.email;
                  const initial = displayName.charAt(0).toUpperCase();
                  return (
                    <div key={f.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ width: '35px', height: '35px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>
                          {initial}
                        </div>
                        <div>
                          <p style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{displayName}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: f.status === 'online' ? 'var(--success)' : '#94a3b8' }}></span>
                            {f.status === 'online' ? 'Online' : 'Offline'}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteFriend(f.id)}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Hapus Teman"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
