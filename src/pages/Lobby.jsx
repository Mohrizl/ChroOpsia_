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

  const fetchRooms = async () => {
    try {
      const { data: roomsData, error: roomsError } = await supabase
        .from('rooms')
        .select('*, players(*)')
        .eq('type', 'public')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false });

      if (roomsError) throw roomsError;

      // Filter: Hanya tampilkan room yang punya minimal 1 manusia
      const validRooms = (roomsData || []).filter(r => 
        r.players && r.players.some(p => !p.is_bot)
      );

      const formatted = validRooms.map(r => ({
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

    // Subscribe to room changes
    const channel = supabase
      .channel('lobby-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchRooms();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        fetchRooms();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const generateRoomCode = (type) => {
    const prefix = type === 'public' ? 'PUB-' : 'PRV-';
    return `${prefix}${Math.floor(100 + Math.random() * 900)}`;
  };

  const handleJoin = async (e, targetCode = null) => {
    if (e) e.preventDefault();
    const codeToJoin = (targetCode || roomCode).trim().toUpperCase();

    if (!playerName.trim()) {
      setError('Please enter your name first');
      return;
    }
    if (!codeToJoin) {
      setError('Please enter a room code');
      return;
    }

    try {
      // 1. Check if room exists
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', codeToJoin)
        .single();

      if (roomError || !room) {
        setError('Room tidak ditemukan');
        return;
      }

      if (room.status !== 'waiting') {
        setError('Game sedang berlangsung');
        return;
      }

      // 2. Check player count
      const { count, error: countError } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('room_code', codeToJoin);

      if (countError) throw countError;
      if (count >= 8) {
        setError('Room sudah penuh');
        return;
      }

      // 3. Join room
      const { error: joinError } = await supabase
        .from('players')
        .insert([{ 
          room_code: codeToJoin, 
          name: playerName.trim(),
          ready: false,
          score: 0,
          current_question: 1,
          finished: false
        }]);

      if (joinError) {
        if (joinError.code === '23505') {
          setError('Nama sudah digunakan dalam room');
        } else {
          throw joinError;
        }
        return;
      }

      navigate('/waiting-room', { 
        state: { 
          roomCode: codeToJoin, 
          playerName: playerName.trim(), 
          isHost: false 
        } 
      });
    } catch (err) {
      console.error('Join error:', err);
      setError('Gagal masuk ke room');
    }
  };

  const createRoom = async (type) => {
    if (!playerName.trim()) {
      setError('Please enter your name first');
      return;
    }

    const code = generateRoomCode(type);

    try {
      // 1. Create room
      const { error: roomError } = await supabase
        .from('rooms')
        .insert([{ 
          code, 
          type, 
          host_name: playerName.trim(),
          status: 'waiting',
          game_type: 'color-race'
        }]);

      if (roomError) throw roomError;

      // 2. Join as host
      const { error: joinError } = await supabase
        .from('players')
        .insert([{ 
          room_code: code, 
          name: playerName.trim(),
          ready: true, // Host is auto ready
          score: 0,
          current_question: 1,
          finished: false
        }]);

      if (joinError) throw joinError;

      navigate('/select-mode', { 
        state: { 
          type, 
          roomCode: code, 
          playerName: playerName.trim(), 
          isHost: true 
        } 
      });
    } catch (err) {
      console.error('Create error:', err);
      setError('Gagal membuat room');
    }
  };

  const handleCreatePublic = () => createRoom('public');
  const handleCreatePrivate = () => createRoom('private');

  return (
    <div className="container">
      <style>{`
        .lobby-grid { display: grid; grid-template-columns: 1fr 360px; gap: 2rem; align-items: start; }
        .lobby-panel { width: 100%; }
        .public-room-list { max-height: calc(100vh - 300px); overflow-y: auto; }
        .lobby-right { border: 1px solid rgba(255,255,255,0.08); }
        @media (max-width: 860px) {
          .lobby-grid { grid-template-columns: 1fr; }
          .public-room-list { max-height: none; }
        }
      `}</style>
      <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%', position: 'relative', padding: '2rem' }}>
        <button
          onClick={() => navigate('/')}
          style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          title="Back to Home"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="title text-gradient" style={{ fontSize: '2.5rem', textAlign: 'center', marginTop: '1rem' }}>Multiplayer Lobby</h2>
        <p className="subtitle" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Play with up to 8 friends!</p>
        {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: '1rem', fontWeight: 'bold' }}>{error}</p>}

        <div className="lobby-grid">
          <div className="lobby-panel" style={{ maxWidth: '560px' }}>
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                <User size={18} /> Your Name
              </label>
              <input
                type="text"
                placeholder="Enter your nickname"
                className="input-field"
                value={playerName}
                onChange={(e) => { setPlayerName(e.target.value); setError(''); }}
              />
            </div>

            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              <input
                type="text"
                placeholder="Enter Room Code to Join"
                className="input-field"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              />
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                Join Private Room <ArrowRight size={20} />
              </button>
            </form>

            <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>OR CREATE NEW ROOM</div>
              <button className="btn btn-secondary" onClick={handleCreatePublic} style={{ width: '100%' }}>
                <Globe size={20} /> Create Public Room
              </button>
              <button className="btn btn-secondary" onClick={handleCreatePrivate} style={{ width: '100%' }}>
                <Lock size={20} /> Create Private Room
              </button>
            </div>
          </div>

          <div className="lobby-panel lobby-right" style={{ maxWidth: '360px', background: 'rgba(0,0,0,0.1)', borderRadius: '20px', padding: '1.5rem' }}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '1.5rem', letterSpacing: '0.1em' }}>ACTIVE PUBLIC ROOMS</div>
            <div className="public-room-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {publicRooms.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.95rem' }}>No public rooms available yet.</div>
              )}
              {publicRooms.map(r => (
                <div key={r.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.9rem 1rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: '700' }}>{r.code}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Host: {r.host} ({r.players}/8)</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontStyle: 'italic' }}>{r.status === 'playing' ? 'In Game' : 'Waiting...'}</span>
                  </div>
                  {r.status !== 'playing' && (
                    <button className="btn btn-primary" style={{ padding: '0.55rem 1rem', fontSize: '0.9rem' }} onClick={() => handleJoin(null, r.code)}>
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
