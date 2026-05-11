import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timer, Star, Users, Hash, CheckCircle2 } from 'lucide-react';
import { socket } from '../socket';

const ISHIHARA_IMAGES = [
  { file: '/2.png', answer: '2' },
  { file: '/3.png', answer: '3' },
  { file: '/5.png', answer: '5' },
  { file: '/5 (14).png', answer: '5' },
  { file: '/6.png', answer: '6' },
  { file: '/6 (11).png', answer: '6' },
  { file: '/7.png', answer: '7' },
  { file: '/8.png', answer: '8' },
  { file: '/12.png', answer: '12' },
  { file: '/15.png', answer: '15' },
  { file: '/26.png', answer: '26' },
  { file: '/29.png', answer: '29' },
  { file: '/45.png', answer: '45' },
  { file: '/57.png', answer: '57' },
  { file: '/73.png', answer: '73' },
  { file: '/74.png', answer: '74' },
  { file: '/96.png', answer: '96' },
  { file: '/97.png', answer: '97' },
];

const totalQuestions = 14;

const buildQuestion = (item) => {
  const allAnswers = Array.from(new Set(ISHIHARA_IMAGES.map(i => i.answer).filter(a => a !== item.answer)));
  const distractors = allAnswers.sort(() => Math.random() - 0.5).slice(0, 3);
  return {
    image: item.file,
    q: 'Identify the number shown below.',
    d: 'Focus on the pattern and the colored dots.',
    opts: [item.answer, ...distractors].sort(() => Math.random() - 0.5),
    c: item.answer,
  };
};

