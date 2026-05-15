import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

const getLevelConfig = (q) => {
  if (q <= 3) return { gridSize: 2, diff: 60 };
  if (q <= 7) return { gridSize: 3, diff: 40 };
  if (q <= 11) return { gridSize: 4, diff: 25 };
  return { gridSize: 5, diff: 15 };
};

const totalQuestions = 14;

function ScoreCounter({ targetScore }) {
  const [displayScore, setDisplayScore] = useState(targetScore);
  useEffect(() => {
    let start = displayScore;
    const end = targetScore;
    if (start === end) return;
    const range = end - start;
    const duration = 800;
    const startTime = performance.now();
    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.floor(start + range * easeProgress);
      setDisplayScore(nextValue);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [targetScore]);
  return <span>{displayScore}</span>;
}

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
  const [scorePopups, setScorePopups] = useState([]);
  const answerTimeoutRef = useRef(null);

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
      setTimeout(() => {
        navigate('/score', { state: { ...location.state, score: scoreRef.current, mode: 'Color Race', correctCount: correctRef.current, allPlayers: sorted } });
      }, 500);
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
      if (!room || room.status !== 'playing') {
        if (room?.status === 'finished') clearInterval(botInterval);
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
            return supabase.from('players').update({ current_question: newQ, score: newScore, finished: newQ > totalQuestions }).eq('id', bot.id);
          }
          return null;
        });
        await Promise.all(botUpdates.filter(u => u !== null));
      }
      const activeHumans = humans.length;
      if (activeHumans > 0 && humans.every(h => h.finished)) {
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
    scoreRef.current = 0;
    correctRef.current = 0;

    setCurrentQuestion(1);
    setTimeLeft(timePerQuestion);
    generateColors(1);
  };

  const nextQuestion = () => {
    setShowAnswer(false);
    setIsProcessing(false);
    if (currentQuestion >= totalQuestions) {
      handleFinishGame(score, correctCount);
      return;
    }
    const nq = currentQuestion + 1;
    setCurrentQuestion(nq);
    setTimeLeft(timePerQuestion);
    generateColors(nq);
  };

  const handleFinishGame = async (fs, fcc) => {
    if (roomCode) {
      setWaitingForOthers(true);
      await supabase.from('players').update({ finished: true, score: fs, correct_count: fcc }).eq('room_code', roomCode).eq('name', playerName);
    } else {
      navigate('/score', {
        state: {
          ...location.state,
          score: fs,
          mode: 'Color Race',
          correctCount: fcc,
          numQuestions: totalQuestions
        }
      });
    }
  };



  const handleGuess = (color) => {
    if (isProcessing || showAnswer) return;
    if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
    if (color === targetColor) {
      setIsProcessing(true);
      setShowAnswer(true);
      const pts = Math.max(50, Math.floor(400 * (timeLeft / timePerQuestion)));
      const ns = score + pts; const ncc = correctCount + 1;
      setScore(ns); setCorrectCount(ncc);
      setScorePopups(prev => [...prev, { id: Date.now(), val: pts }]);
      setTimeout(() => setScorePopups(prev => prev.slice(1)), 1000);

      answerTimeoutRef.current = setTimeout(() => {
        if (roomCode) { supabase.from('players').update({ score: ns, current_question: currentQuestion + 1, correct_count: ncc, finished: currentQuestion >= totalQuestions }).eq('room_code', roomCode).eq('name', playerName).then(); }
        nextQuestion();
      }, 1500);
    } else { setTimeLeft(t => Math.max(0, t - 3)); }
  };

  useEffect(() => {
    if (setupMode || waitingForOthers || showAnswer || isProcessing) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 0) {
          if (!isProcessing) { setIsProcessing(true); setShowAnswer(true); answerTimeoutRef.current = setTimeout(() => nextQuestion(), 800); }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [setupMode, waitingForOthers, currentQuestion, timePerQuestion, isProcessing, showAnswer]);

  useEffect(() => {
    return () => {
      if (answerTimeoutRef.current) clearTimeout(answerTimeoutRef.current);
    };
  }, []);

  if (setupMode) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', textAlign: 'center', padding: '1.5rem' }}>
          <h2 className="title text-gradient" style={{ fontSize: '1.8rem', marginBottom: '1.2rem' }}>Game Setup</h2>
          <div style={{ marginBottom: '1.2rem' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.6rem', fontSize: '0.9rem' }}>Seconds per question:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
              {[5, 10, 15, 20, 25, 30].map(t => (
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
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', paddingTop: '2rem', paddingBottom: '2rem' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', textAlign: 'center', padding: '1.5rem' }}>
          <h2 className="title text-gradient" style={{ fontSize: '2.4rem', marginBottom: '0.2rem' }}>Finished!</h2>
          <p style={{ color: 'var(--primary)', fontSize: '1rem', fontWeight: '600', marginBottom: '1.5rem', opacity: 0.9 }}>Waiting for everyone to cross the finish line...</p>
          <div className="loader" style={{ margin: '0 auto 2rem auto', width: '30px', height: '30px' }}></div>
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
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '1rem', paddingBottom: '1rem', minHeight: '100vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%', maxWidth: '850px', margin: '0 auto' }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '0.8rem', display: 'flex', flexDirection: 'column', position: 'relative', margin: '0 auto', width: '100%', maxWidth: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ padding: '0.9rem 1rem', borderRadius: '18px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', minWidth: '120px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Question</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{currentQuestion}/{totalQuestions}</div>
            </div>
            <div style={{ padding: '0.9rem 1rem', borderRadius: '18px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', minWidth: '120px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Time</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: timeLeft <= 5 ? 'var(--danger)' : 'var(--text-main)' }}>{timeLeft}s</div>
            </div>
            <div style={{ padding: '0.9rem 1.2rem', borderRadius: '18px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', minWidth: '130px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Score</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--text-main)', position: 'relative', width: '100%', textAlign: 'center' }}>
                <ScoreCounter targetScore={score} />
                {scorePopups.map(popup => (
                  <div key={popup.id} className="score-popup" style={{ left: 0, right: 0, top: '-20px' }}>
                    +{popup.val}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: '0.8rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
            <p style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>Guess the correct color</p>
            <div style={{ width: '54px', height: '54px', background: targetColor, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.9)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${getLevelConfig(currentQuestion).gridSize}, 1fr)`, gap: '6px', margin: '0 auto', width: '100%', maxWidth: '320px', aspectRatio: '1/1' }}>
            {options.map((color, i) => (
              <button
                key={i}
                className="color-box"
                style={{
                  background: color, borderRadius: '10px',
                  border: (showAnswer && color === targetColor) ? '3px solid var(--success)' : 'none',
                  cursor: (isProcessing || showAnswer) ? 'default' : 'pointer',
                  boxShadow: (showAnswer && color === targetColor) ? '0 0 10px var(--success)' : 'none',
                  opacity: isProcessing && color !== targetColor ? 0.5 : 1
                }}
                disabled={isProcessing}
                onClick={() => handleGuess(color)}
              />
            ))}
          </div>
        </div>
        {roomCode && (
          <div className="glass-panel" style={{ padding: '0.8rem', margin: '0 auto', width: '100%', maxWidth: 'none' }}>
            <h3 style={{ marginBottom: '0.6rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Users size={16} /> Live Ranks</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
              {allPlayers.map((p, idx) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.8rem', background: p.name === (playerName || 'You') ? 'var(--input-bg)' : 'var(--panel-bg)', borderRadius: '10px', border: p.name === (playerName || 'You') ? '1px solid var(--primary)' : '1px solid transparent', alignItems: 'center', minHeight: '40px' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold' }}>{idx + 1}</span>
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-main)' }}>{p.name}</span>
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