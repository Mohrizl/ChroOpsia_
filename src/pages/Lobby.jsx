import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Globe, ArrowRight, User, ArrowLeft } from 'lucide-react';
import { socket, connectSocket } from '../socket';

export default function Lobby() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);

  useEffect(() => {
    connectSocket();

    socket.emit('requestRoomList');

    const handleRoomList = (rooms) => {
      setPublicRooms(rooms);
    };

    socket.on('roomList', handleRoomList);

    return () => {
      socket.off('roomList', handleRoomList);
    };
  }, []);

  const handleJoin = (e, targetCode = null) => {
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

    socket.emit('joinRoom', { roomCode: codeToJoin, playerName: playerName.trim() }, (response) => {
      if (response.success) {
        navigate('/waiting-room', { 
          state: { 
            roomCode: codeToJoin, 
            playerName: playerName.trim(), 
            isHost: false,
            room: response.room
          } 
        });
      } else {
        setError(response.message || 'Failed to join room');
      }
    });
  };

  const createRoomWithCode = (type) => {
    if (!playerName.trim()) {
      setError('Please enter your name first');
      return;
    }

    socket.emit('createRoom', { type, playerName: playerName.trim(), gameType: 'color-race' }, (response) => {
      if (response.success) {
        navigate('/select-mode', { 
          state: { 
            type, 
            roomCode: response.room.code, 
            playerName: playerName.trim(), 
            isHost: true,
            room: response.room
          } 
        });
      } else {
        setError('Failed to create room');
      }
    });
  };

  const handleCreatePublic = () => createRoomWithCode('public');
  const handleCreatePrivate = () => createRoomWithCode('private');

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
