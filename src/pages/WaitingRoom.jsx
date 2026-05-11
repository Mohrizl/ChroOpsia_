import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, Crown, CheckCircle, UserMinus, ArrowLeft } from 'lucide-react';
import { socket } from '../socket';

export default function WaitingRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerName, isHost, gameType: initialGameType } = location.state || {};

  const [room, setRoom] = useState(location.state?.room || { players: [], bots: [] });
  const [showBotMenu, setShowBotMenu] = useState(false);

  useEffect(() => {
    if (!roomCode) return;

    const handleRoomState = (newState) => {
      setRoom(newState);
    };

    const handleGameStarted = ({ gameType }) => {
      navigate(`/game/${gameType}`, { 
        state: { 
          ...location.state, 
          roomCode, 
          playerName, 
          isHost, 
          gameType 
        } 
      });
    };

    const handleKicked = (targetName) => {
      if (targetName === playerName) {
        alert('You have been kicked from the room');
        navigate('/lobby');
      }
    };

    socket.on('roomState', handleRoomState);
    socket.on('gameStarted', handleGameStarted);
    socket.on('playerKicked', handleKicked);

    socket.emit('requestRoomState', roomCode);

    return () => {
      socket.off('roomState', handleRoomState);
      socket.off('gameStarted', handleGameStarted);
      socket.off('playerKicked', handleKicked);
    };
  }, [roomCode, navigate, playerName, isHost, location.state]);

  const handleLeaveRoom = () => {
    socket.emit('leaveRoom', { roomCode, playerName });
    navigate('/lobby');
  };

  const handleAddBot = (difficulty) => {
    socket.emit('addBot', { roomCode, difficulty }, (response) => {
      if (response.success) {
        setShowBotMenu(false);
      } else {
        alert(response.message);
      }
    });
  };

    const handleKick = (targetName) => {
    socket.emit('kickPlayer', { roomCode, targetName });
  };

  const toggleReady = () => {
    const me = room.players.find(p => p.name === playerName);
    if (me) {
      socket.emit('toggleReady', { roomCode, playerName, ready: !me.ready });
    }
  };

  const handleStartGame = () => {
    const humans = room.players.filter(p => !p.isBot);
    const othersReady = humans.filter(p => !p.isHost).every(p => p.ready);
    
    if (!othersReady) {
      alert("Semua pemain harus Ready!");
      return;
    }

    const selectedGameType = initialGameType || 'color-race';
    socket.emit('startGame', { roomCode, gameType: selectedGameType });
  };

  if (!roomCode) return <div className="container"><p>Invalid Room</p></div>;

  const allPlayers = [...room.players, ...(room.bots || [])];
  const me = room.players.find(p => p.name === playerName);
  const othersReady = room.players.filter(p => !p.isHost && !p.isBot).every(p => p.ready);

  return (
    <div className="container">
      <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', position: 'relative' }}>
        <button 
          onClick={handleLeaveRoom}
          style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <ArrowLeft size={24} />
        </button>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 className="title text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', marginTop: '1rem' }}>Waiting Room</h2>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
            <Users size={20} /> <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Code: {roomCode}</span>
          </div>
          <p style={{ marginTop: '0.5rem', color: 'var(--primary)' }}>{allPlayers.length} / 8 Players</p>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', marginBottom: '2rem' }}>
          {allPlayers.map((p, idx) => (
            <div key={p.id || p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: idx < allPlayers.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                {p.isHost && <Crown size={18} color="#fbbf24" />}
                <span style={{ fontWeight: p.name === playerName ? '800' : '400', color: p.name === playerName ? 'white' : 'var(--text-muted)' }}>
                  {p.name} {p.name === playerName && '(You)'} {p.isBot && `[Bot ${p.difficulty}]`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {p.isHost || p.isBot || p.ready ? 
                  <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem' }}><CheckCircle size={16}/> Ready</span> : 
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Not Ready</span>
                }
                {isHost && p.name !== playerName && (
                  <button onClick={() => handleKick(p.name)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                    <UserMinus size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
          {isHost && allPlayers.length < 8 && (
            <div style={{ marginBottom: '1rem' }}>
              {!showBotMenu ? (
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setShowBotMenu(true)}>+ Add Bot</button>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} onClick={() => handleAddBot('Easy')}>Easy</button>
                  <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} onClick={() => handleAddBot('Medium')}>Medium</button>
                  <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', color: '#ef4444' }} onClick={() => handleAddBot('Hard')}>Hard</button>
                  <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setShowBotMenu(false)}>Cancel</button>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            {!isHost && (
              <button className={`btn ${me?.ready ? 'btn-secondary' : 'btn-primary'}`} style={{ flex: 1 }} onClick={toggleReady}>
                {me?.ready ? 'Cancel Ready' : 'I am Ready'}
              </button>
            )}
            {isHost && (
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }} 
                onClick={handleStartGame}
                disabled={!othersReady}
              >
                {!othersReady ? 'Waiting for others...' : 'Start Game'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
