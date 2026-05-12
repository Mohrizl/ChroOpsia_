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
  
  const [setupMode, setSetupMode] = useState(!roomCode);
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
          setSetupMode(false);
        }
      });
    }
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode) return;
    fetchGameState();
    const channel = supabase.channel(`game-${roomCode}`)
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
          if (Math.random() < 0.7) {
            const newQ = bot.current_question + (Math.random() > 0.6 ? 2 : 1);
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
    const qList = [...ISHIHARA_IMAGES].sort(() => Math.random() - 0.5).slice(0, totalQuestions).map(buildQuestion);
    setQuestions(qList);
    setSetupMode(false);
    setCurrentQ(0);
    setScore(0);
    setWrongCount(0);
    setCorrectCount(0);
    setTimeLeft(timePerQuestion);
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
      setTimeout(() => setIsProcessing(false), 200);
    } else {
      handleFinishGame(ns, nwc, ncc);
    }
  };

  const handleFinishGame = async (fs, fwc, fcc) => {
    if (roomCode) {
      setWaitingForOthers(true);
      await supabase.from('players').update({
        finished: true,
        score: fs,
        correct_count: fcc,
        wrong_count: fwc
      }).eq('room_code', roomCode).eq('name', playerName);
    } else {
      navigate('/score', { state: { score: fs, mode: 'Ishihara Test', wrongCount: fwc, correctCount: fcc, ...location.state } });
    }
  };

  useEffect(() => {
    if (setupMode || waitingForOthers) return;
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

  const q = questions[currentQ];
  if (!q) return null;

  return (
    <div className="container" style={{ padding: '0.5rem' }}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: roomCode ? '1fr 300px' : '1fr', 
        gap: '1rem', 
        width: '100%', 
        maxWidth: '1200px',
        alignItems: 'stretch'
      }}>
        <div className="glass-panel" style={{ textAlign: 'center', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.6rem 1.8rem', borderRadius: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Hash size={18} /> <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{currentQ + 1} / {totalQuestions}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: timeLeft <= 5 ? 'var(--danger)' : 'white' }}><Timer size={18} /> <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{timeLeft}s</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Star size={18} /> <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{score}</span></div>
          </div>

          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '28px', marginBottom: '1.5rem', display: 'inline-block', alignSelf: 'center', boxShadow: '0 0 40px rgba(255,255,255,0.1)' }}>
            <img src={q.image} alt="Test" style={{ width: '320px', height: '320px', objectFit: 'contain' }} />
          </div>

          <p style={{ fontSize: '1.4rem', marginBottom: '1.5rem', color: 'white', fontWeight: 'bold', letterSpacing: '0.05em' }}>
            What number do you see?
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
            {q.opts.map((opt, i) => (
              <button 
                key={i} 
                className="btn btn-secondary" 
                style={{ 
                  fontSize: '1.5rem', 
                  padding: '1.2rem', 
                  fontWeight: '900', 
                  borderRadius: '16px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                }} 
                onClick={() => nextQuestion(opt === q.c)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {roomCode && (
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Users size={22} /> Live Ranks</h3>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {allPlayers.map((p, idx) => (
                <div key={p.id} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '1rem 1.2rem', 
                  background: p.name === playerName ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.05)', 
                  borderRadius: '14px', 
                  fontSize: '1.1rem',
                  border: p.name === playerName ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)',
                  alignItems: 'center',
                  minHeight: '60px'
                }}>
                  <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    <span style={{ width: '24px', fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '1rem' }}>{idx + 1}</span>
                    <span style={{ fontWeight: p.name === playerName ? '900' : '500' }}>{p.name} {p.finished && <CheckCircle2 size={16} style={{ display: 'inline', color: 'var(--success)', marginLeft: '6px' }} />}</span>
                  </div>
                  <span style={{ fontWeight: '900', color: 'var(--primary)', fontSize: '1.2rem' }}>{p.score}</span>
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
