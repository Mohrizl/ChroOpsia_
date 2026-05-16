import { useNavigate } from 'react-router-dom';
import { Users, User, Play, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('');
  const [user, setUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const isGuestSession = localStorage.getItem('isGuest') === 'true';

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setIsGuest(false);
        setPlayerName(session.user.user_metadata?.full_name || session.user.email.split('@')[0]);
        if (isGuestSession) {
          localStorage.removeItem('isGuest');
          localStorage.removeItem('guestName');
        }
      } else {
        setUser(null);
        setIsGuest(isGuestSession);

        // Ambil nama guest yang sudah ada atau bikin baru
        const guestName = localStorage.getItem('guestName') || `Guest_${Math.floor(Math.random() * 1000)}`;
        setPlayerName(guestName);
        if (isGuestSession) localStorage.setItem('guestName', guestName);
      }
    });

    // 2. Jika di App.jsx sudah terdeteksi Guest, paksa state lokal langsung True
    if (isGuestSession) {
      setIsGuest(true);
      const savedName = localStorage.getItem('guestName') || 'Guest_Player';
      setPlayerName(savedName);
    }
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('isGuest');
    localStorage.removeItem('guestName');

    // Alihkan ke login dan segarkan halaman agar semua state bersih total
    navigate('/');
    window.location.reload();
  };

  return (
    <div className="container">
      <div className="hero-section glass-panel">
        <h1 className="title text-gradient">ChroOpsia</h1>
        <p className="subtitle">The Ultimate Color Vision Challenge</p>

        {user && !isGuest && (
          <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--input-bg)', borderRadius: '16px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Welcome back,</p>
            <p style={{ fontWeight: '600', fontSize: '1.2rem' }}>{user.user_metadata?.full_name || user.email}</p>
          </div>
        )}

        {isGuest && (
          <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--input-bg)', borderRadius: '16px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Playing as</p>
            <input
              value={playerName}
              onChange={(e) => {
                const newName = e.target.value;
                setPlayerName(newName);
                localStorage.setItem('guestName', newName);
              }}
              style={{
                width: '100%', padding: '0.85rem 1rem', borderRadius: '14px', border: '1px solid var(--glass-border)',
                background: 'var(--bg-panel)', color: 'var(--text-main)', fontSize: '1rem'
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '380px', margin: '0 auto' }}>
          <button
            className="btn btn-primary"
            style={{ padding: '1rem', borderRadius: '18px', fontSize: '1rem', gap: '0.75rem' }}
            onClick={() => navigate('/select-mode', { state: { mode: 'solo', playerName, isGuest } })}
          >
            <Play size={20} />
            Play Solo
          </button>
          <button
            className="btn btn-secondary"
            style={{ padding: '1rem', borderRadius: '18px', fontSize: '1rem', gap: '0.75rem' }}
            onClick={() => navigate('/lobby', { state: { playerName, isGuest } })}
          >
            <Users size={20} />
            Multiplayer Room
          </button>

          {(isGuest || user) && (
            <button
              className="btn btn-secondary"
              onClick={handleLogout}
              style={{ marginTop: '1rem', border: 'none', background: 'transparent', color: 'var(--danger)', gap: '0.75rem' }}
            >
              <LogOut size={20} />
              {isGuest ? 'Exit Guest Session' : 'Logout'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
