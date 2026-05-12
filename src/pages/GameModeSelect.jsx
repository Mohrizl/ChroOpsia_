import { useLocation, useNavigate } from 'react-router-dom';
import { Palette, Eye, ArrowLeft } from 'lucide-react';

export default function GameModeSelect() {
  const navigate = useNavigate();
  const location = useLocation();
  const gameState = location.state || {};
  const playerName = gameState.playerName || localStorage.getItem('guestName') || '';
  const stateWithName = { ...gameState, playerName };

  const handleSelect = (gameType) => {
    if (gameState.roomCode) {
      navigate('/waiting-room', { state: { ...stateWithName, gameType } });
    } else {
      if (gameType === 'color-race') {
        navigate('/game/color-race', { state: { ...stateWithName } });
      } else {
        navigate('/game/ishihara', { state: { ...stateWithName } });
      }
    }
  };

  return (
    <div className="container" style={{ padding: '1rem' }}>
      <style>{`
        .mode-panel {
          max-width: 900px;
          width: 100%;
          text-align: center;
          position: relative;
          padding: 3rem 2rem;
        }
        .mode-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 2rem;
          margin-top: 2rem;
        }
        @media (max-width: 768px) {
          .mode-panel {
            padding: 4rem 1.5rem 2rem;
          }
          .mode-title {
            font-size: 2.2rem !important;
            line-height: 1.1;
          }
          .mode-grid {
            gap: 1.2rem;
          }
          .back-btn {
            top: 1rem !important;
            left: 1rem !important;
          }
        }
      `}</style>

      <div className="glass-panel mode-panel">
        <button 
          onClick={() => navigate(-1)} 
          className="btn-secondary back-btn"
          style={{ position: 'absolute', top: '2rem', left: '2rem', width: 'auto', padding: '0.6rem', borderRadius: '12px', zIndex: 10 }}
          title="Go Back"
        >
          <ArrowLeft size={20} />
        </button>
        
        <h2 className="title text-gradient mode-title" style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>Choose Your Challenge</h2>
        <p className="subtitle" style={{ marginBottom: '2rem' }}>Select a mode to test your visual perception</p>

        <div className="mode-grid">
          
          <div 
            className="glass-panel" 
            style={{ 
              background: 'var(--input-bg)', 
              border: '2px solid transparent',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer',
              padding: '2rem'
            }}
            onClick={() => handleSelect('color-race')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-10px)';
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.boxShadow = '0 20px 40px rgba(99, 102, 241, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', width: '80px', height: '80px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <Palette size={40} color="var(--primary)" />
            </div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Color Match Racing</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>Find the exact matching shade as fast as possible before time runs out! Test your speed and accuracy.</p>
          </div>

          <div 
            className="glass-panel" 
            style={{ 
              background: 'var(--input-bg)', 
              border: '2px solid transparent',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer',
              padding: '2rem'
            }}
            onClick={() => handleSelect('ishihara')}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-10px)';
              e.currentTarget.style.borderColor = 'var(--secondary)';
              e.currentTarget.style.boxShadow = '0 20px 40px rgba(236, 72, 153, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'transparent';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ background: 'rgba(236, 72, 153, 0.1)', width: '80px', height: '80px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <Eye size={40} color="var(--secondary)" />
            </div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Ishihara Challenge</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.95rem' }}>Identify hidden numbers within complex patterns. A classic test of color deficiency and perception.</p>
          </div>

        </div>
      </div>
    </div>
  );
}
