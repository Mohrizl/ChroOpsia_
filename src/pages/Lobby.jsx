import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Globe, ArrowRight, User, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Lobby() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);

  // Auto-fill player name from auth or guest session
  useEffect(() => {
    const guestName = localStorage.getItem('guestName');
    if (guestName) {
      setPlayerName(guestName);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        const name = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
        setPlayerName(name);
      }
    });
  }, []);

  const fetchRooms = async () => {
    try {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: allRooms } = await supabase.from('rooms').select('*, players(*)');

      if (allRooms) {
        for (const r of allRooms) {
          const hasHumans = r.players && r.players.some(p => !p.is_bot);
          const createdAt = new Date(r.created_at).getTime();
          const isOld = Date.now() - createdAt > 5 * 60 * 1000;
          const isSlightlyOld = Date.now() - createdAt > 30 * 1000;

          // Delete if it has no humans and is more than 30 seconds old
          if (!hasHumans && isSlightlyOld) {
            await supabase.from('rooms').delete().eq('id', r.id);
          } else if (isOld && r.status === 'waiting') {
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
          code: r.code, host: r.host_name, players: r.players.length, maxPlayers: 8, status: r.status
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

  const generateRoomCode = (type) => {
    const prefix = type === 'public' ? 'PUB-' : 'PRV-';
    return `${prefix}${Math.floor(100 + Math.random() * 900)}`;
  };

  const handleJoin = async (e, targetCode = null) => {
    if (e) e.preventDefault();
    const codeToJoin = (targetCode || roomCode).trim().toUpperCase();
    if (!playerName.trim()) { setError('Please enter your name first'); return; }
    if (!codeToJoin) { setError('Please enter a room code'); return; }

    try {
      const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('code', codeToJoin).single();
      if (roomError || !room) { setError('Room not found'); return; }
      if (room.status !== 'waiting') { setError('Game already in progress'); return; }

      const { count } = await supabase.from('players').select('*', { count: 'exact', head: true }).eq('room_code', codeToJoin);
      if (count >= 8) { setError('Room is full'); return; }

      const { error: joinError } = await supabase.from('players').insert([{
        room_code: codeToJoin, name: playerName.trim(), ready: false, score: 0, current_question: 1, finished: false
      }]);

      if (joinError) {
        if (joinError.code === '23505') setError('Name already taken in this room');
        else throw joinError;
        return;
      }
      navigate('/waiting-room', { state: { roomCode: codeToJoin, playerName: playerName.trim(), isHost: false } });
    } catch (err) { setError('Failed to join room'); }
  };

  const createRoom = async (type) => {
    if (!playerName.trim()) { setError('Please enter your name first'); return; }
    const code = generateRoomCode(type);
    try {
      await supabase.from('rooms').insert([{ code, type, host_name: playerName.trim(), status: 'waiting', game_type: 'color-race', time_limit: 20, num_questions: 14 }]);
      await supabase.from('players').insert([{ room_code: code, name: playerName.trim(), ready: true, score: 0, current_question: 1, finished: false }]);
      navigate('/select-mode', { state: { type, roomCode: code, playerName: playerName.trim(), isHost: true } });
    } catch (err) { setError('Failed to create room'); }
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
          {/* Left panel – join / create */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="input-group">
              <label><User size={16} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />Your Name</label>
              <input
                type="text"
                placeholder="Enter your nickname"
                className="input-field"
                value={playerName}
                onChange={(e) => { setPlayerName(e.target.value); setError(''); }}
              />
            </div>

            <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '1.5rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Join with code</p>
              <form onSubmit={handleJoin} style={{ display: 'flex', gap: '0.75rem' }}>
                <input
                  type="text"
                  placeholder="e.g. PRV-123"
                  className="input-field"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0 1.5rem', flexShrink: 0 }}>
                  <ArrowRight size={20} />
                </button>
              </form>
            </div>

            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Create new room</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button className="btn btn-primary" onClick={() => createRoom('public')}>
                  <Globe size={20} /> Create Public Room
                </button>
                <button className="btn btn-secondary" onClick={() => createRoom('private')}>
                  <Lock size={20} /> Create Private Room
                </button>
              </div>
            </div>
          </div>

          {/* Right panel – public rooms list */}
          <div style={{ background: 'var(--input-bg)', borderRadius: '20px', padding: '1.5rem', border: '1px solid var(--glass-border)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>
              Active Public Rooms
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
              {publicRooms.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.95rem' }}>
                  No public rooms yet.<br />Be the first to create one!
                </div>
              ) : publicRooms.map(r => (
                <div key={r.code} className="room-item">
                  <div>
                    <div style={{ fontWeight: '700', marginBottom: '0.2rem' }}>{r.code}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Host: {r.host} &bull; {r.players}/8 players
                    </div>
                  </div>
                  {r.status !== 'playing' && (
                    <button
                      className="btn btn-primary"
                      style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                      onClick={() => handleJoin(null, r.code)}
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
