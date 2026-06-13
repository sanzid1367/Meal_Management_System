'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Share2, Copy, Check, Loader2, Plus, X, FileText
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { format } from "date-fns";
import QRCode from 'qrcode';

import { api } from "../lib/api";
import type { Deposit, Expense, MealEntry, Member, ScheduleEntry, Summary } from "../types";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

const today = format(new Date(), "yyyy-MM-dd");

export default function App() {
  const [user, setUser] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'meals' | 'expenses' | 'deposits' | 'reports'>('dashboard');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [mealDate, setMealDate] = useState(today);
  const [mealEntries, setMealEntries] = useState<MealEntry[]>([]);
  const [draftMeals, setDraftMeals] = useState<Record<string, number>>({});

  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  const [isDepositModalOpen, setDepositModalOpen] = useState(false);
  const [isMemberModalOpen, setMemberModalOpen] = useState(false);
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState<{ local_ip: string; port: number; share_url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isSavingMeals, setIsSavingMeals] = useState(false);
  const [isClosingMonth, setIsClosingMonth] = useState(false);
  const [toastMessage, setToastMessage] = useState<{title: string, message?: string, type: 'success' | 'error'} | null>(null);

  const showToast = (title: string, message?: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ title, message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const activeMembers = useMemo(() => members.filter(m => m.is_active), [members]);
  const monthLabel = summary?.month.name ?? format(new Date(), "yyyy-MM");

  async function loadAll() {
    try {
      const [nextSummary, nextMembers, nextDeposits, nextExpenses, nextSchedule] = await Promise.all([
        api.summary(),
        api.members(true),
        api.deposits(),
        api.expenses(),
        api.schedule()
      ]);
      setSummary(nextSummary);
      setMembers(nextMembers);
      setDeposits(nextDeposits);
      setExpenses(nextExpenses);
      setSchedule(nextSchedule);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    loadAll();
  }, [user?.id]);

  useEffect(() => {
    api.shareInfo().then(setShareData).catch(console.error);
  }, []);

  const shareUrl = useMemo(() => {
    if (!shareData) return "";
    if (typeof window === 'undefined') return "";
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return isLocal ? shareData.share_url : window.location.origin;
  }, [shareData]);

  useEffect(() => {
    if (isShareModalOpen && shareUrl && qrCanvasRef.current) {
      const timer = setTimeout(() => {
        if (qrCanvasRef.current) {
          QRCode.toCanvas(
            qrCanvasRef.current,
            shareUrl,
            { width: 192, margin: 1, color: { dark: '#141413', light: '#faf9f5' } },
            (err) => { if (err) console.error("Failed to generate QR code", err); }
          );
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isShareModalOpen, shareUrl]);

  useEffect(() => {
    const dates = Array.from({ length: 15 }, (_, i) => format(new Date(new Date(mealDate).getTime() + (i - 7) * 86400000), "yyyy-MM-dd"));
    api.meals(dates[0], dates[14]).then((entries) => {
      setMealEntries(entries);
      const draft: Record<string, number> = {};
      entries.forEach((entry) => {
        draft[`${entry.date}:${entry.member_id}:${entry.meal_type}:count`] = entry.count;
        draft[`${entry.date}:${entry.member_id}:${entry.meal_type}:guest`] = entry.guest_count;
      });
      setDraftMeals(draft);
    }).catch(console.error);
  }, [mealDate]);

  function mealValue(date: string, memberId: number, mealType: "lunch" | "dinner", kind: "count" | "guest") {
    return draftMeals[`${date}:${memberId}:${mealType}:${kind}`] ?? 0;
  }

  function setMealValue(date: string, memberId: number, mealType: "lunch" | "dinner", kind: "count" | "guest", value: number) {
    const safeValue = Math.max(0, Math.round(value * 2) / 2);
    setDraftMeals((current) => ({ ...current, [`${date}:${memberId}:${mealType}:${kind}`]: safeValue }));
  }

  async function saveMealGrid() {
    setIsSavingMeals(true);
    const entries = activeMembers.flatMap((member) =>
      (["lunch", "dinner"] as const).map((meal_type) => ({
        member_id: member.id,
        date: mealDate,
        meal_type,
        count: mealValue(mealDate, member.id, meal_type, "count"),
        guest_count: mealValue(mealDate, member.id, meal_type, "guest")
      }))
    );
    try {
      await api.saveMeals(entries);
      const dates = Array.from({ length: 15 }, (_, i) => format(new Date(new Date(mealDate).getTime() + (i - 7) * 86400000), "yyyy-MM-dd"));
      const fresh = await api.meals(dates[0], dates[14]);
      setMealEntries(fresh);
      showToast("Meals Saved", "Successfully updated the daily meal grid.");
    } catch (e) {
      console.error(e);
      showToast("Error", "Failed to save meals.", "error");
    } finally {
      setIsSavingMeals(false);
    }
  }

  const expenseChartData = useMemo(() => {
    const grouped = expenses.reduce((acc, curr) => {
      const day = curr.date.split('-')[2];
      acc[day] = (acc[day] || 0) + curr.amount;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([day, cost]) => ({
      day: `${day} ${format(new Date(expenses[0]?.date || today), 'MMM')}`,
      cost
    }));
  }, [expenses]);
  
  // Custom button class based on Anthropic tokens
  const btnPrimary = "h-[40px] px-5 bg-[var(--primary)] text-[var(--on-primary)] font-medium rounded-md hover:bg-[var(--primary-active)] transition-colors inline-flex items-center justify-center gap-2";
  const btnSecondary = "h-[40px] px-5 bg-[var(--canvas)] text-[var(--ink)] font-medium border border-[var(--hairline)] rounded-md hover:bg-[var(--surface-soft)] transition-colors inline-flex items-center justify-center gap-2 text-[14px]";
  const inputClass = "h-[40px] px-[14px] py-[10px] bg-[var(--canvas)] text-[var(--ink)] border border-[var(--hairline)] rounded-md focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] w-full text-[14px]";

  const DashboardView = () => (
    <div className="space-y-[96px] animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Hero Band 6-6 Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-[48px] md:text-[64px] font-heading font-normal tracking-[-1.5px] leading-[1.05] text-[var(--ink)] mb-6">
            Manage your mess, <span className="text-[var(--primary)]">beautifully.</span>
          </h1>
          <p className="text-[18px] text-[var(--muted)] mb-8 max-w-md font-sans">
            A clear, editorial view of your monthly meals, expenses, and member balances.
          </p>
          <div className="flex gap-4">
            <button onClick={() => setActiveTab('meals')} className={btnPrimary}>
              Update Daily Meals
            </button>
            <button onClick={() => setActiveTab('expenses')} className={btnSecondary}>
              View Ledger
            </button>
          </div>
        </div>
        
        {/* Right side artifact - Mockup Card Dark */}
        <div className="bg-[var(--surface-dark)] rounded-[12px] p-[32px] text-[var(--on-dark)] dark-surface shadow-lg relative overflow-hidden">
          <div className="flex justify-between items-start mb-12 relative z-10">
            <div>
              <p className="text-[13px] text-[var(--on-dark-soft)] mb-1 font-mono uppercase tracking-widest">Total Expense</p>
              <h2 className="text-[36px] font-heading tracking-[-0.5px]">৳{summary?.totals.total_expense.toLocaleString() || 0}</h2>
            </div>
            <div className="text-right">
              <p className="text-[13px] text-[var(--on-dark-soft)] mb-1 font-mono uppercase tracking-widest">Meal Rate</p>
              <h2 className="text-[36px] font-heading text-[var(--primary)] tracking-[-0.5px]">৳{summary?.totals.meal_rate.toFixed(2) || 0}</h2>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-8 relative z-10">
            <div>
              <p className="text-[13px] text-[var(--on-dark-soft)] mb-1 font-mono">Cash in Hand</p>
              <p className="text-[28px] font-heading tracking-[-0.3px]">৳{summary?.totals.cash_in_hand.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-[13px] text-[var(--on-dark-soft)] mb-1 font-mono">Total Meals</p>
              <p className="text-[28px] font-heading tracking-[-0.3px]">{summary?.totals.total_meals.toFixed(1) || 0}</p>
            </div>
          </div>
          
          {/* Decorative code chrome */}
          <div className="mt-8 pt-6 border-t border-[var(--surface-dark-elevated)] flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--error)] opacity-50"></div>
            <div className="w-3 h-3 rounded-full bg-[var(--warning)] opacity-50"></div>
            <div className="w-3 h-3 rounded-full bg-[var(--success)] opacity-50"></div>
          </div>
        </div>
      </div>

      {/* Secondary bands */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-[var(--surface-card)] rounded-[12px] p-[32px] lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[22px] font-heading text-[var(--ink)] tracking-[-0.5px]">Expense Trend</h3>
            <button onClick={() => setActiveTab('expenses')} className="text-[14px] text-[var(--primary)] font-medium hover:underline">View details</button>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={expenseChartData.length ? expenseChartData : [{ day: '1', cost: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--hairline)" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} dx={-10} />
                <RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface-dark)', color: 'var(--on-dark)', border: 'none', borderRadius: '8px' }} itemStyle={{ color: 'var(--on-dark)' }} />
                <Line type="monotone" dataKey="cost" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: 'var(--canvas)', strokeWidth: 2, stroke: 'var(--primary)' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[var(--surface-card)] rounded-[12px] p-[32px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[22px] font-heading text-[var(--ink)] tracking-[-0.5px]">Balances</h3>
            <button onClick={() => setActiveTab('members')} className="text-[14px] text-[var(--primary)] font-medium hover:underline">View all</button>
          </div>
          <div className="space-y-4 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
            {(summary?.member_summaries || []).filter(m => m.is_active).sort((a, b) => a.balance - b.balance).map((member) => (
              <div key={member.id} className="flex justify-between items-center border-b border-[var(--hairline)] pb-3 last:border-0">
                <div>
                  <p className="text-[16px] font-medium text-[var(--ink)]">{member.name}</p>
                  <p className="text-[13px] text-[var(--muted)]">{member.total_meals} meals</p>
                </div>
                <div className="text-right">
                  <p className={`text-[16px] font-medium ${member.balance >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                    {member.balance >= 0 ? '+' : ''}৳{member.balance.toFixed(0)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const MembersView = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-[48px] font-heading tracking-[-1px] text-[var(--ink)] mb-2">Members</h2>
          <p className="text-[16px] text-[var(--muted)]">Manage individuals and view personal ledgers.</p>
        </div>
        {isAdmin && <button onClick={() => setMemberModalOpen(true)} className={btnPrimary}><Plus size={16}/> Add Member</button>}
      </div>

      <div className="bg-[var(--surface-card)] rounded-[12px] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-[14px] text-[var(--muted)] font-medium bg-[var(--surface-cream-strong)]">
              <th className="p-6">Name</th>
              <th className="p-6">Status</th>
              <th className="p-6">Deposits</th>
              <th className="p-6">Meals</th>
              <th className="p-6">Cost</th>
              <th className="p-6">Balance</th>
              <th className="p-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {(summary?.member_summaries || []).map(member => (
              <tr key={member.id} className="hover:bg-[var(--canvas)]/50 transition-colors">
                <td className="p-6">
                  <div className="text-[16px] font-medium text-[var(--ink)]">{member.name}</div>
                  <div className="text-[13px] text-[var(--muted)]">{member.phone || 'No phone'}</div>
                </td>
                <td className="p-6">
                  {member.is_active ? 
                    <span className="px-3 py-1 bg-[var(--success)]/10 text-[var(--success)] text-[12px] font-medium uppercase tracking-widest rounded-full">Active</span> : 
                    <span className="px-3 py-1 bg-[var(--muted)]/10 text-[var(--muted)] text-[12px] font-medium uppercase tracking-widest rounded-full">Inactive</span>
                  }
                </td>
                <td className="p-6 text-[16px] text-[var(--ink)]">৳{member.total_deposit}</td>
                <td className="p-6 text-[16px] text-[var(--ink)]">{member.total_meals}</td>
                <td className="p-6 text-[16px] text-[var(--ink)]">৳{member.meal_cost.toFixed(2)}</td>
                <td className="p-6">
                  <span className={`font-medium ${member.balance >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                    {member.balance >= 0 ? '+' : ''}৳{member.balance.toFixed(2)}
                  </span>
                </td>
                <td className="p-6 text-right">
                  {isAdmin && (
                    <button 
                      onClick={async () => {
                        if (member.is_active && !confirm(`Drop ${member.name}?`)) return;
                        await api.updateMember(member.id, { is_active: member.is_active ? 0 : 1 });
                        loadAll();
                      }}
                      className="text-[13px] font-medium text-[var(--muted)] hover:text-[var(--ink)] underline"
                    >
                      {member.is_active ? 'Drop' : 'Restore'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const MealsView = () => {
    const dates = Array.from({ length: 15 }, (_, i) => format(new Date(new Date(mealDate).getTime() + (i - 7) * 86400000), "yyyy-MM-dd"));
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-[48px] font-heading tracking-[-1px] text-[var(--ink)] mb-2">Meal Grid</h2>
            <p className="text-[16px] text-[var(--muted)]">Daily lunch and dinner tracking.</p>
          </div>
          <div className="flex gap-4">
            <input type="date" value={mealDate} onChange={e => setMealDate(e.target.value)} className={inputClass} style={{width: 'auto'}} />
            {isAdmin && <button disabled={isSavingMeals} onClick={saveMealGrid} className={btnPrimary}>
              {isSavingMeals ? <Loader2 className="animate-spin" size={16} /> : 'Save Meals'}
            </button>}
          </div>
        </div>

        <div className="bg-[var(--surface-dark)] text-[var(--on-dark)] rounded-[12px] p-[24px] overflow-hidden dark-surface">
          <div className="overflow-auto custom-scrollbar rounded-lg border border-[var(--surface-dark-elevated)]">
            <table className="w-full text-center border-collapse font-mono text-[14px]">
              <thead className="bg-[var(--surface-dark-elevated)] text-[var(--on-dark-soft)]">
                <tr>
                  <th className="p-3 border-b border-r border-[var(--surface-dark-elevated)] sticky left-0 bg-[var(--surface-dark-elevated)] z-20 text-left font-normal w-32">Date</th>
                  {activeMembers.map(member => (
                    <th key={member.id} colSpan={2} className="p-3 border-b border-r border-[var(--surface-dark-elevated)] font-normal truncate max-w-[120px]" title={member.name}>
                      {member.name}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="p-2 border-b border-r border-[var(--surface-dark-elevated)] sticky left-0 bg-[var(--surface-dark-elevated)] z-20"></th>
                  {activeMembers.map(member => (
                    <React.Fragment key={`${member.id}-sub`}>
                      <th className="p-1 border-b border-r border-[var(--surface-dark-elevated)] text-[11px] font-normal text-[var(--muted-soft)] bg-[var(--surface-dark-elevated)]/50 min-w-[60px]">L</th>
                      <th className="p-1 border-b border-r border-[var(--surface-dark-elevated)] text-[11px] font-normal text-[var(--muted-soft)] bg-[var(--surface-dark-elevated)]/50 min-w-[60px]">D</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-[var(--surface-dark)]">
                {dates.map(date => {
                  const dayNum = parseInt(date.split('-')[2]);
                  const isSelected = date === mealDate;
                  return (
                    <tr key={date} className={`hover:bg-[var(--surface-dark-elevated)]/50 transition-colors ${isSelected ? 'bg-[var(--surface-dark-elevated)] border-l-2 border-l-[var(--primary)]' : ''}`}>
                      <td className={`p-3 border-b border-r border-[var(--surface-dark-elevated)] text-left sticky left-0 bg-[var(--surface-dark)] z-10 ${isSelected ? 'text-[var(--primary)]' : 'text-[var(--on-dark)]'} font-sans`}>
                        {dayNum} <span className="text-[12px] opacity-50 uppercase tracking-wider ml-1">{format(new Date(date), "MMM")}</span>
                      </td>
                      {activeMembers.map(member => {
                        const renderInput = (type: 'lunch' | 'dinner', val: number) => {
                          if (!isSelected || !isAdmin) {
                            return <td className={`p-2 border-b border-r border-[var(--surface-dark-elevated)] ${val > 0 ? 'text-[var(--on-dark)]' : 'text-[var(--on-dark-soft)] opacity-30'}`}>{val > 0 ? val : '-'}</td>;
                          }
                          return (
                            <td className="p-1 border-b border-r border-[var(--surface-dark-elevated)] bg-[var(--surface-dark-elevated)]/30">
                              <input
                                type="number" step="0.5" min="0" value={val === 0 ? '' : val}
                                onChange={(e) => setMealValue(date, member.id, type, 'count', Number(e.target.value))}
                                className="w-full bg-[var(--surface-dark-soft)] text-[var(--on-dark)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] rounded p-1 text-center font-mono placeholder-[var(--on-dark-soft)]/30"
                                placeholder="-"
                              />
                            </td>
                          );
                        }
                        return (
                          <React.Fragment key={`${date}-${member.id}`}>
                            {renderInput('lunch', mealValue(date, member.id, 'lunch', 'count'))}
                            {renderInput('dinner', mealValue(date, member.id, 'dinner', 'count'))}
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const ExpensesView = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-[48px] font-heading tracking-[-1px] text-[var(--ink)] mb-2">Ledger</h2>
          <p className="text-[16px] text-[var(--muted)]">Track all daily market expenses.</p>
        </div>
        {isAdmin && <button onClick={() => setExpenseModalOpen(true)} className={btnPrimary}><Plus size={16}/> Add Expense</button>}
      </div>

      <div className="bg-[var(--surface-card)] rounded-[12px] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-[14px] text-[var(--muted)] font-medium bg-[var(--surface-cream-strong)]">
              <th className="p-6">Date</th>
              <th className="p-6">Description</th>
              <th className="p-6">Shopper</th>
              <th className="p-6 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(exp => (
              <tr key={exp.id} className="hover:bg-[var(--canvas)]/50 transition-colors">
                <td className="p-6 text-[14px] text-[var(--muted)]">{exp.date}</td>
                <td className="p-6 text-[16px] text-[var(--ink)]">{exp.description}</td>
                <td className="p-6 text-[15px] text-[var(--ink)]">{exp.shopper_name || '-'}</td>
                <td className="p-6 text-[16px] font-medium text-[var(--ink)] text-right">৳{exp.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const DepositsView = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-[48px] font-heading tracking-[-1px] text-[var(--ink)] mb-2">Deposits</h2>
          <p className="text-[16px] text-[var(--muted)]">Money collected from members.</p>
        </div>
        {isAdmin && <button onClick={() => setDepositModalOpen(true)} className={btnPrimary}><Plus size={16}/> Add Deposit</button>}
      </div>

      <div className="bg-[var(--surface-card)] rounded-[12px] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-[14px] text-[var(--muted)] font-medium bg-[var(--surface-cream-strong)]">
              <th className="p-6">Date</th>
              <th className="p-6">Member</th>
              <th className="p-6 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {deposits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(dep => (
              <tr key={dep.id} className="hover:bg-[var(--canvas)]/50 transition-colors">
                <td className="p-6 text-[14px] text-[var(--muted)]">{dep.date}</td>
                <td className="p-6 text-[16px] text-[var(--ink)]">{dep.member_name || 'Unknown'}</td>
                <td className="p-6 text-[16px] font-medium text-[var(--primary)] text-right">৳{dep.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const ReportsView = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-[48px] font-heading tracking-[-1px] text-[var(--ink)] mb-2">Report</h2>
          <p className="text-[16px] text-[var(--muted)]">Comprehensive summary for {monthLabel}.</p>
        </div>
        <div className="flex gap-4">
          <button onClick={async () => {
            try {
              const res = await fetch('/api/export/summary.csv');
              if (!res.ok) throw new Error("Failed to export CSV");
              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `mess-summary-${monthLabel}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
            } catch (err) {
              alert("Failed to export CSV");
            }
          }} className={btnSecondary}>
            <FileText size={16} /> Export CSV
          </button>
          
          {isAdmin && (
            <button disabled={isClosingMonth} onClick={async () => {
              if (confirm('Are you sure you want to close this month?')) {
                setIsClosingMonth(true);
                try {
                  await api.closeMonth();
                  await loadAll();
                  showToast("Month Closed", "A new month has been started.");
                } catch (err) {
                  showToast("Error", "Failed to close month.", "error");
                } finally {
                  setIsClosingMonth(false);
                }
              }
            }} className="h-[40px] px-5 bg-[var(--surface-dark)] text-[var(--on-dark)] font-medium rounded-md hover:bg-[var(--ink)] transition-colors disabled:opacity-50 inline-flex items-center gap-2">
              {isClosingMonth ? <Loader2 className="animate-spin" size={16} /> : 'Close Month'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[var(--surface-card)] rounded-lg p-6 border border-[var(--hairline)]">
          <p className="text-[13px] text-[var(--muted)] font-mono uppercase tracking-widest mb-2">Total Expenses</p>
          <h3 className="text-[28px] font-heading tracking-[-0.5px]">৳{summary?.totals?.total_expense?.toLocaleString() || 0}</h3>
        </div>
        <div className="bg-[var(--surface-card)] rounded-lg p-6 border border-[var(--hairline)]">
          <p className="text-[13px] text-[var(--muted)] font-mono uppercase tracking-widest mb-2">Total Deposits</p>
          <h3 className="text-[28px] font-heading tracking-[-0.5px]">৳{summary?.totals?.total_deposit?.toLocaleString() || 0}</h3>
        </div>
        <div className="bg-[var(--surface-card)] rounded-lg p-6 border border-[var(--hairline)]">
          <p className="text-[13px] text-[var(--muted)] font-mono uppercase tracking-widest mb-2">Total Meals</p>
          <h3 className="text-[28px] font-heading tracking-[-0.5px]">{summary?.totals?.total_meals?.toFixed(1) || 0}</h3>
        </div>
        <div className="bg-[var(--primary)]/10 rounded-lg p-6 border border-[var(--primary)]/20">
          <p className="text-[13px] text-[var(--primary)] font-mono uppercase tracking-widest mb-2">Meal Rate</p>
          <h3 className="text-[28px] font-heading text-[var(--primary)] tracking-[-0.5px]">৳{summary?.totals?.meal_rate?.toFixed(2) || 0}</h3>
        </div>
      </div>

      <div className="bg-[var(--surface-card)] rounded-[12px] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-[14px] text-[var(--muted)] font-medium bg-[var(--surface-cream-strong)]">
              <th className="p-6">Member Name</th>
              <th className="p-6 text-right">Opening Bal.</th>
              <th className="p-6 text-right">Deposits</th>
              <th className="p-6 text-center">Meals</th>
              <th className="p-6 text-right">Cost</th>
              <th className="p-6 text-right">Due/Refund</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {(summary?.member_summaries || []).filter(m => m.is_active || m.balance !== 0).map(member => (
              <tr key={member.id} className="hover:bg-[var(--canvas)]/50 transition-colors">
                <td className="p-6 text-[16px] font-medium text-[var(--ink)]">
                  {member.name} {!member.is_active && <span className="ml-2 text-[11px] text-[var(--muted)] uppercase tracking-wider">Inactive</span>}
                </td>
                <td className="p-6 text-[16px] text-[var(--muted)] text-right">৳{member.opening_balance?.toFixed(2) || 0}</td>
                <td className="p-6 text-[16px] text-[var(--primary)] font-medium text-right">৳{member.total_deposit?.toLocaleString() || 0}</td>
                <td className="p-6 text-[16px] text-[var(--ink)] text-center">{member.total_meals || 0}</td>
                <td className="p-6 text-[16px] text-[var(--ink)] text-right">৳{member.meal_cost?.toFixed(2) || 0}</td>
                <td className="p-6 text-right">
                  <span className={`font-medium ${member.balance >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                    {member.balance >= 0 ? '+' : ''}৳{member.balance?.toFixed(2) || 0}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--ink)] font-sans flex flex-col relative w-full">
      {/* Top Navigation */}
      <header className="h-[64px] bg-[var(--canvas)] border-b border-[var(--hairline)] px-6 md:px-12 flex items-center justify-between sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[var(--ink)] rounded-full flex items-center justify-center relative">
              <div className="w-full h-0.5 bg-[var(--canvas)] absolute"></div>
              <div className="h-full w-0.5 bg-[var(--canvas)] absolute"></div>
            </div>
            <span className="text-[18px] font-bold text-[var(--ink)] tracking-tight">MessSync</span>
          </div>
          <nav className="hidden md:flex gap-6">
            {(['dashboard', 'members', 'meals', 'expenses', 'deposits', 'reports'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)} 
                className={`text-[14px] font-medium capitalize transition-colors hover:text-[var(--ink)] ${activeTab === tab ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={() => setShareModalOpen(true)} className="hidden md:flex text-[14px] font-medium text-[var(--ink)] items-center gap-1.5 hover:text-[var(--primary)] transition-colors">
            <Share2 size={16} /> Share
          </button>
          <div className="flex items-center gap-4 border-l border-[var(--hairline)] pl-6">
            <span className="text-[14px] font-medium text-[var(--muted)] hidden sm:inline-block">{user ? `${user.username}` : 'Viewer'}</span>
            {user ? (
              <button onClick={() => { localStorage.removeItem("access_token"); localStorage.removeItem("user"); window.location.reload(); }} className={btnSecondary + " !h-[32px] !px-4 !text-[13px]"}>Logout</button>
            ) : (
              <button className={btnPrimary + " !h-[32px] !px-4 !text-[13px]"}>Sign in</button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1200px] mx-auto w-full px-6 py-[96px]">
          {activeTab === 'dashboard' && DashboardView()}
          {activeTab === 'members' && MembersView()}
          {activeTab === 'meals' && MealsView()}
          {activeTab === 'expenses' && ExpensesView()}
          {activeTab === 'deposits' && DepositsView()}
          {activeTab === 'reports' && ReportsView()}
        </div>
      </main>

      {/* Modals */}
      <Dialog open={isExpenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--canvas)] border-[var(--hairline)] rounded-[12px] p-8 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[24px] font-heading tracking-[-0.5px]">Add Expense</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            setExpenseModalOpen(false);
            try {
              await api.createExpense({
                date: formData.get("date") as string,
                amount: Number(formData.get("amount")),
                description: formData.get("description") as string,
                shopper_member_id: Number(formData.get("shopper_member_id")) || null
              });
              await loadAll();
              showToast("Expense Added");
            } catch (err) {
              showToast("Error", "Failed to record expense.", "error");
            }
          }}>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Date</label>
              <input name="date" type="date" defaultValue={today} className={inputClass} required />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Amount (৳)</label>
              <input name="amount" type="number" min="0" step="0.01" placeholder="0.00" className={inputClass} required />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Items Description</label>
              <input name="description" type="text" placeholder="Rice, Chicken, etc." className={inputClass} required />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Purchased By</label>
              <select name="shopper_member_id" className={inputClass}>
                <option value="">Select Shopper...</option>
                {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="pt-6 flex gap-3">
              <button type="button" className={btnSecondary + " flex-1"} onClick={() => setExpenseModalOpen(false)}>Cancel</button>
              <button type="submit" className={btnPrimary + " flex-1"}>Save</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDepositModalOpen} onOpenChange={setDepositModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--canvas)] border-[var(--hairline)] rounded-[12px] p-8 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[24px] font-heading tracking-[-0.5px]">Add Deposit</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            setDepositModalOpen(false);
            try {
              await api.createDeposit({
                date: formData.get("date") as string,
                amount: Number(formData.get("amount")),
                member_id: Number(formData.get("member_id")),
                note: ""
              });
              await loadAll();
              showToast("Deposit Added");
            } catch (err) {
              showToast("Error", "Failed to add deposit.", "error");
            }
          }}>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Date</label>
              <input name="date" type="date" defaultValue={today} className={inputClass} required />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Member</label>
              <select name="member_id" className={inputClass} required>
                <option value="">Select Member...</option>
                {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Amount (৳)</label>
              <input name="amount" type="number" min="0" step="0.01" placeholder="0.00" className={inputClass} required />
            </div>
            <div className="pt-6 flex gap-3">
              <button type="button" className={btnSecondary + " flex-1"} onClick={() => setDepositModalOpen(false)}>Cancel</button>
              <button type="submit" className={btnPrimary + " flex-1"}>Add</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isMemberModalOpen} onOpenChange={setMemberModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--canvas)] border-[var(--hairline)] rounded-[12px] p-8 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[24px] font-heading tracking-[-0.5px]">Add Member</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            setMemberModalOpen(false);
            try {
              await api.createMember({
                name: formData.get("name") as string,
                phone: formData.get("phone") as string,
                entry_date: formData.get("entry_date") as string
              });
              await loadAll();
              showToast("Member Added");
            } catch (err) {
              showToast("Error", "Failed to add member.", "error");
            }
          }}>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Name</label>
              <input name="name" type="text" className={inputClass} required />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Phone</label>
              <input name="phone" type="text" className={inputClass} />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[var(--ink)] mb-2">Entry Date</label>
              <input name="entry_date" type="date" defaultValue={today} className={inputClass} required />
            </div>
            <div className="pt-6 flex gap-3">
              <button type="button" className={btnSecondary + " flex-1"} onClick={() => setMemberModalOpen(false)}>Cancel</button>
              <button type="submit" className={btnPrimary + " flex-1"}>Add</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isShareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--canvas)] border-[var(--hairline)] rounded-[12px] p-8 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[24px] font-heading tracking-[-0.5px] flex items-center gap-2">
              <Share2 className="text-[var(--primary)]" size={24} /> Share
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-6">
            <p className="text-[14px] text-[var(--muted)]">Connect other members to this meal management system on your Local Network.</p>
            <div>
              <div className="flex gap-2">
                <input type="text" value={shareUrl || "Loading..."} readOnly className={inputClass + " bg-[var(--surface-card)] select-all"} />
                <button onClick={async () => {
                  if (!shareUrl) return;
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }} className={btnSecondary + " !px-4"}>
                  {copied ? <Check size={16} className="text-[var(--success)]" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            <div className="flex flex-col items-center p-6 bg-[var(--surface-card)] rounded-lg">
              <div className="bg-[var(--canvas)] p-3 rounded-xl border border-[var(--hairline)]">
                {shareUrl ? <canvas ref={qrCanvasRef} className="w-40 h-40" /> : <div className="w-40 h-40 flex items-center justify-center text-[var(--muted)] text-[13px]">Generating...</div>}
              </div>
              <p className="text-[13px] text-[var(--muted)] mt-4">Scan QR to open instantly</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-[var(--surface-dark)] text-[var(--on-dark)] px-6 py-4 rounded-lg shadow-2xl flex items-center gap-4">
            <div className={`w-2 h-2 rounded-full ${toastMessage.type === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}`}></div>
            <div>
              <p className="font-medium text-[14px]">{toastMessage.title}</p>
              {toastMessage.message && <p className="text-[13px] text-[var(--on-dark-soft)]">{toastMessage.message}</p>}
            </div>
            <button onClick={() => setToastMessage(null)} className="ml-4 text-[var(--on-dark-soft)] hover:text-[var(--on-dark)]"><X size={16}/></button>
          </div>
        </div>
      )}
    </div>
  );
}
