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

  const btnPrimary = "h-[40px] px-5 bg-[var(--primary)] text-[var(--on-primary)] font-medium rounded-md hover:bg-[var(--primary-active)] transition-colors inline-flex items-center justify-center gap-2 w-full";
  const inputClass = "h-[40px] px-[14px] py-[10px] bg-[var(--canvas)] text-[var(--ink)] border border-[var(--hairline)] rounded-md focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] w-full text-[14px]";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--canvas)] font-sans px-4">
      <div className="w-full max-w-sm bg-[var(--surface-card)] p-8 rounded-[12px] shadow-sm border border-[var(--hairline)]">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[var(--ink)] rounded-full flex items-center justify-center mx-auto mb-6 relative">
             <div className="w-full h-0.5 bg-[var(--canvas)] absolute"></div>
             <div className="h-full w-0.5 bg-[var(--canvas)] absolute"></div>
          </div>
          <h2 className="text-[32px] font-heading tracking-[-0.5px] text-[var(--ink)]">{isLogin ? 'Welcome back' : 'Create account'}</h2>
          <p className="text-[14px] text-[var(--muted)] mt-1">MessSync Admin Access</p>
        </div>

        {error && <div className="mb-6 p-3 bg-[var(--error)]/10 border border-[var(--error)]/20 text-[var(--error)] text-[14px] rounded-md text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Username</label>
            <input 
              type="text" 
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              className={inputClass}
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className={btnPrimary + " mt-2"}>
            {isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-8 text-center text-[14px] text-[var(--muted)] border-t border-[var(--hairline)] pt-6">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-[var(--primary)] font-medium hover:underline focus:outline-none">
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}
