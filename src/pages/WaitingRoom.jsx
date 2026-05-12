import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, Crown, CheckCircle, UserMinus, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function WaitingRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerName, isHost, gameType: initialGameType } = location.state || {};

  const [players, setPlayers] = useState([]);
  const [room, setRoom] = useState(null);
  const [showBotMenu, setShowBotMenu] = useState(false);

  const fetchRoomData = async () => {
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', roomCode)
      .single();
    setRoom(roomData);

    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('room_code', roomCode);
    setPlayers(playersData || []);
    return { room: roomData, players: playersData || [] };
  };

  useEffect(() => {
    if (!roomCode) return;

    fetchRoomData();

    // Subscribe to room and player changes
    const roomChannel = supabase
      .channel(`room-${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` }, (payload) => {
        setRoom(payload.new);
        if (payload.new.status === 'playing') {
          navigate(`/game/${payload.new.game_type}`, { 
            state: { ...location.state, gameType: payload.new.game_type } 
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${roomCode}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setPlayers(prev => prev.filter(p => p.id !== payload.old.id));
          if (payload.old.name === playerName) {
            alert("You have been kicked.");
            navigate('/lobby');
          }
        } else {
          fetchRoomData();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
    };
  }, [roomCode, navigate, location.state]);

  const handleLeaveRoom = async () => {
    await supabase.from('players').delete().eq('room_code', roomCode).eq('name', playerName);
    
    // If last person, delete room
    const humans = players.filter(p => !p.is_bot);
    if (humans.length <= 1) {
      await supabase.from('rooms').delete().eq('code', roomCode);
    } else if (isHost) {
      const nextHost = humans.find(p => p.name !== playerName);
      if (nextHost) {
        await supabase.from('rooms').update({ host_name: nextHost.name }).eq('code', roomCode);
      }
    }
    navigate('/lobby');
  };

  const handleAddBot = async () => {
    const difficulties = ['Skilled', 'Fast', 'Random', 'Expert'];
    const diff = difficulties[Math.floor(Math.random() * difficulties.length)];
    const botName = `Bot_${diff}_${Math.floor(Math.random() * 100)}`;
    
    await supabase.from('players').insert([{
      room_code: roomCode,
      name: botName,
      is_bot: true,
      difficulty: diff,
      ready: true,
      score: 0,
      current_question: 1
    }]);
    setShowBotMenu(false);
  };

  const handleKick = async (targetName) => {
    // Optimistic update: remove from local state immediately
    setPlayers(prev => prev.filter(p => p.name !== targetName));
    
    // Then call DB
    await supabase.from('players').delete().eq('room_code', roomCode).eq('name', targetName);
  };

  const toggleReady = async () => {
    const me = players.find(p => p.name === playerName);
    if (me) {
      await supabase.from('players').update({ ready: !me.ready }).eq('id', me.id);
    }
  };

  const handleStartGame = async () => {
    const othersReady = players.filter(p => p.name !== playerName && !p.is_bot).every(p => p.ready);
    if (!othersReady) {
      alert("Semua pemain harus Ready!");
      return;
    }

    const selectedGameType = initialGameType || 'color-race';
    await supabase.from('rooms').update({ 
      status: 'playing',
      game_type: selectedGameType 
    }).eq('code', roomCode);
  };

  if (!roomCode || !room) return <div className="container"><p>Invalid Room or Loading...</p></div>;

  const me = players.find(p => p.name === playerName);

  return (
    <div className="container">
      <div className="glow-effect" />
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
          <p style={{ marginTop: '0.5rem', color: 'var(--primary)' }}>{players.length} / 8 Players</p>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', marginBottom: '2rem' }}>
          {isHost && (
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '0.8rem', fontSize: '0.9rem' }}>Game Duration (Seconds per question):</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[10, 20, 30, 40, 50, 60].map(t => (
                  <button 
                    key={t} 
                    className={`btn ${room.time_limit === t ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', minWidth: '50px' }}
                    onClick={async () => {
                      await supabase.from('rooms').update({ time_limit: t }).eq('code', roomCode);
                    }}
                  >
                    {t}s
                  </button>
                ))}
              </div>
            </div>
          )}
          {players.sort((a, b) => (a.name === room.host_name ? -1 : b.name === room.host_name ? 1 : 0)).map((p, idx) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: idx < players.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                {p.name === room.host_name && <Crown size={18} color="#fbbf24" />}
                <span style={{ fontWeight: p.name === playerName ? '800' : '400', color: p.name === playerName ? 'white' : 'var(--text-muted)' }}>
                  {p.name} {p.name === playerName && '(You)'} {p.is_bot && '[Bot]'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {(p.name === room.host_name) || p.is_bot || p.ready ? 
                  <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem' }}><CheckCircle size={16}/> Ready</span> : 
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Not Ready</span>
                }
                {isHost && p.name !== playerName && (
                  <button 
                    onClick={() => handleKick(p.name)} 
                    className="kick-btn"
                    style={{ 
                      background: 'rgba(239, 68, 68, 0.1)', 
                      border: '1px solid rgba(239, 68, 68, 0.2)', 
                      color: '#ef4444', 
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                  >
                    <UserMinus size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
          {isHost && players.length < 8 && (
            <div style={{ marginBottom: '1rem' }}>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleAddBot}>+ Add Bot</button>
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
                disabled={players.length < 2 || !players.every(p => p.ready)}
                onClick={handleStartGame}
              >
                {players.length < 2 ? 'Need at least 2 Players' : 'Start Game'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
