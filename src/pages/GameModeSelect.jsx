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
    <div className="container">
      <div className="glass-panel" style={{ maxWidth: '900px', width: '100%', textAlign: 'center', position: 'relative' }}>
        <button 
          onClick={() => navigate(-1)} 
          className="btn-secondary"
          style={{ position: 'absolute', top: '2rem', left: '2rem', width: 'auto', padding: '0.5rem', borderRadius: '12px' }}
          title="Go Back"
        >
          <ArrowLeft size={20} />
        </button>
        
        <h2 className="title text-gradient" style={{ fontSize: '3rem', marginTop: '1rem' }}>Choose Your Challenge</h2>
        <p className="subtitle">Select a mode to test your visual perception</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
          
          <div 
            className="glass-panel" 
            style={{ 
              background: 'var(--input-bg)', 
              border: '2px solid transparent',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer'
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
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>Find the exact matching shade as fast as possible before time runs out! Test your speed and accuracy.</p>
          </div>

          <div 
            className="glass-panel" 
            style={{ 
              background: 'var(--input-bg)', 
              border: '2px solid transparent',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer'
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
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>Identify hidden numbers within complex patterns. A classic test of color deficiency and perception.</p>
          </div>

        </div>
      </div>
    </div>
  );
}
