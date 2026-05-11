import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timer, Star, Users, Hash, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ISHIHARA_IMAGES = [
  { file: '/2.png', answer: '2' }, { file: '/3.png', answer: '3' }, { file: '/5.png', answer: '5' },
  { file: '/5 (14).png', answer: '5' }, { file: '/6.png', answer: '6' }, { file: '/6 (11).png', answer: '6' },
  { file: '/7.png', answer: '7' }, { file: '/8.png', answer: '8' }, { file: '/12.png', answer: '12' },
  { file: '/15.png', answer: '15' }, { file: '/26.png', answer: '26' }, { file: '/29.png', answer: '29' },
  { file: '/45.png', answer: '45' }, { file: '/57.png', answer: '57' }, { file: '/73.png', answer: '73' },
  { file: '/74.png', answer: '74' }, { file: '/96.png', answer: '96' }, { file: '/97.png', answer: '97' },
];

const totalQuestions = 14;

const buildQuestion = (item) => {
  const allAnswers = Array.from(new Set(ISHIHARA_IMAGES.map(i => i.answer).filter(a => a !== item.answer)));
  const distractors = allAnswers.sort(() => Math.random() - 0.5).slice(0, 3);
  return {
    image: item.file,
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
      navigate('/score', { 
        state: { 
          ...location.state,
          score: scoreRef.current, 
          mode: 'Ishihara Test', 
          wrongCount: wrongRef.current,
          correctCount: correctRef.current,
          allPlayers: sorted, 
        } 
      });
    }
  }, [roomCode, navigate, location.state]);

  useEffect(() => {
    if (!roomCode) return;
    fetchGameState();

    const channel = supabase.channel(`game-${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${roomCode}` }, () => {
        fetchGameState();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` }, (payload) => {
        if (payload.new.status === 'finished') {
          fetchGameState();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomCode, fetchGameState]);

  // Host manages bots and end-game detection
  useEffect(() => {
    if (!isHost || !roomCode || setupMode || waitingForOthers) return;

    const botInterval = setInterval(async () => {
      const { data: pData } = await supabase.from('players').select('*').eq('room_code', roomCode);
      const humans = pData.filter(p => !p.is_bot);
      const bots = pData.filter(p => p.is_bot && !p.finished);

      // 1. Advance bots
      const botUpdates = bots.map(async (bot) => {
        if (Math.random() < 0.8) { // Higher chance
          const newQ = bot.current_question + (Math.random() > 0.5 ? 2 : 1);
          const newScore = bot.score + Math.floor(Math.random() * 400 + 500);
          return supabase.from('players').update({
            current_question: newQ,
            score: newScore,
            finished: newQ > 14
          }).eq('id', bot.id);
        }
        return null;
      });

      await Promise.all(botUpdates.filter(u => u !== null));

      // 2. Check if all humans finished
      if (humans.every(h => h.finished)) {
        await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode);
        clearInterval(botInterval);
      }
    }, 2000);

    return () => clearInterval(botInterval);
  }, [isHost, roomCode, setupMode, waitingForOthers]);

  const startGame = () => {
    const qList = [...ISHIHARA_IMAGES].sort(() => Math.random() - 0.5).slice(0, totalQuestions).map(buildQuestion);
    setQuestions(qList);
    setSetupMode(false);
    setCurrentQ(0);
    setScore(0);
    setWrongCount(0);
    setCorrectCount(0);
    setTimeLeft(timePerQuestion);
  };

  const handleFinishGame = async (finalScore, finalWrongCount, finalCorrectCount) => {
    if (roomCode) {
      setWaitingForOthers(true);
      await supabase.from('players').update({
        finished: true,
        score: finalScore,
        correct_count: finalCorrectCount,
        wrong_count: finalWrongCount
      }).eq('room_code', roomCode).eq('name', playerName);
    } else {
      navigate('/score', { 
        state: { score: finalScore, mode: 'Ishihara Test', wrongCount: finalWrongCount, correctCount: finalCorrectCount, ...location.state } 
      });
    }
  };

  const nextQuestion = (isCorrect) => {
    let ns = score;
    let ncc = correctCount;
    let nwc = wrongCount;

    if (isCorrect) {
      const pts = Math.max(100, Math.floor(800 * (timeLeft / timePerQuestion)));
      ns += pts;
      ncc += 1;
      setScore(ns);
      setCorrectCount(ncc);
    } else {
      nwc += 1;
      setWrongCount(nwc);
    }

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
    } else {
      handleFinishGame(ns, nwc, ncc);
    }
  };

  useEffect(() => {
    if (setupMode || waitingForOthers) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { nextQuestion(false); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [setupMode, waitingForOthers, currentQ]);

  if (setupMode) {
    return (
      <div className="container">
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
          <h2 className="title text-gradient" style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>Game Setup</h2>
          <div style={{ marginBottom: '2rem' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Seconds per question:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              {[10, 15, 30].map(t => (
                <button key={t} className={`btn ${timePerQuestion === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTimePerQuestion(t)}>{t}s</button>
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
        <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
          <h2 className="title text-gradient">Finished!</h2>
          <p className="subtitle">Waiting for other players to finish...</p>
          <div className="loader" style={{ margin: '2rem auto' }}></div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'left' }}>
            <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>Standings:</h4>
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

  const q = questions[currentQ];

  return (
    <div className="container">
      <div style={{ display: 'grid', gridTemplateColumns: roomCode ? '1fr 300px' : '1fr', gap: '2rem', width: '100%', maxWidth: '1200px' }}>
        <div className="glass-panel" style={{ width: '100%', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', alignItems: 'center' }}>
            <div className="stat-badge"><Hash size={18} /> Question {currentQ + 1} / {totalQuestions}</div>
            <div className="stat-badge" style={{ color: timeLeft <= 5 ? 'var(--danger)' : 'white' }}><Timer size={18} /> {timeLeft}s</div>
            <div className="stat-badge"><Star size={18} /> {score}</div>
          </div>

          <div style={{ background: 'white', padding: '2rem', borderRadius: '24px', marginBottom: '2rem', display: 'inline-block', boxShadow: '0 0 40px rgba(255,255,255,0.1)' }}>
            <img src={q.image} alt="Test" style={{ width: '300px', height: '300px', objectFit: 'contain' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {q.opts.map((opt, i) => (
              <button key={i} className="btn btn-secondary" style={{ fontSize: '1.5rem', padding: '1.5rem' }} onClick={() => nextQuestion(opt === q.c)}>{opt}</button>
            ))}
          </div>
        </div>

        {roomCode && (
          <div className="glass-panel" style={{ width: '100%' }}>
            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={20} /> Live Ranks</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {allPlayers.map((p, idx) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem', background: p.name === playerName ? 'rgba(99, 102, 241, 0.2)' : 'rgba(0,0,0,0.2)', borderRadius: '10px', border: p.name === playerName ? '1px solid var(--primary)' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ width: '20px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{idx + 1}</span>
                    <span style={{ fontWeight: p.name === playerName ? '800' : '400' }}>{p.name} {p.finished && <CheckCircle2 size={14} style={{ display: 'inline', color: 'var(--success)' }} />}</span>
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