export default function IshiharaGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerName, isHost } = location.state || {};
  
  const [setupMode, setSetupMode] = useState(true);
  const [timePerQuestion, setTimePerQuestion] = useState(15);
  
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [waitingForOthers, setWaitingForOthers] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [allPlayers, setAllPlayers] = useState([]);

  const scoreRef = useRef(score);
  const correctRef = useRef(correctCount);
  const wrongRef = useRef(wrongCount);

  useEffect(() => {
    scoreRef.current = score;
    correctRef.current = correctCount;
    wrongRef.current = wrongCount;
  }, [score, correctCount, wrongCount]);

  useEffect(() => {
    if (!roomCode) return;

    const handleRoomState = (state) => {
      // Merge players and bots for the leaderboard
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
          mode: 'Ishihara Test', 
          wrongCount: wrongRef.current,
          correctCount: correctRef.current,
          allPlayers: standings, 
        } 
      });
    };

    socket.on('roomState', handleRoomState);
    socket.on('gameEnded', handleGameEnded);
    socket.on('matchStarted', ({ timeLimit }) => {
      setTimePerQuestion(timeLimit);
      const qList = [...ISHIHARA_IMAGES].sort(() => Math.random() - 0.5).slice(0, totalQuestions).map(buildQuestion);
      setQuestions(qList);
      setSetupMode(false);
      setCurrentQ(0);
      setScore(0);
      setWrongCount(0);
      setCorrectCount(0);
      setWaitingForOthers(false);
      setTimeLeft(timeLimit);
    });

    return () => {
      socket.off('roomState', handleRoomState);
      socket.off('gameEnded', handleGameEnded);
      socket.off('matchStarted');
    };
  }, [roomCode, navigate, playerName, location.state]);

  const startGame = () => {
    if (roomCode) {
      socket.emit('startMatch', { roomCode, timeLimit: timePerQuestion });
    } else {
      const qList = [...ISHIHARA_IMAGES].sort(() => Math.random() - 0.5).slice(0, totalQuestions).map(buildQuestion);
      setQuestions(qList);
      setSetupMode(false);
      setCurrentQ(0);
      setScore(0);
      setWrongCount(0);
      setCorrectCount(0);
      setTimeLeft(timePerQuestion);
    }
  };

  const handleFinishGame = useCallback((finalScore, finalWrongCount, finalCorrectCount) => {
    if (roomCode) {
      setWaitingForOthers(true);
      socket.emit('playerFinished', { 
        roomCode, 
        playerName, 
        score: finalScore, 
        correctCount: finalCorrectCount, 
        wrongCount: finalWrongCount 
      });
    } else {
      navigate('/score', { 
        state: { 
          ...location.state,
          score: finalScore, 
          mode: 'Ishihara Test', 
          wrongCount: finalWrongCount,
          correctCount: finalCorrectCount,
        } 
      });
    }
  }, [navigate, roomCode, location.state, playerName]);

  const nextQuestion = useCallback((isCorrect) => {
    let newScore = score;
    let newCorrectCount = correctCount;
    let newWrongCount = wrongCount;

    if (isCorrect) {
      // New scoring formula: 800 for fast answer, decreasing with time
      // points = Math.floor(800 * (timeLeft / timePerQuestion))
      const points = Math.max(100, Math.floor(800 * (timeLeft / timePerQuestion)));
      newScore += points;
      newCorrectCount += 1;
      setScore(newScore);
      setCorrectCount(newCorrectCount);
    } else {
      newWrongCount += 1;
      setWrongCount(newWrongCount);
    }

    if (roomCode) {
      socket.emit('playerAnswer', { 
        roomCode, 
        playerName, 
        correct: isCorrect, 
        points: isCorrect ? Math.max(100, Math.floor(800 * (timeLeft / timePerQuestion))) : 0,
        correctCount: newCorrectCount,
        wrongCount: newWrongCount
      });
    }

    if (currentQ < totalQuestions - 1) {
      setCurrentQ(c => c + 1);
      setTimeLeft(timePerQuestion);
    } else {
      handleFinishGame(newScore, newWrongCount, newCorrectCount);
    }
  }, [currentQ, score, timeLeft, timePerQuestion, handleFinishGame, roomCode, playerName, correctCount, wrongCount]);

  useEffect(() => {
    if (setupMode || waitingForOthers) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Visual fix: show 0 before moving
          setTimeout(() => {
            nextQuestion(false);
          }, 100);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [setupMode, waitingForOthers, currentQ, nextQuestion]);

  if (setupMode) {
    return (
      <div className="container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
          <h2 className="title text-gradient" style={{ fontSize: '2.5rem', margin: '0 0 1rem' }}>Game Setup</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Choose time limit per question</p>
          
          {roomCode && !isHost && (
            <div style={{ padding: '2rem', color: 'var(--primary)' }}>
              Waiting for host to start the game...
            </div>
          )}
          
          {(!roomCode || isHost) && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                {[10, 15, 20, 30, 45, 60].map(t => (
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
            </>
          )}
        </div>
      </div>
    );
  }

  if (waitingForOthers) {
    return (
      <div className="container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', textAlign: 'center', padding: '3rem' }}>
          <CheckCircle2 size={64} color="var(--success)" style={{ margin: '0 auto 1rem' }} />
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

  const q = questions[currentQ];
  const leaderboard = roomCode ? allPlayers : [{ name: playerName || 'You', score, isMe: true }];

  return (
    <div className="container" style={{ padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', display: 'flex', gap: '2rem', padding: '1.5rem' }}>
        
        {/* Main Game Area */}
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
              <span style={{ fontSize: '1rem', color: 'white' }}>{currentQ + 1} / {totalQuestions}</span>
            </div>
            <div className="stat-box">
              <Star size={18} color="#fbbf24" /> 
              <span style={{ fontSize: '1rem' }}>{score}</span>
            </div>
          </div>

          <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '1rem' }}>
            <strong style={{ color: 'white' }}>Hint:</strong> Identifikasi angka di dalam pola warna ini.
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.2rem' }}>{q.q}</h3>
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>{q.d}</p>
          </div>

          <div style={{ 
            width: '200px', height: '200px', margin: '0 auto 1.5rem',
            background: '#fff', borderRadius: '50%', border: '4px solid var(--glass-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
          }}>
            <img src={q.image} alt="Ishihara Test" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = `<span style="color: black; font-weight: bold; font-size: 2rem;">${q.c}</span>`; }} />
          </div>

          <div className="options-grid" style={{ maxWidth: '350px', margin: '0 auto', gap: '0.5rem' }}>
            {q.opts.map((opt, idx) => (
              <button 
                key={idx} 
                className="btn btn-secondary" 
                style={{ fontSize: '1.1rem', padding: '0.8rem' }}
                onClick={() => nextQuestion(opt === q.c)}
              >
                {opt}
              </button>
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
