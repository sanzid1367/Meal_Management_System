import React, { useState } from 'react';
import { api } from '../lib/api';

export function Auth({ onLogin }: { onLogin: (user: any) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        const res = await api.login(username, password);
        localStorage.setItem('access_token', res.access_token);
        localStorage.setItem('user', JSON.stringify(res.user));
        onLogin(res.user);
      } else {
        await api.register({ username, password });
        setIsLogin(true);
        setError('Registration successful. Please log in.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden font-sans">
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-chart-2 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
      
      <div className="w-full max-w-md bg-card/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-border relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center text-primary-foreground mx-auto mb-4">
             <span className="text-2xl font-bold">M</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p className="text-muted-foreground text-sm mt-1">Mess Meal Manager</p>
        </div>

        {error && <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Username</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-secondary border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl px-4 py-2 outline-none transition-all text-foreground"
              placeholder="admin or member"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-secondary border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl px-4 py-2 outline-none transition-all text-foreground"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-xl transition-all mt-6 cursor-pointer">
            {isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-medium hover:text-primary/80 focus:outline-none cursor-pointer">
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}
