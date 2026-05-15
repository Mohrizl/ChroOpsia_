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

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [session, setSession] = useState(null);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const audioRef = useRef(null);
  const lastInviteKeyRef = useRef(null);
  const navigate = useNavigate();

  const dismissInvite = useCallback(() => setIncomingInvite(null), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    ensureUserProfile(session);
  }, [session]);

  useEffect(() => {
    if (!session?.user?.id) return;
    return subscribeToIncomingInvites(session.user.id, (invite) => {
      const key = `${invite.inviteId || ''}:${invite.roomCode}:${invite.fromId}`;
      if (lastInviteKeyRef.current === key) return;
      lastInviteKeyRef.current = key;
      setIncomingInvite(invite);
      setTimeout(() => {
        if (lastInviteKeyRef.current === key) lastInviteKeyRef.current = null;
      }, 8000);
    });
  }, [session?.user?.id]);

  // Presence key = session.user.id → sama dengan players.id / profiles.id / targetUser.id
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
      if (audioRef.current) {
        audioRef.current.pause();
      }
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

  const acceptIncomingInvite = () => {
    if (!incomingInvite?.roomCode || !session?.user) return;
    const displayName =
      session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Player';
    navigate('/waiting-room', {
      state: {
        roomCode: incomingInvite.roomCode,
        playerName: displayName,
        isHost: false,
      },
    });
    setIncomingInvite(null);
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
              style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                marginBottom: '0.5rem',
                color: 'var(--text-main)',
              }}
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
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1, minWidth: '120px' }} onClick={acceptIncomingInvite}>
                Terima & masuk ruang
              </button>
              <button type="button" className="btn btn-secondary" style={{ flex: 1, minWidth: '120px' }} onClick={dismissInvite}>
                Tolak
              </button>
            </div>
          </div>
        </div>
      )}

      <GlobalControls
        isPlaying={isPlaying}
        toggleMusic={toggleMusic}
        session={session}
      />

      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/home" element={<Home />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/select-mode" element={<GameModeSelect />} />
        <Route path="/waiting-room" element={<WaitingRoom />} />
        <Route path="/game/color-race" element={<ColorRaceGame />} />
        <Route path="/game/ishihara" element={<IshiharaGame />} />
        <Route path="/score" element={<Score />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
