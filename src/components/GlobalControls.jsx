import React, { useState, useEffect } from 'react';
import { Settings, Sun, Moon, Volume2, VolumeX, Users } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function GlobalControls({ isPlaying, toggleMusic, session, openFriendsSidebar, isFriendsOpen, closeFriendsSidebar }) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFriendsOpen) {
          closeFriendsSidebar();
        } else {
          setIsOpen(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFriendsOpen, closeFriendsSidebar]);

  return (
    <div style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', opacity: isFriendsOpen ? 0 : 1, pointerEvents: isFriendsOpen ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'var(--panel-bg)',
          color: 'var(--text-main)',
          border: '1px solid var(--glass-border)',
          borderRadius: '50%',
          width: '50px',
          height: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          transition: 'transform 0.3s ease',
          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)'
        }}
        title="Settings"
      >
        <Settings size={24} />
      </button>

      <div style={{
        position: 'absolute',
        top: '60px',
        right: '0',
        background: 'var(--panel-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        transformOrigin: 'top right',
        transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(-20px)',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none'
      }}>
        <button 
          onClick={() => { toggleTheme(); setIsOpen(false); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', padding: '0.5rem', borderRadius: '8px', transition: 'background 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.background = 'var(--input-bg)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {theme === 'dark' ? <Sun size={20} color="#fbbf24" /> : <Moon size={20} color="var(--primary)" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>

        <button 
          onClick={() => { toggleMusic(); setIsOpen(false); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', padding: '0.5rem', borderRadius: '8px', transition: 'background 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.background = 'var(--input-bg)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {isPlaying ? <Volume2 size={20} color="var(--success)" /> : <VolumeX size={20} color="var(--danger)" />}
          {isPlaying ? 'Mute Music' : 'Play Music'}
        </button>

        {session?.user && (
          <button 
            onClick={() => { openFriendsSidebar(); setIsOpen(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', padding: '0.5rem', borderRadius: '8px', transition: 'background 0.2s' }}
            onMouseOver={(e) => e.currentTarget.style.background = 'var(--input-bg)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Users size={20} color="var(--secondary)" />
            Friends List
          </button>
        )}
      </div>
    </div>
  );
}
