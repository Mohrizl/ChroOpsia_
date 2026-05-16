import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Globe, ArrowRight, User, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { joinRoomAsPlayer, createRoomAsPlayer, getSessionPlayerName, isUserInGame } from '../lib/roomJoin';

export default function Lobby() {
  const navigate = useNavigate();
  const location = useLocation();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [session, setSession] = useState(null);

  // Sync session and playerName
  useEffect(() => {
    // Check if state was passed from Home.jsx (for guest play)
    if (location.state?.playerName) {
      setPlayerName(location.state.playerName);
    }

    // Initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!location.state?.playerName) {
        setPlayerName(getSessionPlayerName(s));
      }
    });

    // Listen to changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!location.state?.playerName) {
        setPlayerName(getSessionPlayerName(s));
      }
    });

    return () => subscription.unsubscribe();
  }, [location.state]);

  const fetchRooms = async () => {
    try {
      // Optimasi cleanup: Hanya hapus room yang benar-benar kosong dan statusnya masih waiting
      const { data: roomsWithPlayers } = await supabase
        .from('rooms')
        .select('id, created_at, players')
        .eq('status', 'waiting');

      if (roomsWithPlayers) {
        for (const r of roomsWithPlayers) {
          const hasPlayers = r.players && r.players.length > 0;
          const isOld = (Date.now() - new Date(r.created_at).getTime()) > 45 * 1000;
          if (!hasPlayers && isOld) {
            await supabase.from('rooms').delete().eq('id', r.id);
          }
        }
      }

      const { data: roomsData, error: roomsError } = await supabase
        .from('rooms')
        .select('*, players(*)')
        .eq('type', 'public')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false });

      if (roomsError) throw roomsError;
      
      const formatted = (roomsData || [])
        .filter(r => r.players && r.players.length > 0)
        .map(r => ({
          code: r.code, 
          host: r.host_name, 
          players: r.players.length, 
          maxPlayers: 8, 
          status: r.status
        }));
      setPublicRooms(formatted);
    } catch (err) {
      console.error('Error fetching rooms:', err);
    }
  };

  useEffect(() => {
    fetchRooms();
    const channel = supabase
      .channel('lobby-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => fetchRooms())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => fetchRooms())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const handleJoin = async (e, targetCode = null) => {
    if (e) e.preventDefault();
    const codeToJoin = (targetCode || roomCode).trim().toUpperCase();
    if (!playerName.trim()) { setError('Please enter your name first'); return; }
    if (!codeToJoin) { setError('Please enter a room code'); return; }

    setLoading(true);
    setError('');

    try {
      if (session?.user?.id && await isUserInGame(session.user.id)) {
        setError('Kamu sedang dalam permainan yang sedang berlangsung.');
        setLoading(false);
        return;
      }

      // Ambil nama guest yang valid dari state
      const isGuest = localStorage.getItem('isGuest') === 'true';
      const result = await joinRoomAsPlayer(session, codeToJoin, playerName);
      
      if (result.ok) {
        navigate('/waiting-room', { 
          state: { 
            roomCode: codeToJoin, 
            playerName: result.playerName, 
            isHost: false,
            isGuest
          } 
        });
      } else {
        setError(result.error?.message || 'Gagal masuk room');
      }
    } catch (err) {
      setError('Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  const createRoom = async (type) => {
    if (!playerName.trim()) { setError('Please enter your name first'); return; }
    
    setLoading(true);
    setError('');

    try {
      if (session?.user?.id && await isUserInGame(session.user.id)) {
        setError('Kamu sedang dalam permainan yang sedang berlangsung.');
        setLoading(false);
        return;
      }

      const isGuest = localStorage.getItem('isGuest') === 'true';
      const result = await createRoomAsPlayer(session, type, {}, playerName);
      
      if (result.ok) {
        navigate('/waiting-room', { 
          state: { 
            roomCode: result.roomCode, 
            playerName: result.playerName, 
            isHost: true,
            isGuest
          } 
        });
      } else {
        setError(result.error?.message || 'Gagal membuat room');
      }
    } catch (err) {
      setError('Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <style>{`
        .lobby-grid { display: grid; grid-template-columns: 1fr 340px; gap: 2rem; align-items: start; }
        @media (max-width: 860px) { .lobby-grid { grid-template-columns: 1fr; } }
        .room-item { 
          display: flex; justify-content: space-between; align-items: center;
          background: var(--input-bg); padding: 1rem 1.2rem; border-radius: 14px;
          border: 1px solid var(--glass-border); transition: border-color 0.2s;
        }
        .room-item:hover { border-color: var(--primary); }
        .disabled-btn { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div className="glass-panel" style={{ maxWidth: '1050px', width: '100%', position: 'relative' }}>
        <button
          onClick={() => navigate('/home')}
          style={{ position: 'absolute', top: '2rem', left: '2rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ArrowLeft size={20} />
        </button>

        <h2 className="title text-gradient" style={{ fontSize: '2.5rem', textAlign: 'center', marginTop: '1rem' }}>Multiplayer Lobby</h2>
        <p className="subtitle" style={{ textAlign: 'center', marginBottom: '2rem' }}>Play with up to 8 friends!</p>

        {error && (
          <div style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: '1.5rem', background: 'rgba(239,68,68,0.1)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        <div className="lobby-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="input-group">
              <label><User size={16} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />Your Name</label>
              <input
                type="text"
                placeholder="Enter your nickname"
                className="input-field"
                value={playerName}
                onChange={(e) => { setPlayerName(e.target.value); setError(''); }}
                disabled={loading || !!session}
              />
              {session && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>Nama otomatis dari akun kamu.</p>}
            </div>

            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '1.5rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Join with code</p>
              <form onSubmit={handleJoin} style={{ display: 'flex', gap: '0.75rem' }}>
                <input
                  type="text"
                  placeholder="e.g. PUB-123"
                  className="input-field"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  style={{ flex: 1 }}
                  disabled={loading}
                />
                <button type="submit" className={`btn btn-primary ${loading ? 'disabled-btn' : ''}`} style={{ width: 'auto', padding: '0 1.5rem', flexShrink: 0 }} disabled={loading}>
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
                </button>
              </form>
            </div>

            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Create new room</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button className={`btn btn-primary ${loading ? 'disabled-btn' : ''}`} onClick={() => createRoom('public')} disabled={loading}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Globe size={20} />} Create Public Room
                </button>
                <button className={`btn btn-secondary ${loading ? 'disabled-btn' : ''}`} onClick={() => createRoom('private')} disabled={loading}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={20} />} Create Private Room
                </button>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--input-bg)', borderRadius: '20px', padding: '1.5rem', border: '1px solid var(--glass-border)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>
              Active Public Rooms
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
              {publicRooms.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.95rem' }}>
                  No public rooms yet.
                </div>
              ) : publicRooms.map(r => (
                <div key={r.code} className="room-item">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: '700', marginBottom: '0.2rem' }}>{r.code}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Host: {r.host} &bull; {r.players}/8 players
                    </div>
                  </div>
                  {r.status !== 'playing' && (
                    <button
                      className={`btn btn-primary ${loading ? 'disabled-btn' : ''}`}
                      style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem', marginLeft: '0.5rem' }}
                      onClick={() => handleJoin(null, r.code)}
                      disabled={loading}
                    >
                      Join
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
