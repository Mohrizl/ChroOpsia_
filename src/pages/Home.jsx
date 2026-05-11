import { useNavigate } from 'react-router-dom';
import { Users, User, Play } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="container">
      <div className="hero-section glass-panel">
        <h1 className="title text-gradient">ChroOpsia</h1>
        <p className="subtitle">The Ultimate Color Vision Challenge</p>
        
        <div className="action-buttons">
          <button 
            className="btn btn-primary" 
            onClick={() => navigate('/select-mode', { state: { mode: 'solo' } })}
          >
            <User size={20} />
            Play Solo
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/lobby')}
          >
            <Users size={20} />
            Multiplayer Room
          </button>
        </div>
      </div>
    </div>
  );
}
