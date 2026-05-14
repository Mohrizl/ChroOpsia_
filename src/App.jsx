import { Routes, Route, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import GlobalControls from './components/GlobalControls';
import FriendsSidebar from './components/FriendsSidebar';
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

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [session, setSession] = useState(null);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const audioRef = useRef(null);

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

  return (
    <ThemeProvider>
      <div className="bg-wrapper">
        <div className="bg-gradient" />
        <div className="bg-grid" />
      </div>

      <GlobalControls 
        isPlaying={isPlaying} 
        toggleMusic={toggleMusic} 
        session={session} 
        openFriendsSidebar={() => setIsFriendsOpen(true)} 
        isFriendsOpen={isFriendsOpen}
        closeFriendsSidebar={() => setIsFriendsOpen(false)}
      />
      <FriendsSidebar session={session} isOpen={isFriendsOpen} onClose={() => setIsFriendsOpen(false)} />

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
