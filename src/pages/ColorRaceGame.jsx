import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timer, Star, Hash, Users, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const getLevelConfig = (q) => {
  if (q <= 3) return { gridSize: 2, diff: 60 };
  if (q <= 7) return { gridSize: 3, diff: 40 };
  if (q <= 11) return { gridSize: 4, diff: 25 };
  return { gridSize: 5, diff: 15 };
};

const totalQuestions = 14;
const timePerQuestion = 30;

export default function ColorRaceGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerName, isHost } = location.state || {};
  
  const [setupMode, setSetupMode] = useState(true);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [timeLeft, setTimeLeft] = useState(0);
  const [targetColor, setTargetColor] = useState('rgb(100, 100, 100)');
  const [options, setOptions] = useState([]);
  const [correctIndex, setCorrectIndex] = useState(-1);
  const [waitingForOthers, setWaitingForOthers] = useState(false);
  const [allPlayers, setAllPlayers] = useState([]);

  const scoreRef = useRef(0);
  const correctRef = useRef(0);

  useEffect(() => {
    scoreRef.current = score;
    correctRef.current = correctCount;
  }, [score, correctCount]);

  const generateColors = useCallback((qNum) => {
    const config = getLevelConfig(qNum);
    const total = config.gridSize * config.gridSize;
    const r = Math.floor(Math.random() * 200) + 20;
    const g = Math.floor(Math.random() * 200) + 20;
    const b = Math.floor(Math.random() * 200) + 20;
    const target = `rgb(${r}, ${g}, ${b})`;
    setTargetColor(target);

    const opts = [target];
    for (let i = 1; i < total; i++) {
      const dr = Math.min(255, Math.max(0, r + (Math.random() * config.diff * (Math.random() > 0.5 ? 1 : -1))));
      const dg = Math.min(255, Math.max(0, g + (Math.random() * config.diff * (Math.random() > 0.5 ? 1 : -1))));
      const db = Math.min(255, Math.max(0, b + (Math.random() * config.diff * (Math.random() > 0.5 ? 1 : -1))));
      opts.push(`rgb(${Math.floor(dr)}, ${Math.floor(dg)}, ${Math.floor(db)})`);
    }

    const shuffled = [...opts].sort(() => Math.random() - 0.5);
    setOptions(shuffled);
    setCorrectIndex(shuffled.indexOf(target));
  }, []);

  const fetchGameState = useCallback(async () => {
    const { data: pData } = await supabase.from('players').select('*').eq('room_code', roomCode);
    const sorted = (pData || []).sort((a, b) => b.score - a.score);
    setAllPlayers(sorted);

    const { data: rData } = await supabase.from('rooms').select('*').eq('code', roomCode).single();
    if (rData?.status === 'finished') {
      navigate('/score', { 
        state: { 
          ...location.state,
          score: scoreRef.current, 
          mode: 'Color Race', 
          correctCount: correctRef.current,
          allPlayers: sorted, 
        } 
      });
    }
  }, [roomCode, navigate, location.state]);

  useEffect(() => {
    if (!roomCode) return;
    fetchGameState();
    const channel = supabase.channel(`game-cr-${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${roomCode}` }, () => {
        fetchGameState();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` }, (payload) => {
        if (payload.new.status === 'finished') fetchGameState();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomCode, fetchGameState]);

  useEffect(() => {
    if (!isHost || !roomCode || setupMode || waitingForOthers) return;
    const botInterval = setInterval(async () => {
      const { data: pData } = await supabase.from('players').select('*').eq('room_code', roomCode);
      const humans = pData.filter(p => !p.is_bot);
      const bots = pData.filter(p => p.is_bot && !p.finished);

      const botUpdates = bots.map(async (bot) => {
        if (Math.random() < 0.75) {
          const newQ = bot.current_question + (Math.random() > 0.5 ? 2 : 1);
          const newScore = bot.score + Math.floor(Math.random() * 300 + 400);
          return supabase.from('players').update({
            current_question: newQ,
            score: newScore,
            finished: newQ > 14
          }).eq('id', bot.id);
        }
        return null;
      });

      await Promise.all(botUpdates.filter(u => u !== null));

      if (humans.every(h => h.finished)) {
        await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode);
        clearInterval(botInterval);
      }
    }, 2000);
    return () => clearInterval(botInterval);
  }, [isHost, roomCode, setupMode, waitingForOthers]);

  const startGame = () => {
    setSetupMode(false);
    setScore(0);
    setCorrectCount(0);
    setCurrentQuestion(1);
    setTimeLeft(timePerQuestion);
    generateColors(1);
  };

  const nextQuestion = () => {
    if (currentQuestion >= totalQuestions) {
      handleFinishGame(score, correctCount);
    } else {
      const nq = currentQuestion + 1;
      setCurrentQuestion(nq);
      setTimeLeft(timePerQuestion);
      generateColors(nq);
    }
  };

  const handleFinishGame = async (fs, fcc) => {
    if (roomCode) {
      setWaitingForOthers(true);
      await supabase.from('players').update({
        finished: true,
        score: fs,
        correct_count: fcc
      }).eq('room_code', roomCode).eq('name', playerName);
    } else {
      navigate('/score', { state: { score: fs, mode: 'Color Race', correctCount: fcc, ...location.state } });
    }
  };

  const handleGuess = (color) => {
    if (color === targetColor) {
      const pts = Math.max(100, Math.floor(800 * (timeLeft / timePerQuestion)));
      const ns = score + pts;
      const ncc = correctCount + 1;
      setScore(ns);
      setCorrectCount(ncc);
      if (roomCode) {
        supabase.from('players').update({
          score: ns,
          current_question: currentQuestion + 1,
          correct_count: ncc,
          finished: currentQuestion >= totalQuestions
        }).eq('room_code', roomCode).eq('name', playerName).then();
      }
      nextQuestion();
    } else {
      setTimeLeft(t => Math.max(0, t - 3));
    }
  };

  useEffect(() => {
    if (setupMode || waitingForOthers) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { nextQuestion(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [setupMode, waitingForOthers, currentQuestion]);

  if (setupMode) {
    return (
      <div className="container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
          <h2 className="title text-gradient" style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>Game Setup</h2>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={startGame}>Start Game</button>
        </div>
      </div>
    );
  }

  if (waitingForOthers) {
    return (
      <div className="container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
          <h2 className="title text-gradient">Finished!</h2>
          <p className="subtitle">Waiting for others...</p>
          <div className="loader" style={{ margin: '2rem auto' }}></div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'left' }}>
            <h4 style={{ marginBottom: '1rem' }}>Standings:</h4>
            {allPlayers.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: p.finished ? 'var(--success)' : 'white' }}>
                <span>{p.name} {p.name === playerName && '(You)'}</span>
                <span>{p.score} [{p.finished ? 'Done' : 'Playing'}]</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: 'grid', gridTemplateColumns: roomCode ? '1fr 300px' : '1fr', gap: '2rem', width: '100%', maxWidth: '1200px' }}>
        <div className="glass-panel" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
            <div className="stat-badge"><Hash size={18} /> {currentQuestion} / {totalQuestions}</div>
            <div className="stat-badge" style={{ color: timeLeft <= 5 ? 'var(--danger)' : 'white' }}><Timer size={18} /> {timeLeft}s</div>
            <div className="stat-badge"><Star size={18} /> {score}</div>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${getLevelConfig(currentQuestion).gridSize}, 1fr)`, 
            gap: '12px', marginBottom: '2rem', margin: '0 auto 2rem', 
            width: '100%', maxWidth: '500px', aspectRatio: '1/1' 
          }}>
            {options.map((color, i) => (
              <button key={i} className="color-box" style={{ background: color, borderRadius: '12px', border: 'none', cursor: 'pointer', transition: 'transform 0.1s' }} onClick={() => handleGuess(color)} />
            ))}
          </div>
        </div>

        {roomCode && (
          <div className="glass-panel">
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={20} /> Live Ranks</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {allPlayers.map((p, idx) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem', background: p.name === playerName ? 'rgba(99, 102, 241, 0.2)' : 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ width: '20px', fontWeight: 'bold' }}>{idx + 1}</span>
                    <span>{p.name} {p.finished && <CheckCircle2 size={14} style={{ display: 'inline', color: 'var(--success)' }} />}</span>
                  </div>
                  <span style={{ fontWeight: 'bold' }}>{p.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}