import { useLocation, useNavigate } from 'react-router-dom';
import { Palette, Eye, ArrowLeft } from 'lucide-react';

export default function GameModeSelect() {
  const navigate = useNavigate();
  const location = useLocation();
  const gameState = location.state || {}; // contains solo/multiplayer info

  const handleSelect = (gameType) => {
    if (gameState.roomCode) {
      // Multiplayer mode: host selected game, go to waiting room
      navigate('/waiting-room', { state: { ...gameState, gameType } });
    } else {
      // Solo mode
      if (gameType === 'color-race') {
        navigate('/game/color-race', { state: { ...gameState } });
      } else {
        navigate('/game/ishihara', { state: { ...gameState } });
      }
    }
  };

  return (
    <div className="container">
      <div className="glass-panel" style={{ maxWidth: '800px', width: '100%', textAlign: 'center', position: 'relative' }}>
        <button 
          onClick={() => navigate(-1)} 
          style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          title="Go Back"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="title text-gradient" style={{ fontSize: '3rem', marginTop: '1rem' }}>Select Game Mode</h2>
        <p className="subtitle">Choose your visual challenge</p>

        <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '3rem' }}>
          
          <div 
            className="glass-panel" 
            style={{ flex: '1', minWidth: '250px', cursor: 'pointer', transition: 'transform 0.3s' }}
            onClick={() => handleSelect('color-race')}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Palette size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
            <h3>Color Match Racing</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Find the exact matching shade as fast as possible before time runs out!</p>
          </div>

          <div 
            className="glass-panel" 
            style={{ flex: '1', minWidth: '250px', cursor: 'pointer', transition: 'transform 0.3s' }}
            onClick={() => handleSelect('ishihara')}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Eye size={48} color="var(--secondary)" style={{ marginBottom: '1rem' }} />
            <h3>Ishihara Challenge</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Test your color vision by identifying hidden numbers with tricky distractors!</p>
          </div>

        </div>
      </div>
    </div>
  );
}
