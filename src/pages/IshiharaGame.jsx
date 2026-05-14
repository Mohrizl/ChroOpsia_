import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timer, Star, Users, Hash, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ISHIHARA_IMAGES = [
  '/12.png', '/15.png', '/2.png', '/26.png', '/29.png', '/3.png', '/35.png', '/42.png', '/45.png',
  '/5 (14).png', '/5.png', '/57.png', '/6 (11).png', '/6.png', '/7.png', '/73.png', '/74.png', '/8.png',
  '/96.png', '/97.png', '/Nothing (2).png', '/Nothing (45).png', '/Nothing (73).png', 
  '/Nothing (a line).png', '/Nothing (line).png', '/Nothing.png', '/Purple & Red.png', '/Violet & Orange.png'
];

const getAnswerFromFile = (file) => {
  let name = file.replace(/^\//, '').replace(/\.png$/i, '');
  name = name.replace(/\s*\([^)]*\)/, '');
  return name.trim();
};

const buildQuestion = (file) => {
  const answer = getAnswerFromFile(file);
  
  const numbers = ['2', '3', '5', '6', '7', '8', '12', '15', '26', '29', '35', '42', '45', '57', '73', '74', '96', '97'];
  const words = ['Purple & Red', 'Violet & Orange', 'Green Line', 'Blue Line', 'Nothing'];
  
  let distractors = [];
  const pool = answer.toLowerCase() === 'nothing' ? [...numbers, 'Purple & Red', 'Green Line'] : [...numbers, ...words];
  
  while (distractors.length < 3) {
    const rand = pool[Math.floor(Math.random() * pool.length)];
    if (rand !== answer && !distractors.includes(rand)) {
      distractors.push(rand);
    }
  }

  return {
    image: file,
    opts: [answer, ...distractors].sort(() => Math.random() - 0.5),
    c: answer,
  };
};

