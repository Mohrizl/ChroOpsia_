import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timer, Star, Hash, Users } from 'lucide-react';
import { socket } from '../socket';

const getLevelConfig = (questionNum) => {
  if (questionNum <= 2) return { gridSize: 2, diff: 50 };
  if (questionNum <= 4) return { gridSize: 3, diff: 35 };
  if (questionNum <= 7) return { gridSize: 4, diff: 20 };
  return { gridSize: 5, diff: 10 };
};

const totalQuestions = 14;

export default function ColorRaceGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const roomCode = location.state?.roomCode || '';
  const playerName = location.state?.playerName || 'You';
  
  const [setupMode, setSetupMode] = useState(true);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  
  const [timeLeft, setTimeLeft] = useState(0);
  const [targetColor, setTargetColor] = useState('rgb(100, 100, 100)');
  const [options, setOptions] = useState([]);
  const [showHint, setShowHint] = useState(false);
  const [correctIndex, setCorrectIndex] = useState(-1);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [waitingForOthers, setWaitingForOthers] = useState(false);
  const [allPlayers, setAllPlayers] = useState([]);

  const generateColors = useCallback((questionNum) => {
    const config = getLevelConfig(questionNum);
    const totalBoxes = config.gridSize * config.gridSize;
    
    const r = Math.floor(Math.random() * 200) + 20;
    const g = Math.floor(Math.random() * 200) + 20;
    const b = Math.floor(Math.random() * 200) + 20;
    const target = `rgb(${r}, ${g}, ${b})`;
    setTargetColor(target);

    const newOptions = [target];
    for (let i = 1; i < totalBoxes; i++) {
      const signR = Math.random() > 0.5 ? 1 : -1;
      const signG = Math.random() > 0.5 ? 1 : -1;
      const signB = Math.random() > 0.5 ? 1 : -1;
      
      const dr = Math.min(255, Math.max(0, r + (Math.random() * config.diff * signR)));
      const dg = Math.min(255, Math.max(0, g + (Math.random() * config.diff * signG)));
      const db = Math.min(255, Math.max(0, b + (Math.random() * config.diff * signB)));
      
      newOptions.push(`rgb(${Math.floor(dr)}, ${Math.floor(dg)}, ${Math.floor(db)})`);
    }

    const shuffled = [...newOptions].sort(() => Math.random() - 0.5);
    setOptions(shuffled);
    setCorrectIndex(shuffled.indexOf(target));
  }, []);

  const scoreRef = useRef(0);
  const correctRef = useRef(0);

  useEffect(() => {
    scoreRef.current = score;
    correctRef.current = correctCount;
  }, [score, correctCount]);

  useEffect(() => {
    if (!roomCode) return;

    const handleRoomState = (state) => {
      const combined = [
        ...state.players.map(p => ({ ...p, isMe: p.name === playerName })),
        ...(state.bots || [])
      ].sort((a, b) => b.score - a.score);
      setAllPlayers(combined);
    };

    const handleGameEnded = ({ standings }) => {
      navigate('/score', { 
        state: { 
          ...location.state,
          score: scoreRef.current, 
          mode: 'Color Race', 
          correctCount: correctRef.current, 
          allPlayers: standings, 
        } 
      });
    };

    socket.on('roomState', handleRoomState);
    socket.on('gameEnded', handleGameEnded);
    socket.on('matchStarted', ({ timeLimit }) => {
      setTimePerQuestion(timeLimit);
      setSetupMode(false);
      setScore(0);
      setCorrectCount(0);
      setCurrentQuestion(1);
      setWaitingForOthers(false);
      setShowHint(false);
      setFeedbackMessage('');
      setTimeLeft(timeLimit);
      generateColors(1);
    });

    return () => {
      socket.off('roomState', handleRoomState);
      socket.off('gameEnded', handleGameEnded);
      socket.off('matchStarted');
    };
  }, [roomCode, navigate, playerName, score, correctCount, location.state, generateColors]);

  const startGame = () => {
    if (roomCode) {
      socket.emit('startMatch', { roomCode, timeLimit: timePerQuestion });
    } else {
      setSetupMode(false);
      setCurrentQuestion(1);
      setScore(0);
      setCorrectCount(0);
      setShowHint(false);
      setFeedbackMessage('');
      setTimeLeft(timePerQuestion);
      generateColors(1);
    }
  };

  const handleFinishGame = useCallback((finalScore, finalCorrectCount) => {
    if (roomCode) {
      setWaitingForOthers(true);
      socket.emit('playerFinished', { 
        roomCode, 
        playerName, 
        score: finalScore, 
        correctCount: finalCorrectCount 
      });
    } else {
      navigate('/score', { 
        state: { 
          ...location.state,
          score: finalScore, 
          mode: 'Color Race', 
          correctCount: finalCorrectCount,
        } 
      });
    }
  }, [navigate, roomCode, location.state, playerName]);

  const nextQuestion = useCallback(() => {
    if (currentQuestion >= totalQuestions) {
      handleFinishGame(score, correctCount);
    } else {
      const nextQ = currentQuestion + 1;
      setCurrentQuestion(nextQ);
      setTimeLeft(timePerQuestion);
      setShowHint(false);
      setFeedbackMessage('');
      generateColors(nextQ);
    }
  }, [currentQuestion, score, timePerQuestion, generateColors, handleFinishGame, correctCount]);

  const revealCorrectAnswer = useCallback(() => {
    if (showHint) return;
    setShowHint(true);
    setTimeLeft(0);
    setFeedbackMessage('Waktu habis! Warna yang benar akan ditandai sebentar.');
    setTimeout(() => {
      setShowHint(false);
      setFeedbackMessage('');
      nextQuestion();
    }, 1400);
  }, [nextQuestion, showHint]);

  useEffect(() => {
    if (setupMode || waitingForOthers) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!showHint) {
            setTimeout(revealCorrectAnswer, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [setupMode, waitingForOthers, currentQuestion, revealCorrectAnswer, showHint]);

  const handleGuess = (color) => {
    if (showHint) return;
    if (color === targetColor) {
      const points = Math.max(100, Math.floor(800 * (timeLeft / timePerQuestion)));
      const newScore = score + points;
      const newCorrectCount = correctCount + 1;
      
      setScore(newScore);
      setCorrectCount(newCorrectCount);
      setFeedbackMessage('Benar!');

      if (roomCode) {
        socket.emit('playerAnswer', { 
          roomCode, 
          playerName, 
          correct: true, 
          points, 
          correctCount: newCorrectCount 
        });
      }

      nextQuestion();
    } else {
      setTimeLeft(t => Math.max(0, t - 3));
      if (roomCode) {
        socket.emit('playerAnswer', { roomCode, playerName, correct: false });
      }
    }
  };

  if (setupMode) {
    return (
      <div className="container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
          <h2 className="title text-gradient" style={{ fontSize: '2.5rem', margin: '0 0 1rem' }}>Game Setup</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Choose time limit per question</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
            {[10, 20, 30, 40, 50, 60].map(t => (
              <button 
                key={t}
                className={`btn ${timePerQuestion === t ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.8rem 0' }}
                onClick={() => setTimePerQuestion(t)}
              >
                {t}s
              </button>
            ))}
          </div>
          
          <button className="btn btn-primary" style={{ width: '100%', fontSize: '1.2rem' }} onClick={startGame}>
            Start Game
          </button>
        </div>
      </div>
    );
  }

  if (waitingForOthers) {
    return (
      <div className="container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', textAlign: 'center', padding: '3rem' }}>
          <h2 className="title text-gradient" style={{ fontSize: '2.5rem' }}>Finished!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginTop: '1rem' }}>Waiting for other players to finish...</p>
          
          <div style={{ marginTop: '2rem', textAlign: 'left' }}>
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Standings:</h4>
            {allPlayers.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--glass-border)' }}>
                <span>{p.name} {p.isMe && '(You)'}</span>
                <span style={{ color: p.finished ? 'var(--success)' : 'var(--text-muted)' }}>{p.score} {p.finished ? '[Done]' : '[Playing]'}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
            <div className="spinner" style={{ width: '30px', height: '30px', border: '3px solid var(--glass-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const { gridSize } = getLevelConfig(currentQuestion);

  return (
    <div className="container" style={{ padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', display: 'flex', gap: '2rem', padding: '1.5rem' }}>
        
        <div style={{ flex: '1', textAlign: 'center' }}>
          {roomCode && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
              <Users size={16} /> <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>Room: {roomCode}</span>
            </div>
          )}

          <div className="header-bar" style={{ marginBottom: '1rem' }}>
            <div className="stat-box">
              <Timer size={18} color="var(--secondary)" /> 
              <span style={{ fontSize: '1rem', color: timeLeft <= 5 ? 'var(--danger)' : 'white' }}>{timeLeft}s</span>
            </div>
            <div className="stat-box" style={{ background: 'transparent' }}>
              <Hash size={18} color="var(--primary)" />
              <span style={{ fontSize: '1rem', color: 'white' }}>{currentQuestion} / {totalQuestions}</span>
            </div>
            <div className="stat-box">
              <Star size={18} color="#fbbf24" /> 
              <span style={{ fontSize: '1rem' }}>{score}</span>
            </div>
          </div>

          {feedbackMessage && (
            <div style={{ margin: '0 auto 1rem', maxWidth: '420px', padding: '0.9rem 1rem', borderRadius: '14px', background: 'rgba(99, 102, 241, 0.15)', color: 'white', fontSize: '0.95rem', fontFamily: 'Outfit, sans-serif' }}>
              {feedbackMessage}
            </div>
          )}

          <p style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Find the exact match for this color:</p>
          
          <div className="target-color-display" style={{ backgroundColor: targetColor, width: '60px', height: '60px', marginBottom: '1rem', borderWidth: '3px' }}></div>

          <div className="color-grid" style={{ 
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`, 
            width: '100%',
            maxWidth: '320px', 
            margin: '0 auto',
            gap: '0.4rem'
          }}>
            {options.map((c, idx) => (
              <div 
                key={idx} 
                className="color-box" 
                style={{ 
                  backgroundColor: c, 
                  borderRadius: '6px', 
                  aspectRatio: '1/1', 
                  border: showHint && idx === correctIndex ? '3px solid rgba(16, 185, 129, 0.9)' : '2px solid transparent',
                  boxShadow: showHint && idx === correctIndex ? '0 0 0 4px rgba(16, 185, 129, 0.16)' : '0 4px 10px rgba(0,0,0,0.2)'
                }}
                onClick={() => handleGuess(c)}
              />
            ))}
          </div>
        </div>

        {/* Realtime Leaderboard Sidebar (Only if in room) */}
        {roomCode && (
          <div style={{ width: '220px', borderLeft: '1px solid var(--glass-border)', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Live Ranks</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {allPlayers.map((p, i) => (
                <div key={i} style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                  padding: '0.8rem', background: p.isMe ? 'rgba(99, 102, 241, 0.2)' : 'rgba(0,0,0,0.2)', 
                  borderRadius: '8px', border: p.isMe ? '1px solid var(--primary)' : '1px solid transparent',
                  transition: 'all 0.3s'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: '800', color: i === 0 ? '#fbbf24' : i === 1 ? '#e5e7eb' : i === 2 ? '#b45309' : 'var(--text-muted)' }}>#{i+1}</span>
                    <span style={{ fontWeight: p.isMe ? '600' : '400', color: p.isMe ? 'white' : 'var(--text-main)', fontSize: '0.9rem', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  </div>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{p.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}