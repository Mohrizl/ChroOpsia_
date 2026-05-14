import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Mail, Lock, User, Play, Loader2, Globe, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate('/home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/home'
        }
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleGuestPlay = () => {
    // For guest play, we can just navigate to the next screen.
    // Optionally, we could set a "guest" flag in localStorage or context.
    localStorage.setItem('isGuest', 'true');
    localStorage.setItem('guestName', `Guest_${Math.floor(Math.random() * 1000)}`);
    navigate('/home');
  };

  return (
    <div className="container">
      <div className="glass-panel">
        <div className="text-center">
          <h1 className="title text-gradient">ChroOpsia</h1>
          <p className="subtitle">Sign in to track your progress or play as guest</p>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleEmailLogin}>
          <div className="input-group">
            <label>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                className="input-field"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '3rem' }}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type={showPassword ? "text" : "password"}
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '3rem', paddingRight: '3rem' }}
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="divider">OR</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button className="btn btn-google" onClick={handleGoogleLogin} disabled={loading}>
            <Globe size={20} />
            Sign in with Google
          </button>

          <button className="btn btn-secondary" onClick={handleGuestPlay} disabled={loading}>
            <Play size={20} />
            Play as Guest
          </button>
        </div>

        <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Don't have an account? <span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }} onClick={() => navigate('/signup')}>Sign Up</span>
        </p>
      </div>
    </div>
  );
}