export default function IshiharaGame() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode, playerName, isHost, numQuestions = 14 } = location.state || {};

  const [setupMode, setSetupMode] = useState(!roomCode);
  const [selectedQuestionCount, setSelectedQuestionCount] = useState(numQuestions);
  const totalQuestions = roomCode ? numQuestions : selectedQuestionCount;
  const [timePerQuestion, setTimePerQuestion] = useState(20);
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [waitingForOthers, setWaitingForOthers] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [allPlayers, setAllPlayers] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scorePopups, setScorePopups] = useState([]);

  const scoreRef = useRef(0);
  const correctRef = useRef(0);
  const wrongRef = useRef(0);

  useEffect(() => {
    scoreRef.current = score;
    correctRef.current = correctCount;
    wrongRef.current = wrongCount;
  }, [score, correctCount, wrongCount]);

  const fetchGameState = useCallback(async () => {
    const { data: pData } = await supabase.from('players').select('*').eq('room_code', roomCode);
    const sorted = (pData || []).sort((a, b) => b.score - a.score);
    setAllPlayers(sorted);

    const { data: rData } = await supabase.from('rooms').select('*').eq('code', roomCode).single();
    if (rData?.status === 'finished') {
      setTimeout(() => {
        navigate('/score', {
          state: { ...location.state, score: scoreRef.current, mode: 'Ishihara Test', wrongCount: wrongRef.current, correctCount: correctRef.current, allPlayers: sorted }
        });
      }, 500);
    }
    return { players: sorted, room: rData };
  }, [roomCode, navigate, location.state]);

  useEffect(() => {
    if (roomCode) {
      supabase.from('rooms').select('*').eq('code', roomCode).single().then(({ data }) => {
        if (data) {
          setTimePerQuestion(data.time_limit || 20);
          const qList = [...ISHIHARA_IMAGES].sort(() => Math.random() - 0.5).slice(0, totalQuestions).map(buildQuestion);
          setQuestions(qList);
          setTimeLeft(data.time_limit || 20);
          if (!isHost) setSetupMode(false);
        }
      });
    }
  }, [roomCode, isHost]);

  useEffect(() => {
    if (!roomCode) return;
    fetchGameState();
    const channel = supabase.channel(`game-${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${roomCode}` }, () => { fetchGameState(); })
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
      if (!room || room.status !== 'playing') {
        if (room?.status === 'finished') clearInterval(botInterval);
        return;
      }
      const humans = players.filter(p => !p.is_bot);
      const bots = players.filter(p => p.is_bot && !p.finished);
      if (bots.length > 0) {
        const botUpdates = bots.map(async (bot) => {
          if (Math.random() < 0.7) {
            const newQ = bot.current_question + (Math.random() > 0.6 ? 2 : 1);
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
    const questionsCount = roomCode ? numQuestions : selectedQuestionCount;
    const qList = [...ISHIHARA_IMAGES].sort(() => Math.random() - 0.5).slice(0, questionsCount).map(buildQuestion);
    setQuestions(qList); setSetupMode(false); setCurrentQ(0); setScore(0); setWrongCount(0); setCorrectCount(0); setTimeLeft(timePerQuestion);
  };

  const nextQuestion = (isCorrect) => {
    if (isProcessing) return;
    setIsProcessing(true);
    let ns = score;
    let ncc = correctCount;
    let nwc = wrongCount;

    if (isCorrect) {
      const pts = Math.max(50, Math.floor(400 * (timeLeft / timePerQuestion)));
      ns += pts;
      ncc += 1;
      setScore(ns);
      setCorrectCount(ncc);
      setScorePopups(prev => [...prev, { id: Date.now(), val: pts }]);
      setTimeout(() => setScorePopups(prev => prev.slice(1)), 1000);
    } else {
      nwc += 1;
      setWrongCount(nwc);
    }

    // Delay 1.5s before proceeding to next question
    setTimeout(() => {
      if (roomCode) {
        supabase.from('players').update({
          score: ns,
          current_question: currentQ + 2,
          correct_count: ncc,
          wrong_count: nwc,
          finished: currentQ >= totalQuestions - 1
        }).eq('room_code', roomCode).eq('name', playerName).then();
      }

      if (currentQ < totalQuestions - 1) {
        setCurrentQ(c => c + 1);
        setTimeLeft(timePerQuestion);
        setIsProcessing(false);
      } else {
        handleFinishGame(ns, nwc, ncc);
      }
    }, 1500);
  };

  const handleFinishGame = async (fs, fwc, fcc) => {
    if (roomCode) {
      setWaitingForOthers(true);
      await supabase.from('players').update({ finished: true, score: fs, correct_count: fcc, wrong_count: fwc }).eq('room_code', roomCode).eq('name', playerName);
    } else {
      navigate('/score', { state: { score: fs, mode: 'Ishihara Test', wrongCount: fwc, correctCount: fcc, numQuestions: totalQuestions, ...location.state } });
    }
  };



  useEffect(() => {
    if (setupMode || waitingForOthers || isProcessing) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 0) { if (!isProcessing) nextQuestion(false); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [setupMode, waitingForOthers, currentQ, timePerQuestion, isProcessing]);

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
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.6rem', fontSize: '0.9rem' }}>Number of questions:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
              {[14, 28].map(num => (
                <button
                  key={num}
                  className={`btn ${selectedQuestionCount === num ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                  onClick={() => setSelectedQuestionCount(num)}
                >
                  {num} Questions
                </button>
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

  function ScoreCounter({ targetScore }) {
    const [displayScore, setDisplayScore] = useState(targetScore);
    useEffect(() => {
      let start = displayScore;
      const end = targetScore;
      if (start === end) return;
      let current = start;
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

  const q = questions[currentQ];
  if (!q) return null;

  return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '1rem', paddingBottom: '1rem', minHeight: '100vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%', maxWidth: '850px', margin: '0 auto' }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '0.8rem', display: 'flex', flexDirection: 'column', position: 'relative', margin: '0 auto', width: '100%', maxWidth: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ padding: '0.9rem 1rem', borderRadius: '18px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', minWidth: '120px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Question</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>{currentQ + 1}/{totalQuestions}</div>
            </div>
            <div style={{ padding: '0.9rem 1rem', borderRadius: '18px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', minWidth: '120px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Time</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: timeLeft <= 5 ? 'var(--danger)' : 'var(--text-main)' }}>{timeLeft}s</div>
            </div>
            <div style={{ padding: '0.9rem 1.2rem', borderRadius: '18px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', minWidth: '130px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Score</div>
              <div style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--text-main)', position: 'relative' }}>
                <ScoreCounter targetScore={score} />
                {scorePopups.map(popup => (
                  <div key={popup.id} className="score-popup" style={{ position: 'absolute', left: 'calc(100% + 15px)', top: '50%', transform: 'translateY(-50%)' }}>
                    +{popup.val}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--glass-bg)', padding: '0.8rem', borderRadius: '20px', marginBottom: '0.8rem', display: 'inline-block', alignSelf: 'center' }}>
            <img src={q.image} alt="Test" style={{ width: '230px', height: '230px', objectFit: 'contain' }} />
          </div>
          <p style={{ fontSize: '1rem', marginBottom: '0.8rem', color: 'var(--text-main)', fontWeight: 'bold' }}>What number do you see?</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
            {q.opts.map((opt, i) => (
              <button
                key={i}
                className="btn btn-secondary"
                style={{
                  fontSize: '1.1rem', padding: '0.6rem', fontWeight: '800',
                  opacity: isProcessing ? (opt === q.c ? 1 : 0.5) : 1,
                  background: isProcessing && opt === q.c ? 'var(--success)' : 'var(--glass-bg)',
                  borderColor: isProcessing && opt === q.c ? 'var(--success)' : 'var(--glass-border)'
                }}
                disabled={isProcessing}
                onClick={() => nextQuestion(opt === q.c)}
              >
                {opt}
              </button>
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
