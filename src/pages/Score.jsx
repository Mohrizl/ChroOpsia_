import { useLocation, useNavigate } from 'react-router-dom';
import { Trophy, RotateCcw, Home, Crown } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Score() {
  const location = useLocation();
  const navigate = useNavigate();
  const { score, mode, roomCode, playerName, allPlayers, wrongCount, correctCount, numQuestions } = location.state || { score: 0, mode: 'Unknown' };
  const total = numQuestions || 14;

  // Use passed allPlayers or mock if missing
  const leaderboard = allPlayers || [
    { name: playerName || 'You', score: score },
  ];

  const isWinner = roomCode && leaderboard[0]?.name === (playerName || 'You');

  const getExplanation = () => {
    const finalWrong = wrongCount !== undefined ? wrongCount : (correctCount !== undefined ? total - correctCount : 0);
    const finalCorrect = total - finalWrong;
    const accuracy = (finalCorrect / total) * 100;

    if (mode === 'Ishihara Test') {
      if (finalWrong <= 1) {
        return (
          <div style={{ marginTop: '1.5rem', background: 'rgba(16, 185, 129, 0.1)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ display: 'inline-block', padding: '0.5rem 1.5rem', borderRadius: '30px', background: 'var(--success)', color: 'white', fontWeight: '900', marginBottom: '1rem', fontSize: '1.2rem' }}>
              HASIL MATA NORMAL
            </div>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', lineHeight: '1.6' }}>
              Selamat! Kamu menjawab benar <strong>{finalCorrect} dari {total}</strong> soal.
            </p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Hasil ini menunjukkan penglihatan warna normal, mampu membedakan kontras warna yang samar dengan tepat. Ini membuktikan persepsi visual kamu sangat tajam.
            </p>
          </div>
        );
      } else {
        return (
          <div style={{ marginTop: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <div style={{ display: 'inline-block', padding: '0.5rem 1.5rem', borderRadius: '30px', background: 'var(--danger)', color: 'white', fontWeight: '900', marginBottom: '1rem', fontSize: '1.2rem' }}>
              TERINDIKASI BUTA WARNA
            </div>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', lineHeight: '1.6' }}>
              Kamu menjawab benar <strong>{finalCorrect} dari {total}</strong> soal.
            </p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Kesalahan {finalWrong} soal dianggap indikasi buta warna karena mata gagal mengenali pola warna dasar tersebut dengan konsisten.
            </p>
          </div>
        );
      }
    } else {
      // Color Race Explanation
      const isExcellent = accuracy >= 90;
      return (
        <div style={{ marginTop: '1.5rem', background: isExcellent ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)', padding: '1.5rem', borderRadius: '16px', border: `1px solid ${isExcellent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}` }}>
          <div style={{ display: 'inline-block', padding: '0.5rem 1.5rem', borderRadius: '30px', background: isExcellent ? 'var(--success)' : 'var(--primary)', color: 'white', fontWeight: '900', marginBottom: '1rem', fontSize: '1.2rem' }}>
            {isExcellent ? 'VISI TAJAM' : 'HASIL SELESAI'}
          </div>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', lineHeight: '1.6' }}>
            Kamu berhasil memilih warna dengan tepat sebanyak <strong>{finalCorrect} dari {total}</strong> soal.
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            {isExcellent 
              ? "Luar biasa! Akurasi kamu sangat tinggi dalam membedakan gradasi warna yang sangat mirip dalam waktu singkat." 
              : "Bagus! Kamu memiliki kemampuan membedakan warna yang cukup baik. Teruslah berlatih untuk meningkatkan kecepatan dan akurasi."}
          </p>
        </div>
      );
    }
  };

  return (
    <div className="container" style={{ padding: '1rem' }}>
      <style>{`
        .score-panel {
          display: flex;
          flex-direction: row;
          flex-wrap: wrap;
          gap: 2rem;
          width: 100%;
          max-width: 900px;
          padding: 2.5rem;
          align-items: flex-start;
        }
        .score-main {
          flex: 1;
          min-width: 300px;
          text-align: center;
        }
        .score-sidebar {
          width: 320px;
          flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .score-panel {
            flex-direction: column;
            padding: 1.5rem;
            align-items: center;
          }
          .score-main {
            width: 100%;
            min-width: unset;
          }
          .score-sidebar {
            width: 100%;
            border-left: none !important;
            padding-left: 0 !important;
            border-top: 1px solid var(--glass-border);
            padding-top: 2rem;
          }
          .title { font-size: 2.5rem !important; }
        }
      `}</style>

      <div className={`glass-panel ${roomCode ? 'score-panel' : ''}`} style={!roomCode ? { maxWidth: '600px', textAlign: 'center' } : {}}>
        
        {/* Main Score Info */}
        <div className={roomCode ? 'score-main' : ''}>
          <Trophy size={64} color="#fbbf24" style={{ marginBottom: '1rem', margin: '0 auto' }} />

          <h2 className="title text-gradient" style={{ fontSize: '3.5rem' }}>{isWinner ? 'Victory!' : 'Match Over!'}</h2>
          <p className="subtitle" style={{ marginBottom: '1.5rem' }}>Mode: {mode} {roomCode ? `| Room: ${roomCode}` : ''}</p>

          {getExplanation()}

          <div style={{ 
            fontSize: 'clamp(3rem, 15vw, 5rem)', 
            fontWeight: '800', 
            margin: '1.5rem 0', 
            color: 'var(--success)', 
            textShadow: isWinner ? '0 0 20px rgba(16, 185, 129, 0.4)' : 'none',
            lineHeight: 1
          }}>
            {score}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate('/select-mode', { state: { ...location.state, players: undefined } })} style={{ width: 'auto', minWidth: '160px' }}>
              <RotateCcw size={20} /> Play Again
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/home')} style={{ width: 'auto', minWidth: '160px' }}>
              <Home size={20} /> Home
            </button>
          </div>
        </div>

        {/* Leaderboard Sidebar */}
        {roomCode && (
          <div className="score-sidebar" style={{ borderLeft: '1px solid var(--glass-border)', paddingLeft: '2rem' }}>
            <h3 style={{ marginBottom: '1.2rem', color: 'var(--text-muted)', fontSize: '1.1rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Final Standings</h3>
            <div style={{ background: 'var(--input-bg)', borderRadius: '20px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', border: '1px solid var(--glass-border)' }}>
              {leaderboard.map((p, idx) => (
                <div key={idx} style={{
                  background: p.name === (playerName || 'You') ? 'var(--input-bg)' : 'transparent',
                  borderRadius: '12px', 
                  border: p.name === (playerName || 'You') ? '1px solid var(--primary)' : '1px solid transparent',
                  padding: '0.75rem 1rem', 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                    {idx === 0 ? <Crown size={18} color="#fbbf24" /> : <span style={{ width: '18px', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{idx + 1}</span>}
                    <span style={{ 
                      fontWeight: p.name === (playerName || 'You') ? '800' : '400', 
                      color: 'var(--text-main)',
                      fontSize: '0.95rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {p.name}
                    </span>
                  </div>
                  <span style={{ fontWeight: '800', color: idx === 0 ? 'var(--primary)' : 'var(--text-main)', fontSize: '1rem' }}>{p.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
