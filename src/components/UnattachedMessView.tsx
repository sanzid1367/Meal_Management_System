import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { User, Mess } from '../types';
import { Building2, Users, LogOut, Loader2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

interface UnattachedMessViewProps {
  user: User;
  onMessJoinedOrCreated: (user: User, mess: Mess) => void;
  onLogout: () => void;
  showToast: (title: string, message?: string, type?: 'success' | 'error') => void;
}

export function UnattachedMessView({
  user,
  onMessJoinedOrCreated,
  onLogout,
  showToast
}: UnattachedMessViewProps) {
  const [selectedMessId, setSelectedMessId] = useState<number | null>(null);
  const [availableMesses, setAvailableMesses] = useState<Array<{ id: number; name: string }>>([]);
  const [newMessName, setNewMessName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isRemoved = user.membership_status === 'removed';

  useEffect(() => {
    api.publicMesses()
      .then(list => {
        setAvailableMesses(list);
        if (list.length > 0) {
          setSelectedMessId(list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMessId || isJoining) return;
    setErrorMsg('');
    setIsJoining(true);
    try {
      // Re-register or attach to mess
      const res = await api.register({
        username: user.username,
        password: '', // Handled if account exists or updated
        role: 'member',
        mess_id: selectedMessId
      });
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('user', JSON.stringify(res.user));
      showToast("Joined Successfully!", "Connected to mess workspace.");
      onMessJoinedOrCreated(res.user, { id: selectedMessId, name: res.user.mess_name || 'Mess' } as any);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to join mess.");
      showToast("Join Failed", err.message || "Failed to join mess", "error");
    } finally {
      setIsJoining(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessName.trim() || isCreating) return;
    setErrorMsg('');
    setIsCreating(true);
    try {
      const res = await api.createMess({ name: newMessName.trim() });
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('user', JSON.stringify(res.user));
      showToast("Mess Created!", `Created "${res.mess.name}"`);
      onMessJoinedOrCreated(res.user, res.mess);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create mess.");
      showToast("Creation Failed", err.message || "Failed to create mess", "error");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-8 font-sans relative overflow-hidden">
      {/* Background visual accents */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-destructive/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-normal text-xl shadow-sm">
            M
          </div>
          <span className="text-xl font-extrabold tracking-tight text-foreground">Mess<span className="text-primary">Sync</span></span>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-card border border-border px-3 py-1.5 rounded-lg text-xs flex items-center gap-2">
            <span className="font-medium text-foreground">{user.username}</span>
            <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground border-border">
              {user.role}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 flex items-center gap-1.5"
          >
            <LogOut size={13} /> Logout
          </Button>
        </div>
      </header>

      {/* Main Hero & Action Cards */}
      <main className="max-w-4xl mx-auto w-full py-12 flex-1 flex flex-col justify-center">
        {/* Status Notice Banner */}
        <div className={`mb-8 p-5 rounded-xl border backdrop-blur-md transition-all ${
          isRemoved 
            ? 'bg-destructive/10 border-destructive/25 text-foreground' 
            : 'bg-secondary/60 border-border text-foreground'
        }`}>
          <div className="flex items-start gap-3.5">
            <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
              isRemoved ? 'bg-destructive/20 text-destructive' : 'bg-primary/15 text-primary'
            }`}>
              <AlertCircle size={20} />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-medium">
                {isRemoved 
                  ? "Membership Deactivated" 
                  : "You are currently not connected to a Mess workspace."}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isRemoved 
                  ? "Your account was deactivated in the previous mess. You can select another active mess workspace or create your own mess below."
                  : "To view daily meals, expenses, meal rates, and deposit balances, select your mess workspace or create a new one."}
              </p>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg text-center font-medium animate-in fade-in">
            {errorMsg}
          </div>
        )}

        {/* 2-Column Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card A: Join Existing Mess */}
          <Card className="bg-card/70 backdrop-blur-md border border-border rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-base font-medium text-foreground">Select Mess Workspace</h3>
                  <p className="text-xs text-muted-foreground">Connect with your roommates</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Choose the mess group your manager created to view meals and balance logs.
              </p>

              <form onSubmit={handleJoin} className="space-y-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Available Messes
                  </label>
                  {availableMesses.length > 0 ? (
                    <select
                      value={selectedMessId || availableMesses[0]?.id}
                      onChange={e => setSelectedMessId(Number(e.target.value))}
                      className="w-full bg-secondary/80 border border-border focus:border-primary rounded-md px-3.5 py-2 text-sm text-foreground outline-none"
                      disabled={isJoining}
                    >
                      {availableMesses.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No mess workspaces found.</p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={isJoining || !selectedMessId || availableMesses.length === 0}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-10 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isJoining ? <Loader2 className="animate-spin" size={14} /> : <ArrowRight size={14} />}
                  {isJoining ? "Connecting..." : "Enter Mess Workspace"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Card B: Create New Mess */}
          <Card className="bg-card/70 backdrop-blur-md border border-border rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-chart-2/15 text-chart-2 flex items-center justify-center">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-medium text-foreground">Create a New Mess</h3>
                  <p className="text-xs text-muted-foreground">Manage your own dining residence</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Start a fresh meal ledger. You will be assigned as the <strong>Mess Manager</strong> with full control over meals and finances.
              </p>

              <form onSubmit={handleCreate} className="space-y-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Mess / Flatshare Name
                  </label>
                  <Input
                    type="text"
                    required
                    value={newMessName}
                    onChange={e => setNewMessName(e.target.value)}
                    placeholder="e.g. Sunrise Dining"
                    className="bg-secondary/80 text-sm h-10"
                    disabled={isCreating}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isCreating || !newMessName.trim()}
                  className="w-full bg-secondary hover:bg-secondary/80 text-foreground border border-border h-10 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isCreating ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} className="text-primary" />}
                  {isCreating ? "Creating Mess..." : "Create Mess as Manager"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto w-full text-center py-4 border-t border-border/40 text-xs text-muted-foreground">
        MessSync Meal Management &copy; {new Date().getFullYear()} • Multi-Tenant Architecture
      </footer>
    </div>
  );
}
