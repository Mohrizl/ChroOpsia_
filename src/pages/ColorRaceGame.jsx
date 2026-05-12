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
    return { players: sorted, room: rData };
  }, [roomCode, navigate, location.state]);

  useEffect(() => {
    if (roomCode) {
      supabase.from('rooms').select('*').eq('code', roomCode).single().then(({ data }) => {
        if (data) {
          setTimePerQuestion(data.time_limit || 20);
          setTimeLeft(data.time_limit || 20);
          setSetupMode(false);
          generateColors(1);
        }
      });
    }
  }, [roomCode, generateColors]);

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
    if (!isHost || !roomCode || setupMode) return;
    const botInterval = setInterval(async () => {
      const { players, room } = await fetchGameState();
      if (room.status === 'finished') {
        clearInterval(botInterval);
        return;
      }
      const humans = players.filter(p => !p.is_bot);
      const bots = players.filter(p => p.is_bot && !p.finished);

      if (bots.length > 0) {
        const botUpdates = bots.map(async (bot) => {
          if (Math.random() < 0.6) {
            const newQ = bot.current_question + (Math.random() > 0.7 ? 2 : 1);
            const botScoreAdd = Math.floor(400 * (Math.random() * 0.5 + 0.5));
            const newScore = bot.score + botScoreAdd;
            return supabase.from('players').update({
              current_question: newQ,
              score: newScore,
              finished: newQ > totalQuestions
            }).eq('id', bot.id);
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
      setTimeout(() => setIsProcessing(false), 200);
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
    if (isProcessing || showAnswer) return;
    if (color === targetColor) {
      setIsProcessing(true);
      const pts = Math.max(50, Math.floor(400 * (timeLeft / timePerQuestion)));
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
    if (setupMode || waitingForOthers || showAnswer) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 0) { 
            if (!isProcessing) { 
                setIsProcessing(true); 
                setShowAnswer(true);
                setTimeout(() => {
                    nextQuestion();
                }, 2000);
            } 
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
        <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', textAlign: 'center', padding: '2rem' }}>
          <h2 className="title text-gradient" style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>Game Setup</h2>
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.8rem' }}>Seconds per question:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
              {[10, 20, 30, 40, 50, 60].map(t => (
                <button key={t} className={`btn ${timePerQuestion === t ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.5rem' }} onClick={() => setTimePerQuestion(t)}>{t}s</button>
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
        <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', textAlign: 'center', padding: '2rem' }}>
          <h2 className="title text-gradient">Finished!</h2>
          <div className="loader" style={{ margin: '1.5rem auto', width: '40px', height: '40px' }}></div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'left' }}>
            <h4 style={{ marginBottom: '0.8rem', fontSize: '0.9rem' }}>Standings:</h4>
            {allPlayers.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem', color: p.finished ? 'var(--success)' : 'white' }}>
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
    <div className="container" style={{ padding: '0.5rem' }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: roomCode ? '1fr 300px' : '1fr', 
        gap: '1rem', 
        width: '100%', 
        maxWidth: '1200px',
        margin: '0 auto',
        alignItems: 'stretch'
      }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1.5rem', borderRadius: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Hash size={16} /> <span style={{ fontWeight: 'bold' }}>{currentQuestion} / {totalQuestions}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: timeLeft <= 5 ? 'var(--danger)' : 'white' }}><Timer size={16} /> <span style={{ fontWeight: 'bold' }}>{timeLeft}s</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Star size={16} /> <span style={{ fontWeight: 'bold' }}>{score}</span></div>
          </div>

          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
             <p style={{ fontSize: '1.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                <Target size={20} color="var(--primary)" /> Find the color:
             </p>
             <div style={{ width: '80px', height: '80px', background: targetColor, borderRadius: '50%', border: '4px solid white', boxShadow: '0 0 20px rgba(255,255,255,0.2)' }} />
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${getLevelConfig(currentQuestion).gridSize}, 1fr)`, 
            gap: '10px', marginBottom: '0.5rem', margin: '0 auto', 
            width: '100%', maxWidth: '420px', aspectRatio: '1/1' 
          }}>
            {options.map((color, i) => (
              <button 
                key={i} 
                className="color-box" 
                style={{ 
                    background: color, 
                    borderRadius: '14px', 
                    border: (showAnswer && color === targetColor) ? '4px solid var(--success)' : 'none', 
                    cursor: (isProcessing || showAnswer) ? 'default' : 'pointer', 
                    transition: 'all 0.1s',
                    boxShadow: (showAnswer && color === targetColor) ? '0 0 15px var(--success)' : 'none'
                }} 
                onClick={() => handleGuess(color)} 
              />
            ))}
          </div>
        </div>

        {roomCode && (
          <div className="glass-panel" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: '1.2rem', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={20} /> Live Ranks</h3>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {allPlayers.map((p, idx) => (
                <div key={p.id} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '0.8rem 1rem', 
                  background: p.name === playerName ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.05)', 
                  borderRadius: '12px', 
                  fontSize: '1rem',
                  border: p.name === playerName ? '1px solid var(--primary)' : '1px solid transparent',
                  alignItems: 'center',
                  minHeight: '50px'
                }}>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <span style={{ width: '20px', fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{idx + 1}</span>
                    <span style={{ fontWeight: p.name === playerName ? 'bold' : 'normal' }}>{p.name} {p.finished && <CheckCircle2 size={14} style={{ display: 'inline', color: 'var(--success)', marginLeft: '4px' }} />}</span>
                  </div>
                  <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{p.score}</span>
                </div>
              ))}
              <div style={{ flex: 1 }}></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}