import { Routes, Route } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import GameModeSelect from './pages/GameModeSelect';
import ColorRaceGame from './pages/ColorRaceGame';
import IshiharaGame from './pages/IshiharaGame';
import Score from './pages/Score';
import WaitingRoom from './pages/WaitingRoom';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  // Example placeholder music. To change the song, just replace this URL
  // or put a file in the public folder and use '/song.mp3'
  const musicUrl = "https://cdn.pixabay.com/download/audio/2022/05/16/audio_db6591201e.mp3?filename=lofi-study-112191.mp3";

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
    <>
      <div className="glow-effect" />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/select-mode" element={<GameModeSelect />} />
        <Route path="/waiting-room" element={<WaitingRoom />} />
        <Route path="/game/color-race" element={<ColorRaceGame />} />
        <Route path="/game/ishihara" element={<IshiharaGame />} />
        <Route path="/score" element={<Score />} />
      </Routes>

      <button className="music-toggle" onClick={toggleMusic} title="Toggle Background Music">
        {isPlaying ? <Volume2 size={24} /> : <VolumeX size={24} />}
      </button>
    </>
  );
}

export default App;
