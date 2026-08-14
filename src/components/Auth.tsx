import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Loader2, Building2, UserPlus, LogIn, Users, Shield } from 'lucide-react';
import { User } from '../types';

export function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration state
  const [regRole, setRegRole] = useState<'manager' | 'member'>('manager');
  const [messName, setMessName] = useState('');
  const [selectedMessId, setSelectedMessId] = useState<number | null>(null);
  const [availableMesses, setAvailableMesses] = useState<Array<{ id: number; name: string }>>([]);
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLogin && regRole === 'member') {
      api.publicMesses()
        .then(list => {
          setAvailableMesses(list);
          if (list.length > 0 && !selectedMessId) {
            setSelectedMessId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isLogin, regRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isLogin) {
        const res = await api.login(username.trim(), password);
        localStorage.setItem('access_token', res.access_token);
        localStorage.setItem('user', JSON.stringify(res.user));
        onLogin(res.user);
      } else {
        const payload: {
          username: string;
          password: string;
          role: string;
          mess_name?: string;
          mess_id?: number | null;
        } = {
          username: username.trim(),
          password,
          role: regRole
        };

        if (regRole === 'manager') {
          if (!messName.trim()) {
            throw new Error('Please enter a name for your Mess workspace.');
          }
          payload.mess_name = messName.trim();
        } else {
          if (!selectedMessId && availableMesses.length > 0) {
            payload.mess_id = availableMesses[0].id;
          } else {
            payload.mess_id = selectedMessId;
          }
        }

        const res = await api.register(payload);
        if (res.access_token) {
          localStorage.setItem('access_token', res.access_token);
          localStorage.setItem('user', JSON.stringify(res.user));
          onLogin(res.user);
        } else {
          setIsLogin(true);
          setSuccessMsg('Account created successfully! Please sign in.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden font-sans p-4">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-chart-2 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
      
      <div className="w-full max-w-md bg-card/90 backdrop-blur-xl p-8 rounded-xl shadow-2xl border border-border relative z-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center text-primary-foreground mx-auto mb-3 shadow-md">
             <Building2 size={28} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {isLogin ? 'Welcome Back' : 'Create an Account'}
          </h2>
          <p className="text-muted-foreground text-xs mt-1">MessSync • Multi-Mess Meal Management</p>
        </div>

        {/* Mode Toggle (Sign In vs Register) */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-secondary/70 rounded-lg mb-6 border border-border">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(''); setSuccessMsg(''); }}
            className={`py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
              isLogin ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LogIn size={14} /> Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(''); setSuccessMsg(''); }}
            className={`py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
              !isLogin ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserPlus size={14} /> Sign Up
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg text-center font-medium">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-3 bg-primary/10 border border-primary/20 text-primary text-sm rounded-lg text-center font-medium">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-3 pb-2 border-b border-border/50">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Select Your Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRegRole('manager')}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col gap-1 ${
                    regRole === 'manager'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:border-border/80'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <Shield size={14} className="text-primary" /> Manager
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">Create a new Mess workspace</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRegRole('member')}
                  className={`p-3 rounded-lg border text-left transition-all flex flex-col gap-1 ${
                    regRole === 'member'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:border-border/80'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <Users size={14} className="text-primary" /> Member
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">Join an existing Mess</span>
                </button>
              </div>

              {regRole === 'manager' ? (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Mess Name</label>
                  <input 
                    type="text" 
                    required
                    value={messName}
                    onChange={e => setMessName(e.target.value)}
                    className="w-full bg-secondary border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-md px-3.5 py-2 outline-none transition-all text-foreground text-sm"
                    placeholder="e.g. Green Villa Dining"
                    disabled={loading}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">This will be your shared mess name for all members.</p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Select Mess Workspace</label>
                  {availableMesses.length > 0 ? (
                    <select
                      value={selectedMessId || availableMesses[0]?.id}
                      onChange={e => setSelectedMessId(Number(e.target.value))}
                      className="w-full bg-secondary border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-md px-3.5 py-2 outline-none transition-all text-foreground text-sm cursor-pointer"
                      disabled={loading}
                    >
                      {availableMesses.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-muted-foreground italic py-1">
                      No messes registered yet. Ask your manager to create one first.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              {isLogin ? 'Username' : regRole === 'manager' ? 'Manager Username' : 'Your Name / Username'}
            </label>
            <input 
              type="text" 
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-secondary border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-md px-3.5 py-2 outline-none transition-all text-foreground text-sm"
              placeholder={isLogin ? 'e.g. rahim or manager' : 'e.g. rahim'}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-secondary border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-md px-3.5 py-2 outline-none transition-all text-foreground text-sm"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-md transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer mt-2 text-sm disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : isLogin ? (
              <>
                <LogIn size={16} /> Sign In
              </>
            ) : (
              <>
                <UserPlus size={16} /> {regRole === 'manager' ? 'Create Mess & Sign Up' : 'Join Mess & Sign Up'}
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-border/50 text-center text-xs text-muted-foreground">
          {isLogin ? (
            <p>
              Need to create a new mess?{' '}
              <button 
                type="button" 
                onClick={() => { setIsLogin(false); setRegRole('manager'); }}
                className="text-primary hover:underline font-medium"
              >
                Create Mess
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button 
                type="button" 
                onClick={() => setIsLogin(true)}
                className="text-primary hover:underline font-medium"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
