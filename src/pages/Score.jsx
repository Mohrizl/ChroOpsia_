import { useLocation, useNavigate } from 'react-router-dom';
import { Trophy, RotateCcw, Home, Crown } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Score() {
  const location = useLocation();
  const navigate = useNavigate();
  const { score, mode, roomCode, playerName, allPlayers, wrongCount, correctCount } = location.state || { score: 0, mode: 'Unknown' };
  
  const [showAnimation, setShowAnimation] = useState(false);

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
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'inline-block', padding: '0.4rem 1.2rem', borderRadius: '20px', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', fontWeight: '800', marginBottom: '1rem', border: '1px solid var(--success)' }}>
            HASIL: MATA NORMAL
          </div>
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            Selamat! Kamu berhasil menjawab <strong>{finalCorrect} dari {total}</strong> soal dengan benar. 
            Hasil ini menunjukkan bahwa mata Anda mampu membedakan spektrum warna merah-hijau dengan sangat baik. 
            Kesalahan maksimal 1 soal masih dikategorikan sebagai penglihatan warna normal dalam standar medis uji Ishihara.
          </p>
        </div>
      );
    } else {
      return (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'inline-block', padding: '0.4rem 1.2rem', borderRadius: '20px', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', fontWeight: '800', marginBottom: '1rem', border: '1px solid var(--danger)' }}>
            HASIL: INDIKASI BUTA WARNA
          </div>
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
            Kamu menjawab benar <strong>{finalCorrect} dari {total}</strong> soal. 
            Berdasarkan standar uji Ishihara, kesalahan sebanyak 2 soal atau lebih merupakan indikasi adanya gangguan persepsi warna (defisiensi penglihatan warna). 
            Jangan khawatir, buta warna biasanya bersifat keturunan. Sebaiknya Anda berkonsultasi dengan dokter spesialis mata untuk pemeriksaan klinis yang lebih mendalam.
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

  useEffect(() => {
    if (isWinner) {
      setTimeout(() => setShowAnimation(true), 300);
    }
  }, [isWinner]);

  return (
    <div className="container">
      {showAnimation && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100 }}>
          <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%, -50%)', animation: 'bounceInOut 4s ease forwards' }}>
            <Crown size={120} color="#fbbf24" style={{ filter: 'drop-shadow(0 0 20px rgba(251, 191, 36, 0.8))' }} />
          </div>
          <style>{`
            @keyframes bounceInOut {
              0% { top: -10%; opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
              10% { top: 25%; opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
              15% { top: 15%; transform: translate(-50%, -50%) scale(0.9); }
              20% { top: 20%; transform: translate(-50%, -50%) scale(1); }
              80% { top: 20%; opacity: 1; transform: translate(-50%, -50%) scale(1); }
              90% { top: 20%; transform: translate(-50%, -50%) scale(1.2); }
              100% { top: -10%; opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
            }
          `}</style>
        </div>
      )}

      <div className="glass-panel" style={{ 
        width: '100%', maxWidth: roomCode ? '900px' : '600px', 
        position: 'relative', zIndex: 1, 
        display: 'flex', flexDirection: roomCode ? 'row' : 'column', gap: '2rem',
        alignItems: roomCode ? 'flex-start' : 'center',
        padding: '3rem'
      }}>
        
        {/* Main Score Info */}
        <div style={{ flex: 1, textAlign: 'center', width: '100%' }}>
          {!showAnimation && <Trophy size={64} color="#fbbf24" style={{ marginBottom: '1rem', margin: '0 auto' }} />}
          {showAnimation && <div style={{ height: '64px', marginBottom: '1rem' }} />} {/* Spacer for crown */}
          
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
