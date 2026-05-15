import { Routes, Route, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import GlobalControls from './components/GlobalControls';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import GameModeSelect from './pages/GameModeSelect';
import ColorRaceGame from './pages/ColorRaceGame';
import IshiharaGame from './pages/IshiharaGame';
import Score from './pages/Score';
import WaitingRoom from './pages/WaitingRoom';
import { supabase } from './lib/supabase';
import { ensureUserProfile } from './lib/profileSync';
import { startGlobalPresence, stopGlobalPresence } from './lib/presence';
import { subscribeToIncomingInvites } from './lib/invites';
import { joinRoomAsPlayer, isUserInRoom, getCurrentRoomCode, isUserInGame } from './lib/roomJoin';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [session, setSession] = useState(null);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [inviteJoinError, setInviteJoinError] = useState(null);
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const audioRef = useRef(null);
  const lastInviteKeyRef = useRef(null);
  const navigate = useNavigate();

  const dismissInvite = useCallback(async () => {
    if (incomingInvite?.inviteId) {
      await supabase.from('invites').update({ status: 'rejected' }).eq('id', incomingInvite.inviteId);
    }
    setIncomingInvite(null);
    setInviteJoinError(null);
  }, [incomingInvite]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    ensureUserProfile(session);
  }, [session]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const cleanup = subscribeToIncomingInvites(session.user.id, async (invite) => {
      // PENTING: Cek status apakah user BENAR-BENAR sedang bermain game aktif
      if (await isUserInGame(session.user.id)) {
        console.log("Auto-rejecting invite: User is in active 'playing' state.");
        if (invite.inviteId) {
          await supabase.from('invites').update({ status: 'rejected' }).eq('id', invite.inviteId);
        }
        return;
      }

      const currentRoom = getCurrentRoomCode();
      if (currentRoom === invite.roomCode) return;
      if (await isUserInRoom(session.user.id, invite.roomCode)) return;

      const key = `${invite.inviteId || ''}:${invite.roomCode}:${invite.fromId}`;
      if (lastInviteKeyRef.current === key) return;
      lastInviteKeyRef.current = key;

      setInviteJoinError(null);
      setIncomingInvite(invite);

      setTimeout(() => {
        if (lastInviteKeyRef.current === key) lastInviteKeyRef.current = null;
      }, 8000);
    });

    return cleanup;
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    startGlobalPresence(session.user.id);
    return () => stopGlobalPresence();
  }, [session?.user?.id]);

  const musicUrl = "/backsound.mp3";

  useEffect(() => {
    audioRef.current = new Audio(musicUrl);
    audioRef.current.loop = true;
    audioRef.current.volume = 0.3;

    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const toggleMusic = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.log("Audio play failed", e));
    }
    setIsPlaying(!isPlaying);
  };

  const acceptIncomingInvite = async () => {
    if (!incomingInvite?.roomCode || !session?.user || acceptingInvite) return;
    setAcceptingInvite(true);
    setInviteJoinError(null);

    const result = await joinRoomAsPlayer(session, incomingInvite.roomCode);
    if (!result.ok) {
      setInviteJoinError(result.error?.message || 'Gagal masuk ke room.');
      setAcceptingInvite(false);
      return;
    }

    navigate('/waiting-room', {
      state: {
        roomCode: incomingInvite.roomCode,
        playerName: result.playerName,
        isHost: false,
      },
    });
    setIncomingInvite(null);
    setAcceptingInvite(false);
  };

  return (
    <ThemeProvider>
      <div className="bg-wrapper">
        <div className="bg-gradient" />
        <div className="bg-grid" />
      </div>

      {incomingInvite && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-dialog-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '1.75rem',
              borderRadius: '20px',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
            }}
          >
            <h2
              id="invite-dialog-title"
              style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-main)' }}
            >
              Undangan permainan
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
              {incomingInvite.senderName
                ? `${incomingInvite.senderName} mengundangmu ke ruang multiplayer.`
                : 'Kamu diundang bergabung ke ruang multiplayer.'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Room code:
            </p>
            <div
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--glass-border)',
                color: 'var(--primary)',
                textAlign: 'center',
                marginBottom: '1.5rem',
              }}
            >
              {incomingInvite.roomCode}
            </div>
            {inviteJoinError && (
              <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>{inviteJoinError}</p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, minWidth: '120px' }}
                disabled={acceptingInvite}
                onClick={acceptIncomingInvite}
              >
                {acceptingInvite ? 'Memproses…' : 'Terima & masuk ruang'}
              </button>
              <button type="button" className="btn btn-secondary" style={{ flex: 1, minWidth: '120px' }} onClick={dismissInvite}>
                Tolak
              </button>
            </div>
          </div>
        </div>
      )}

      <GlobalControls isPlaying={isPlaying} toggleMusic={toggleMusic} session={session} />

      <Routes>
        <Route path="/" element={<Login session={session} />} />
        <Route path="/signup" element={<SignUp />} />

        {session ? (
          <>
            <Route path="/home" element={<Home session={session} />} />
            <Route path="/lobby" element={<Lobby session={session} />} />
            <Route path="/select-mode" element={<GameModeSelect session={session} />} />
            <Route path="/waiting-room" element={<WaitingRoom session={session} />} />
            <Route path="/game/color-race" element={<ColorRaceGame session={session} />} />
            <Route path="/game/ishihara" element={<IshiharaGame session={session} />} />
            <Route path="/score" element={<Score session={session} />} />
          </>
        ) : (
          <Route path="*" element={<Login session={session} />} />
        )}
      </Routes>
    </ThemeProvider>
  );
}

export default App;