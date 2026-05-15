import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users, Crown, CheckCircle, UserMinus, ArrowLeft, Loader2, Send, MessageCircle, Palette, Eye, UserPlus, X, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { searchProfiles } from '../lib/profileSync';
import { broadcastInviteToUser } from '../lib/invites';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import InviteToast from '../components/InviteToast';
import {
  setCurrentRoomCode,
  isUserInRoom,
  getRoomMemberAuthIds,
  enrichUsersWithGameStatus,
} from '../lib/roomJoin';

export default function WaitingRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerName: passedPlayerName, gameType: initialGameType } = location.state || {};
  const playerName = passedPlayerName || localStorage.getItem('guestName') || 'Player';
  
  const [players, setPlayers] = useState([]);
  const [room, setRoom] = useState(null);
  
  const isHost = room ? room.host_name === playerName : (location.state?.isHost || false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlinePlayers, setOnlinePlayers] = useState({});
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [authSession, setAuthSession] = useState(null);
  const globalOnlineUsers = useOnlineUsers(showInviteModal);
  const [inviteToast, setInviteToast] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [roomMemberIds, setRoomMemberIds] = useState(new Set());
  const chatEndRef = useRef(null);
  const channelRef = useRef(null);

  const fetchRoomData = useCallback(async () => {
    if (!roomCode) {
      setError("Room code is missing. Please join through the lobby.");
      return;
    }
    try {
      const { data: roomData, error: roomError } = await supabase.from('rooms').select('*').eq('code', roomCode).single();
      if (roomError) {
        console.error('Room fetch error:', roomError);
        setError("Room not found. It may have been deleted or expired.");
        return;
      }
      setRoom(roomData);
      const { data: playersData, error: playersError } = await supabase.from('players').select('*').eq('room_code', roomCode);
      if (playersError) {
        console.error('Players fetch error:', playersError);
        return;
      }
      setPlayers(playersData || []);
      return { room: roomData, players: playersData || [] };
    } catch (err) {
      console.error('Error fetching room data:', err);
      setError("An unexpected error occurred while connecting to the room.");
    }
  }, [roomCode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthSession(session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setAuthSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!inviteToast) return;
    const t = setTimeout(() => setInviteToast(null), 3200);
    return () => clearTimeout(t);
  }, [inviteToast]);

  useEffect(() => {
    if (!roomCode) return;
    setCurrentRoomCode(roomCode);
    return () => {
      if (sessionStorage.getItem('chro_current_room') === roomCode) {
        setCurrentRoomCode(null);
      }
    };
  }, [roomCode]);

  useEffect(() => {
    if (!showInviteModal || !roomCode) return;
    getRoomMemberAuthIds(roomCode).then(setRoomMemberIds);
  }, [showInviteModal, roomCode, players]);

  useEffect(() => {
    if (!roomCode) return;
    fetchRoomData();

    const channel = supabase.channel(`chat-${roomCode}`, {
      config: { 
        presence: { key: playerName },
        broadcast: { self: false } 
      }
    });

    channelRef.current = channel;

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` }, (payload) => {
        const newRoom = payload.new;
        setRoom(newRoom);
        if (newRoom.status === 'playing') {
          navigate(`/game/${newRoom.game_type}`, { state: { ...location.state, gameType: newRoom.game_type } });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${roomCode}` }, (payload) => {
        fetchRoomData();
        if (payload.eventType === 'DELETE' && payload.old.name === playerName) {
          alert("You have been kicked.");
          navigate('/lobby');
        }
      })
      .on('broadcast', { event: 'chat' }, (payload) => {
        if (payload.payload && payload.payload.sender !== playerName) {
          setMessages(prev => {
            const exists = prev.some(m => m.id === payload.payload.id);
            if (exists) return prev;
            return [...prev, payload.payload];
          });
        }
      })
      .on('presence', { event: 'sync' }, async () => {
        const state = channel.presenceState();
        const online = {};
        const onlineKeys = Object.keys(state);
        onlineKeys.forEach(key => { online[key] = true; });
        setOnlinePlayers(online);

        const { data: latestRoom } = await supabase.from('rooms').select('host_name').eq('code', roomCode).single();
        if (latestRoom && !online[latestRoom.host_name]) {
          const { data: currentPlayers } = await supabase.from('players').select('*').eq('room_code', roomCode).order('id', { ascending: true });
          const humans = (currentPlayers || []).filter(p => !p.is_bot && online[p.name]);
          if (humans.length > 0 && humans[0].name === playerName) {
            console.log("Promoting self to host due to current host absence...");
            const { error } = await supabase.from('rooms').update({ host_name: playerName }).eq('code', roomCode);
            if (!error) fetchRoomData();
          }
        }
      })
      .on('presence', { event: 'join' }, () => fetchRoomData())
      .on('presence', { event: 'leave' }, () => fetchRoomData())
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime active');
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomCode, navigate, location.state, playerName, fetchRoomData]);

  // Real-time search logic
  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      setSearchError(null);
      try {
        const { data, error } = await searchProfiles(searchQuery, authSession?.user?.id);
        if (error) {
          console.error('Search error:', error);
          const msg = error.message || '';
          setSearchError(
            msg.includes('profiles') || error.code === '42P01'
              ? 'Tabel profiles belum ada di Supabase. Jalankan supabase/setup_profiles_and_invites.sql'
              : msg
          );
          setSearchResults([]);
        } else {
          const filtered = data.filter((u) => !roomMemberIds.has(u.id));
          const enriched = await enrichUsersWithGameStatus(filtered);
          setSearchResults(enriched);
        }
      } catch (err) {
        console.error('Search error:', err);
        setSearchError('Gagal mencari pengguna.');
      } finally {
        setSearchLoading(false);
      }
    };

    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, authSession?.user?.id, roomMemberIds]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendChatMessage = (e) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !channelRef.current) return;
    
    const msg = { 
      sender: playerName, 
      text: newMessage.trim(), 
      timestamp: new Date().toISOString(),
      id: Date.now() + Math.random() 
    };
    
    channelRef.current.send({
      type: 'broadcast',
      event: 'chat',
      payload: msg
    });
    
    setMessages(prev => [...prev, msg]);
    setNewMessage('');
  };

  const handleLeaveRoom = async () => {
    if (authSession?.user?.id) {
      await supabase.from('players').delete().eq('room_code', roomCode).eq('id', authSession.user.id);
    } else {
      await supabase.from('players').delete().eq('room_code', roomCode).eq('name', playerName);
    }
    setCurrentRoomCode(null);
    const { data: remainingPlayers } = await supabase.from('players').select('is_bot').eq('room_code', roomCode);
    const humans = (remainingPlayers || []).filter(p => !p.is_bot);
    
    if (humans.length === 0) { 
      if ((remainingPlayers || []).length > 0) {
        await supabase.from('rooms').delete().eq('code', roomCode);
      }
    } else if (isHost) {
      const nextHost = humans[0];
      if (nextHost) { await supabase.from('rooms').update({ host_name: nextHost.name }).eq('code', roomCode); }
    }
    navigate('/lobby', { replace: true });
  };

  const handleAddBot = async () => {
    const difficulties = ['Skilled', 'Fast', 'Random', 'Expert'];
    const diff = difficulties[Math.floor(Math.random() * difficulties.length)];
    const botName = `Bot_${diff}_${Math.floor(Math.random() * 100)}`;
    await supabase.from('players').insert([{ room_code: roomCode, name: botName, is_bot: true, difficulty: diff, ready: true, score: 0, current_question: 1 }]);
  };

  const handleKick = async (targetName) => {
    setPlayers(prev => prev.filter(p => p.name !== targetName));
    await supabase.from('players').delete().eq('room_code', roomCode).eq('name', targetName);
  };

  const toggleReady = async () => {
    const me = players.find(p => p.name === playerName);
    if (me) { await supabase.from('players').update({ ready: !me.ready }).eq('id', me.id); }
  };

  const handleStartGame = async () => {
    const othersReady = players.filter(p => p.name !== playerName && !p.is_bot).every(p => p.ready);
    if (!othersReady) { alert("Semua pemain harus Ready!"); return; }
    const selectedGameType = room.game_type || initialGameType || 'color-race';
    await supabase.from('players').update({ 
      score: 0, current_question: 1, finished: false, ready: true, correct_count: 0, wrong_count: 0
    }).eq('room_code', roomCode);
    await supabase.from('rooms').update({ status: 'playing', game_type: selectedGameType }).eq('code', roomCode);
    navigate(`/game/${selectedGameType}`, { state: { ...location.state, gameType: selectedGameType, numQuestions: room.num_questions || 14 } });
  };

  const handleInvite = async (targetUser) => {
    if (!roomCode) {
      setInviteToast({ type: 'error', message: 'Room code tidak tersedia.' });
      return;
    }
    if (!authSession?.user?.id) {
      setInviteToast({ type: 'error', message: 'Login dulu untuk mengirim undangan (bukan guest).' });
      return;
    }

    if (targetUser.inGame) {
      setInviteToast({ type: 'error', message: `${targetUser.name} sedang bermain.` });
      return;
    }

    const isOnline = globalOnlineUsers[targetUser.id];
    if (!isOnline) {
      setInviteToast({ type: 'error', message: `${targetUser.name} sedang offline.` });
      return;
    }

    if (roomMemberIds.has(targetUser.id) || (await isUserInRoom(targetUser.id, roomCode))) {
      setInviteToast({ type: 'error', message: `${targetUser.name} sudah ada di room ini.` });
      return;
    }

    const { error } = await supabase.from('invites').insert({
      from_id: authSession.user.id,
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
      from_id: authSession.user.id,
    });

    setInviteToast({ type: 'success', message: `Undangan terkirim ke ${targetUser.name}.` });
  };

  if (error) return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div className="glass-panel" style={{ textAlign: 'center', maxWidth: '400px' }}>
        <h3 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>Oops!</h3>
        <p style={{ marginBottom: '1.5rem' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/lobby')}>Back to Lobby</button>
      </div>
    </div>
  );

  if (!roomCode || !room) return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div className="glass-panel" style={{ textAlign: 'center' }}>
        <Loader2 className="animate-spin" size={40} style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
        <p>Connecting to Room {roomCode}...</p>
      </div>
    </div>
  );

  const me = players.find(p => p.name === playerName);

  return (
    <div className="container" style={{ padding: '1rem' }}>
      <style>{`
        .waiting-grid { 
          display: grid; 
          grid-template-columns: 1.2fr 0.8fr; 
          gap: 1rem; 
          width: 100%; 
          max-width: 900px; 
          margin: 0 auto;
          align-items: stretch; 
        }
        .waiting-panel { 
          position: relative; 
          padding: 2rem; 
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .chat-panel { 
          background: var(--panel-bg); 
          backdrop-filter: blur(20px); 
          border: 1px solid var(--glass-border); 
          border-radius: 24px; 
          height: 100%; 
          min-height: 500px;
          display: flex; 
          flex-direction: column; 
          overflow: hidden; 
        }
        .online-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
        @media (max-width: 1000px) { .waiting-grid { grid-template-columns: 1fr; } .chat-panel { height: 400px; } }
        @media (max-width: 768px) { .waiting-panel { padding: 4rem 1.2rem 2rem; } .waiting-title { font-size: 2rem !important; } .back-btn-wr { top: 1rem !important; left: 1rem !important; } }
      `}</style>

      <InviteToast toast={inviteToast} />

      <div className="waiting-grid">
        <div className="glass-panel waiting-panel">
          <button onClick={handleLeaveRoom} className="btn-secondary back-btn-wr" style={{ position: 'absolute', top: '2rem', left: '2rem', width: 'auto', padding: '0.6rem', borderRadius: '12px', zIndex: 10 }} title="Leave Room">
            <ArrowLeft size={20} />
          </button>

          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 className="title text-gradient waiting-title" style={{ fontSize: '2.8rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>Room Lobby</h2>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
              <Users size={20} /> <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Code: {roomCode}</span>
            </div>
            <p style={{ marginTop: '0.5rem', color: 'var(--primary)', fontWeight: '600' }}>{players.length} / 8 Players</p>
          </div>

          <div style={{ background: 'var(--input-bg)', borderRadius: '24px', padding: '1.5rem', marginBottom: '2rem', border: '1px solid var(--glass-border)' }}>
            {isHost && (
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1.2rem', borderBottom: '1px solid var(--glass-border)' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: '0.8rem', fontSize: '0.9rem', fontWeight: '500' }}>Game Mode:</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className={`btn ${room.game_type === 'color-race' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: '0.6rem', fontSize: '0.85rem' }} onClick={async () => await supabase.from('rooms').update({ game_type: 'color-race' }).eq('code', roomCode)}>
                    <Palette size={16} /> Color Race
                  </button>
                  <button className={`btn ${room.game_type === 'ishihara' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, padding: '0.6rem', fontSize: '0.85rem' }} onClick={async () => await supabase.from('rooms').update({ game_type: 'ishihara' }).eq('code', roomCode)}>
                    <Eye size={16} /> Ishihara
                  </button>
                </div>
              </div>
            )}
            {isHost && (
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1.2rem', borderBottom: '1px solid var(--glass-border)' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: '0.8rem', fontSize: '0.9rem', fontWeight: '500' }}>Game Duration:</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {[5, 10, 15, 20, 25, 30].map(t => (
                    <button key={t} className={`btn ${room.time_limit === t ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', width: 'auto' }} onClick={async () => { await supabase.from('rooms').update({ time_limit: t }).eq('code', roomCode); }}>{t}s</button>
                  ))}
                </div>
              </div>
            )}
            {isHost && room?.game_type === 'ishihara' && (
              <div style={{ marginBottom: '1.5rem', paddingBottom: '1.2rem', borderBottom: '1px solid var(--glass-border)' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: '0.8rem', fontSize: '0.9rem', fontWeight: '500' }}>Number of Questions:</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {[14, 28].map(num => (
                    <button key={num} className={`btn ${room.num_questions === num ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', width: 'auto' }} onClick={async () => { await supabase.from('rooms').update({ num_questions: num }).eq('code', roomCode); }}>{num}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {players.sort((a, b) => (a.name === room.host_name ? -1 : b.name === room.host_name ? 1 : 0)).map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1rem', background: p.name === playerName ? 'rgba(99, 102, 241, 0.1)' : 'transparent', borderRadius: '12px', border: p.name === playerName ? '1px solid var(--primary)' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 0 }}>
                    {p.name === room.host_name && <Crown size={18} color="#fbbf24" style={{ flexShrink: 0 }} />}
                    <span style={{ fontWeight: p.name === playerName ? '800' : '500', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.95rem', display: 'flex', alignItems: 'center' }}>
                      {!p.is_bot && <span className="online-dot" style={{ background: onlinePlayers[p.name] ? 'var(--success)' : '#94a3b8' }}></span>}
                      {p.name} {p.name === playerName && '(You)'} {p.is_bot && '[Bot]'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexShrink: 0 }}>
                    {(p.name === room.host_name) || p.is_bot || p.ready ? <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: '700' }}><CheckCircle size={16}/> Ready</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '500' }}>Waiting...</span>}
                    {isHost && p.name !== playerName && (
                      <button onClick={() => handleKick(p.name)} className="kick-btn" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', padding: '0.4rem', borderRadius: '10px' }} title="Kick Player"><UserMinus size={18} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {isHost && players.length < 8 && (
                <button className="btn btn-secondary" style={{ flex: 1, minWidth: '140px', maxWidth: '200px' }} onClick={handleAddBot}>
                  + Add Bot
                </button>
              )}
              {localStorage.getItem('isGuest') !== 'true' && (
                <button className="btn btn-secondary" style={{ flex: 1, minWidth: '140px', maxWidth: '200px' }} onClick={() => setShowInviteModal(true)}>
                  <UserPlus size={18} /> Invite Friend
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {!isHost && (
                <button className={`btn ${me?.ready ? 'btn-secondary' : 'btn-primary'}`} style={{ width: '100%', maxWidth: '416px' }} onClick={toggleReady}>
                  {me?.ready ? 'Cancel Ready' : 'I am Ready'}
                </button>
              )}
              {isHost && (
                <button 
                  className="btn" 
                  style={{ 
                    width: '100%', maxWidth: '416px', 
                    background: players.length < 2 || !players.every(p => p.ready) ? '#94a3b8' : 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)', 
                    color: 'white', 
                    cursor: players.length < 2 || !players.every(p => p.ready) ? 'not-allowed' : 'pointer', 
                    boxShadow: players.length < 2 || !players.every(p => p.ready) ? 'none' : '0 8px 20px rgba(99, 102, 241, 0.3)', 
                    transform: 'none' 
                  }} 
                  disabled={players.length < 2 || !players.every(p => p.ready)} 
                  onClick={handleStartGame}
                >
                  {players.length < 2 ? 'Need 2 or more' : (!players.every(p => p.ready) ? 'Other player not ready' : 'Start Game')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="chat-panel" style={{ height: '550px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '1.2rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{ background: 'var(--primary-glow)', padding: '0.5rem', borderRadius: '12px' }}>
              <MessageCircle size={20} color="var(--primary)" />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>Room Chat</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--text-muted)' }}>
                <MessageCircle size={40} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.85rem' }}>No messages yet. Say hi!</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.sender === playerName ? 'flex-end' : 'flex-start', maxWidth: '85%', display: 'flex', flexDirection: 'column', alignItems: msg.sender === playerName ? 'flex-end' : 'flex-start' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px', marginLeft: '4px', marginRight: '4px', fontWeight: '600' }}>{msg.sender}</span>
                <div style={{ 
                  background: msg.sender === playerName ? 'var(--primary)' : 'var(--input-bg)', 
                  color: msg.sender === playerName ? 'white' : 'var(--text-main)', 
                  padding: '0.7rem 1rem', 
                  borderRadius: '18px', 
                  borderTopRightRadius: msg.sender === playerName ? '4px' : '18px', 
                  borderTopLeftRadius: msg.sender === playerName ? '18px' : '4px', 
                  fontSize: '0.92rem', 
                  wordBreak: 'break-word',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: msg.sender === playerName ? 'none' : '1px solid var(--glass-border)',
                  lineHeight: '1.4'
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendChatMessage} style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '0.6rem', background: 'var(--panel-bg)' }}>
            <input 
              type="text" 
              placeholder="Type a message..." 
              className="input-field" 
              style={{ padding: '0.7rem 1.2rem', fontSize: '0.9rem', borderRadius: '12px' }} 
              value={newMessage} 
              onChange={(e) => setNewMessage(e.target.value)} 
            />
            <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0.7rem', borderRadius: '12px' }}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>

      {showInviteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '400px', padding: '1.5rem', background: 'var(--bg-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><UserPlus size={20} color="var(--primary)" /> Invite Friends</h3>
              <button onClick={() => { setShowInviteModal(false); setSearchQuery(''); setSearchResults([]); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
              <input 
                type="text" 
                placeholder="Search email or name..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field"
                style={{ paddingLeft: '2.8rem', fontSize: '0.9rem' }}
              />
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '300px', overflowY: 'auto' }}>
              {searchLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <Loader2 className="animate-spin" size={30} color="var(--primary)" style={{ margin: '0 auto' }} />
                </div>
              ) : searchQuery.length < 2 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>Type at least 2 characters to search.</p>
              ) : searchError ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--danger)', textAlign: 'center', padding: '1rem' }}>{searchError}</p>
              ) : searchResults.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>Tidak ada akun ditemukan. Pastikan tabel profiles sudah dibuat dan user sudah login minimal sekali.</p>
              ) : (
                searchResults.map((targetUser) => {
                  const displayName = targetUser.name;
                  const initial = displayName.charAt(0).toUpperCase();
                  const isOnline = Boolean(globalOnlineUsers[targetUser.id]);
                  const inGame = Boolean(targetUser.inGame);
                  const canInvite = isOnline && !inGame;
                  const statusLabel = inGame ? 'Sedang Bermain' : isOnline ? 'Online' : 'Offline';
                  const statusColor = inGame ? '#f59e0b' : isOnline ? 'var(--success)' : 'var(--text-muted)';

                  return (
                    <div key={targetUser.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ position: 'relative' }}>
                          <div style={{ width: '35px', height: '35px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                            {initial}
                          </div>
                          <span style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', background: inGame ? '#f59e0b' : isOnline ? 'var(--success)' : '#94a3b8', border: '2px solid var(--bg-color)' }}></span>
                        </div>
                        <div>
                          <p style={{ fontSize: '0.9rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>{displayName}</p>
                          <p style={{ fontSize: '0.75rem', color: statusColor, fontWeight: inGame || isOnline ? 700 : 500 }}>{statusLabel}</p>
                        </div>
                      </div>
                      <button 
                        type="button"
                        className="btn btn-primary" 
                        style={{ 
                          padding: '0.4rem 0.8rem', 
                          width: 'auto', 
                          fontSize: '0.8rem',
                          opacity: canInvite ? 1 : 0.55,
                          cursor: canInvite ? 'pointer' : 'not-allowed',
                          background: canInvite ? undefined : '#94a3b8',
                          boxShadow: canInvite ? undefined : 'none',
                        }} 
                        disabled={!canInvite}
                        title={
                          inGame
                            ? 'Pemain sedang bermain'
                            : canInvite
                              ? 'Kirim undangan'
                              : 'Pemain offline — tidak bisa diundang'
                        }
                        onClick={() => canInvite && handleInvite(targetUser)}
                      >
                        Invite
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
