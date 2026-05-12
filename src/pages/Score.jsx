import { useLocation, useNavigate } from 'react-router-dom';
import { Trophy, RotateCcw, Home, Crown } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Score() {
  const location = useLocation();
  const navigate = useNavigate();
  const { score, mode, roomCode, playerName, allPlayers, wrongCount, correctCount } = location.state || { score: 0, mode: 'Unknown' };

  // Use passed allPlayers or mock if missing
  const leaderboard = allPlayers || [
    { name: playerName || 'You', score: score },
  ];

  const isWinner = roomCode && leaderboard[0]?.name === (playerName || 'You');

  const ishiharaExplanation = () => {
    const total = 14;
    const finalWrong = wrongCount !== undefined ? wrongCount : (correctCount !== undefined ? total - correctCount : 0);
    const finalCorrect = total - finalWrong;

    if (finalWrong <= 1) {
      return (
        <div style={{ marginTop: '1.5rem', background: 'rgba(16, 185, 129, 0.1)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div style={{ display: 'inline-block', padding: '0.5rem 1.5rem', borderRadius: '30px', background: 'var(--success)', color: 'white', fontWeight: '900', marginBottom: '1rem', fontSize: '1.2rem' }}>
            HASIL MATA NORMAL
          </div>
          <p style={{ fontSize: '1.1rem', color: 'white', lineHeight: '1.6' }}>
            Selamat! Kamu menjawab benar <strong>{finalCorrect} dari {total}</strong> soal.
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Hasil ini menunjukkan penglihatan warna normal, mampu membedakan kontras warna yang samar dengan tepat. Ini membuktikan persepsi visual kamu sangat tajam dan tidak ada kendala dalam mengenali gradasi warna.
          </p>
        </div>
      );
    } else {
      return (
        <div style={{ marginTop: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <div style={{ display: 'inline-block', padding: '0.5rem 1.5rem', borderRadius: '30px', background: 'var(--danger)', color: 'white', fontWeight: '900', marginBottom: '1rem', fontSize: '1.2rem' }}>
            HASIL TERINDIKASI BUTA WARNA
          </div>
          <p style={{ fontSize: '1.1rem', color: 'white', lineHeight: '1.6' }}>
            Kamu menjawab benar <strong>{finalCorrect} dari {total}</strong> soal.
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Kesalahan 2 soal atau lebih dianggap indikasi buta warna karena mata gagal mengenali pola warna dasar tersebut, berarti ada sel saraf mata yang tidak menangkap spektrum warna dengan sempurna.
          </p>
        </div>
      );
    }
  };

  const colorRaceExplanation = () => {
    const total = 14;
    const finalCorrect = correctCount !== undefined ? correctCount : 0;
    return `Kamu berhasil memilih warna dengan tepat sebanyak ${finalCorrect} dari ${total} soal.`;
  };

  return (
    <div className="container">
      <div className="glass-panel" style={{
        width: '100%', maxWidth: roomCode ? '900px' : '600px',
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: roomCode ? 'row' : 'column', gap: '2rem',
        alignItems: roomCode ? 'flex-start' : 'center',
        padding: '3rem'
      }}>

        {/* Main Score Info */}
        <div style={{ flex: 1, textAlign: 'center', width: '100%' }}>
          <Trophy size={64} color="#fbbf24" style={{ marginBottom: '1rem', margin: '0 auto' }} />

          <h2 className="title text-gradient">{isWinner ? 'Victory!' : 'Match Over!'}</h2>
          <p className="subtitle">Mode: {mode} {roomCode ? `| Room: ${roomCode}` : ''}</p>

          {mode === 'Ishihara Test' && wrongCount !== undefined && (
            <>
              {ishiharaExplanation()}
            </>
          )}
          {mode === 'Color Race' && correctCount !== undefined && (
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.8rem', lineHeight: '1.6' }}>
              {colorRaceExplanation()}
            </p>
          )}

          <div style={{ fontSize: '4.5rem', fontWeight: '800', margin: '2rem 0', color: 'var(--success)', textShadow: isWinner ? '0 0 20px rgba(16, 185, 129, 0.5)' : 'none' }}>
            {score}
          </div>

          <div className="action-buttons" style={{ marginTop: '2rem', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => navigate('/select-mode', { state: { ...location.state, players: undefined } })}>
              <RotateCcw size={20} /> Play Again
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>
              <Home size={20} /> Home
            </button>
          </div>
        </div>

        {/* Leaderboard Sidebar */}
        {roomCode && (
          <div className="leaderboard" style={{ width: '300px', borderLeft: '1px solid var(--glass-border)', paddingLeft: '2rem', margin: 0 }}>
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>Final Standings</h3>
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {leaderboard.map((p, idx) => (
                <div key={idx} className="leaderboard-item" style={{
                  background: p.name === (playerName || 'You') ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  borderRadius: '8px', border: p.name === (playerName || 'You') ? '1px solid var(--primary)' : '1px solid transparent',
                  padding: '0.8rem', display: 'flex', justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {idx === 0 ? <Crown size={18} color="#fbbf24" /> : <span style={{ width: '18px', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-muted)' }}>{idx + 1}</span>}
                    <span style={{ fontWeight: p.name === (playerName || 'You') ? '800' : '400', color: p.name === (playerName || 'You') ? 'white' : 'var(--text-main)' }}>
                      {p.name}
                    </span>
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
