import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timer, Star, Hash, Users, CheckCircle2, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';

const getLevelConfig = (q) => {
  if (q <= 3) return { gridSize: 2, diff: 60 };
  if (q <= 7) return { gridSize: 3, diff: 40 };
  if (q <= 11) return { gridSize: 4, diff: 25 };
  return { gridSize: 5, diff: 15 };
};

const totalQuestions = 14;

export default function ColorRaceGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerName, isHost } = location.state || {};
  
  const [setupMode, setSetupMode] = useState(!roomCode);
  const [timePerQuestion, setTimePerQuestion] = useState(20);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [timeLeft, setTimeLeft] = useState(0);
  const [targetColor, setTargetColor] = useState('rgb(100, 100, 100)');
  const [options, setOptions] = useState([]);
  const [waitingForOthers, setWaitingForOthers] = useState(false);
  const [allPlayers, setAllPlayers] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

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
    setShowAnswer(false);
  }, []);

  const fetchGameState = useCallback(async () => {
    const { data: pData } = await supabase.from('players').select('*').eq('room_code', roomCode);
    const sorted = (pData || []).sort((a, b) => b.score - a.score);
    setAllPlayers(sorted);
    const { data: rData } = await supabase.from('rooms').select('*').eq('code', roomCode).single();
    if (rData?.status === 'finished') {
      navigate('/score', { state: { ...location.state, score: scoreRef.current, mode: 'Color Race', correctCount: correctRef.current, allPlayers: sorted } });
    }
    return { players: sorted, room: rData };
  }, [roomCode, navigate, location.state]);

  useEffect(() => {
    if (roomCode) {
      supabase.from('rooms').select('*').eq('code', roomCode).single().then(({ data }) => {
        if (data) {
          setTimePerQuestion(data.time_limit || 20);
          setTimeLeft(data.time_limit || 20);
          if (!isHost) setSetupMode(false);
          generateColors(1);
        }
      });
    }
  }, [roomCode, isHost, generateColors]);

  useEffect(() => {
    if (!roomCode) return;
    fetchGameState();
    const channel = supabase.channel(`game-cr-${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${roomCode}` }, () => { fetchGameState(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` }, (payload) => { if (payload.new.status === 'finished') fetchGameState(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomCode, fetchGameState]);

  useEffect(() => {
    if (!isHost || !roomCode || setupMode) return;
    const botInterval = setInterval(async () => {
      const { players, room } = await fetchGameState();
      if (room.status === 'finished') { clearInterval(botInterval); return; }
      const humans = players.filter(p => !p.is_bot);
      const bots = players.filter(p => p.is_bot && !p.finished);
      if (bots.length > 0) {
        const botUpdates = bots.map(async (bot) => {
          if (Math.random() < 0.6) {
            const newQ = bot.current_question + (Math.random() > 0.7 ? 2 : 1);
            const botScoreAdd = Math.floor(400 * (Math.random() * 0.5 + 0.5));
            const newScore = bot.score + botScoreAdd;
            return supabase.from('players').update({ current_question: newQ, score: newScore, finished: newQ > totalQuestions }).eq('id', bot.id);
          }
          return null;
        });
        await Promise.all(botUpdates.filter(u => u !== null));
      }
      if (humans.length > 0 && humans.every(h => h.finished)) {
        await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode);
        clearInterval(botInterval);
      }
    }, 2000);
    return () => clearInterval(botInterval);
  }, [isHost, roomCode, setupMode, fetchGameState]);

  const startGame = () => {
    setSetupMode(false); setScore(0); setCorrectCount(0); setCurrentQuestion(1); setTimeLeft(timePerQuestion); generateColors(1);
  };

  const nextQuestion = () => {
    if (currentQuestion >= totalQuestions) { handleFinishGame(score, correctCount); }
    else {
      const nq = currentQuestion + 1; setCurrentQuestion(nq); setTimeLeft(timePerQuestion); generateColors(nq);
      setTimeout(() => setIsProcessing(false), 200);
    }
  };

  const handleFinishGame = async (fs, fcc) => {
    if (roomCode) {
      setWaitingForOthers(true);
      await supabase.from('players').update({ finished: true, score: fs, correct_count: fcc }).eq('room_code', roomCode).eq('name', playerName);
    } else {
      navigate('/score', { state: { score: fs, mode: 'Color Race', correctCount: fcc, ...location.state } });
    }
  };

  const handleGuess = (color) => {
    if (isProcessing || showAnswer) return;
    if (color === targetColor) {
      setIsProcessing(true);
      const pts = Math.max(50, Math.floor(400 * (timeLeft / timePerQuestion)));
      const ns = score + pts; const ncc = correctCount + 1;
      setScore(ns); setCorrectCount(ncc);
      if (roomCode) { supabase.from('players').update({ score: ns, current_question: currentQuestion + 1, correct_count: ncc, finished: currentQuestion >= totalQuestions }).eq('room_code', roomCode).eq('name', playerName).then(); }
      nextQuestion();
    } else { setTimeLeft(t => Math.max(0, t - 3)); }
  };

  useEffect(() => {
    if (setupMode || waitingForOthers || showAnswer) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 0) { 
          if (!isProcessing) { setIsProcessing(true); setShowAnswer(true); setTimeout(() => nextQuestion(), 2000); }
          return 0; 
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [setupMode, waitingForOthers, currentQuestion, timePerQuestion, isProcessing, showAnswer]);

  if (setupMode) {
    return (
      <div className="container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', textAlign: 'center', padding: '1.5rem' }}>
          <h2 className="title text-gradient" style={{ fontSize: '1.8rem', marginBottom: '1.2rem' }}>Game Setup</h2>
          <div style={{ marginBottom: '1.2rem' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.6rem', fontSize: '0.9rem' }}>Seconds per question:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
              {[10, 20, 30, 40, 50, 60].map(t => (
                <button key={t} className={`btn ${timePerQuestion === t ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.4rem', fontSize: '0.85rem' }} onClick={() => setTimePerQuestion(t)}>{t}s</button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={startGame}>Start Game</button>
        </div>
      </div>
    );
  }

  if (waitingForOthers) {
    return (
      <div className="container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', textAlign: 'center', padding: '1.5rem' }}>
          <h2 className="title text-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Finished!</h2>
          <p style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem' }}>Waiting for other players...</p>
          <div className="loader" style={{ margin: '0 auto 1.5rem auto', width: '30px', height: '30px' }}></div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'left' }}>
            {allPlayers.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem', color: p.finished ? 'var(--success)' : 'white' }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>{p.name} {p.name === playerName && '(You)'}</span>
                <span style={{ fontWeight: 'bold' }}>{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '0.3rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%', maxWidth: '850px', margin: '0 auto' }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '0.8rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.4rem 1.2rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem' }}><Hash size={14} /> <span>{currentQuestion}/{totalQuestions}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: timeLeft <= 5 ? 'var(--danger)' : 'white', fontSize: '0.9rem' }}><Timer size={14} /> <span>{timeLeft}s</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem' }}><Star size={14} /> <span>{score}</span></div>
          </div>
          <div style={{ marginBottom: '0.8rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
             <p style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'white' }}><Target size={14} color="var(--primary)" /> Find the color:</p>
             <div style={{ width: '50px', height: '50px', background: targetColor, borderRadius: '50%', border: '3px solid white' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${getLevelConfig(currentQuestion).gridSize}, 1fr)`, gap: '6px', margin: '0 auto', width: '100%', maxWidth: '320px', aspectRatio: '1/1' }}>
            {options.map((color, i) => (
              <button key={i} className="color-box" style={{ background: color, borderRadius: '10px', border: (showAnswer && color === targetColor) ? '3px solid var(--success)' : 'none', cursor: (isProcessing || showAnswer) ? 'default' : 'pointer' }} onClick={() => handleGuess(color)} />
            ))}
          </div>
        </div>
        {roomCode && (
          <div className="glass-panel" style={{ padding: '0.8rem' }}>
            <h3 style={{ marginBottom: '0.6rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Users size={16} /> Live Ranks</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
              {allPlayers.map((p, idx) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.8rem', background: p.name === playerName ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '10px', border: p.name === playerName ? '1px solid var(--primary)' : '1px solid transparent', alignItems: 'center', minHeight: '40px' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold' }}>{idx + 1}</span>
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'white' }}>{p.name}</span>
                  </div>
                  <span style={{ fontWeight: '900', color: 'var(--primary)', fontSize: '0.9rem', marginLeft: '0.4rem' }}>{p.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}