'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home, Users, Utensils, Receipt, Wallet, Calendar,
  Search, Bell, Settings, Plus, Minus, ChevronRight,
  MoreVertical, X, FileText, CalendarDays, Share2, Copy, Check, Loader2, Menu,
  Pencil, Trash2, Lock
} from 'lucide-react';
import { format } from "date-fns";
import QRCode from 'qrcode';
import dynamic from 'next/dynamic';

import { api } from "../lib/api";
import type { Deposit, Expense, MealEntry, Member, MemberSummary, ScheduleEntry, Summary } from "../types";

import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const ExpenseChart = dynamic(() => import('../components/ExpenseChart'), { ssr: false });

const today = format(new Date(), "yyyy-MM-dd");

const tabInfo = {
  dashboard: {
    title: "Dashboard Overview",
    subtitle: "Real-time summary of meals, expenditures, and current rates."
  },
  members: {
    title: "Mess Members",
    subtitle: "Manage member enrollment, contact details, and status."
  },
  meals: {
    title: "Daily Meal Grid",
    subtitle: "Record lunch and dinner entries for members and guests."
  },
  expenses: {
    title: "Bazar Expenses",
    subtitle: "Track daily grocery costs and shopper logs."
  },
  deposits: {
    title: "Member Deposits",
    subtitle: "Monitor deposit logs and incoming payments."
  },
  schedule: {
    title: "Bazar Schedule",
    subtitle: "Schedule member shopping duty dates and notes."
  },
  reports: {
    title: "Monthly Reports",
    subtitle: "Analyze complete logs, balances, and perform rollover."
  }
} as const;

export default function App() {
  const [user, setUser] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'meals' | 'expenses' | 'deposits' | 'schedule' | 'reports'>('dashboard');

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    }
    return false;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  // Real State from API
  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [mealDate, setMealDate] = useState(today);
  const [mealEntries, setMealEntries] = useState<MealEntry[]>([]);
  const [draftMeals, setDraftMeals] = useState<Record<string, number>>({});

  // Modals
  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  const [isDepositModalOpen, setDepositModalOpen] = useState(false);
  const [isEditDepositModalOpen, setEditDepositModalOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [isMemberModalOpen, setMemberModalOpen] = useState(false);
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState<{ local_ip: string; port: number; share_url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Loading & UX States
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
            {
              width: 192,
              margin: 1,
              color: {
                dark: '#0f172a',
                light: '#ffffff'
              }
            },
            (err) => {
              if (err) console.error("Failed to generate QR code", err);
            }
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
      showToast("Error", "Failed to save meals. Please try again.", "error");
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

  const DashboardView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="bg-gradient-to-br from-card/60 to-card/30 backdrop-blur-md border-border border rounded-lg">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-500/15 text-emerald-500 rounded-md">
                <Wallet size={24} />
              </div>
            </div>
            <p className="text-muted-foreground text-sm font-light mb-1">Total Deposits</p>
            <h2 className="text-3xl font-light text-foreground font-mono">৳{summary?.totals.total_deposit.toLocaleString() || 0}</h2>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card/60 to-card/30 backdrop-blur-md border-border border rounded-lg">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-primary/15 text-primary rounded-md">
                <Receipt size={24} />
              </div>
            </div>
            <p className="text-muted-foreground text-sm font-light mb-1">Total Expense</p>
            <h2 className="text-3xl font-light text-foreground font-mono">৳{summary?.totals.total_expense.toLocaleString() || 0}</h2>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card/60 to-card/30 backdrop-blur-md border-border border rounded-lg">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-chart-3/15 text-chart-3 rounded-md">
                <Wallet size={24} />
              </div>
            </div>
            <p className="text-muted-foreground text-sm font-light mb-1">Cash in Hand</p>
            <h2 className="text-3xl font-light text-foreground font-mono">৳{summary?.totals.cash_in_hand.toLocaleString() || 0}</h2>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card/60 to-card/30 backdrop-blur-md border-border border rounded-lg">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-chart-2/15 text-chart-2 rounded-md">
                <Utensils size={24} />
              </div>
            </div>
            <p className="text-muted-foreground text-sm font-light mb-1">Current Meal Rate</p>
            <h2 className="text-3xl font-light text-foreground font-mono">৳{summary?.totals.meal_rate.toFixed(2) || 0}</h2>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary to-primary/80 border-none text-white flex flex-col justify-between rounded-lg">
          <CardContent className="p-6 h-full flex flex-col justify-between">
            <div>
              <p className="text-white/80 text-sm font-light mb-1">Total Meals Served</p>
              <h2 className="text-4xl font-light font-mono">{summary?.totals.total_meals.toFixed(1) || 0}</h2>
            </div>
            <div className="mt-4">
              <button onClick={() => setActiveTab('meals')} className="text-sm bg-white/20 hover:bg-white/30 transition-colors py-2 px-4 rounded-lg w-full text-left flex justify-between items-center backdrop-blur-sm cursor-pointer">
                Update Daily Meals <ChevronRight size={16} />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart area */}
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-6 lg:col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-light text-foreground">Expense Trend ({format(new Date(expenses[0]?.date || today), 'MMM')})</h3>
            <button onClick={() => setActiveTab('expenses')} className="text-primary text-sm font-light hover:underline cursor-pointer">View Ledger</button>
          </div>
          <div className="flex-1 min-h-[250px]">
            <ExpenseChart data={expenseChartData} />
          </div>
        </Card>

        {/* Member Balances Mini-List */}
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-light text-foreground">Member Balances</h3>
            <button onClick={() => setActiveTab('members')} className="text-primary text-sm font-light hover:underline cursor-pointer">View All</button>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {(summary?.member_summaries || []).filter(m => m.is_active).sort((a, b) => a.balance - b.balance).map((member, i) => (
              <div 
                key={member.id} 
                onClick={() => setActiveTab('members')}
                className="flex items-center justify-between p-3 rounded-md hover:bg-secondary/50 transition-colors border border-transparent hover:border-border/50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-normal text-sm
                    ${i === 0 ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-foreground/80'}
                  `}>
                    {member.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-normal text-foreground">{member.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{member.total_meals} meals</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-normal font-mono ${member.balance >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                    {member.balance >= 0 ? '+' : ''}৳{member.balance.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground/80">Balance</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  const MembersView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-end items-center mb-6 shrink-0">
        <Button 
          onClick={() => {
            if (isAdmin) {
              setMemberModalOpen(true);
            } else {
              showToast("Admin Login Required", "Please sign in as an admin to add members.", "error");
            }
          }} 
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md cursor-pointer flex items-center gap-2"
        >
          {isAdmin ? <Plus size={18} /> : <Lock size={16} />} Add Member
        </Button>
      </div>

      <div className="bg-card/60 backdrop-blur-md border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-sm">
              <th className="p-4 font-light">Name</th>
              <th className="p-4 font-light">Status</th>
              <th className="p-4 font-light">Deposits</th>
              <th className="p-4 font-light">Meals</th>
              <th className="p-4 font-light">Total Cost</th>
              <th className="p-4 font-light">Balance</th>
              {isAdmin && <th className="p-4 font-light text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(summary?.member_summaries || []).map(member => (
              <tr 
                key={member.id} 
                onClick={() => {
                  if (!isAdmin) {
                    showToast("Admin Login Required", "Please sign in as an admin to manage members.", "error");
                  }
                }}
                className={`hover:bg-secondary/50 transition-colors ${!isAdmin ? 'cursor-pointer' : ''}`}
              >
                <td className="p-4">
                  <div className="font-normal text-foreground">{member.name}</div>
                  {isAdmin && member.phone && <div className="text-xs text-muted-foreground">{member.phone}</div>}
                </td>
                <td className="p-4">
                  {member.is_active ? <Badge className="bg-primary/15 text-primary hover:bg-primary/25" variant="secondary">Active</Badge> : <Badge className="bg-secondary text-foreground/90 hover:bg-secondary/80" variant="secondary">Inactive</Badge>}
                </td>
                <td className="p-4 font-light text-foreground/90 font-mono">৳{member.total_deposit}</td>
                <td className="p-4 text-foreground/80 font-mono">{member.total_meals}</td>
                <td className="p-4 text-foreground/80 font-mono">৳{member.meal_cost.toFixed(2)}</td>
                <td className="p-4">
                  <span className={`font-normal px-2 py-1 rounded-md font-mono ${member.balance >= 0 ? 'bg-chart-4/10 text-chart-4' : 'bg-destructive/10 text-destructive'}`}>
                    {member.balance >= 0 ? '+' : ''}৳{member.balance.toFixed(2)}
                  </span>
                </td>
                {isAdmin && (
                  <td className="p-4 text-right">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={async () => {
                        if (member.is_active) {
                          if (!confirm(`Are you sure you want to drop ${member.name}? They will be marked as inactive.`)) return;
                        }
                        await api.updateMember(member.id, { is_active: member.is_active ? 0 : 1 });
                        loadAll();
                      }} 
                      className={`text-xs rounded-lg transition-colors cursor-pointer ${member.is_active ? 'text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20' : 'text-primary hover:bg-primary/10 hover:text-primary/90 border-primary/20'}`}
                    >
                      {member.is_active ? 'Drop Member' : 'Restore Member'}
                    </Button>
                  </td>
                )}
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
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col flex-1 min-h-0">
        <div className="flex justify-end items-center gap-2 mb-6 shrink-0">
          <Input type="date" value={mealDate} onChange={e => setMealDate(e.target.value)} className="w-auto bg-card/60" />
          <Button 
            disabled={isAdmin && isSavingMeals} 
            onClick={() => {
              if (isAdmin) {
                saveMealGrid();
              } else {
                showToast("Admin Login Required", "Please sign in as an admin to edit and save meals.", "error");
              }
            }} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-all disabled:opacity-70 cursor-pointer flex items-center gap-2"
          >
            {isAdmin ? (isSavingMeals ? <Loader2 className="animate-spin" size={16} /> : 'Save') : <><Lock size={16} /> Save</>}
          </Button>
        </div>

        <div className="bg-card/60 backdrop-blur-md border border-border rounded-lg flex-1 overflow-hidden flex flex-col">
          <div className="overflow-auto custom-scrollbar flex-1">
            <table className="w-full text-center border-collapse min-w-[800px]">
              <thead className="sticky top-0 bg-card/90 backdrop-blur-md z-10">
                <tr>
                  <th className="p-3 border-b border-r border-border text-left sticky left-0 bg-card/90 backdrop-blur-md z-20 w-32">
                    <span className="text-sm font-light text-muted-foreground">Date</span>
                  </th>
                  {activeMembers.map(member => (
                    <th key={member.id} colSpan={2} className="p-2 border-b border-r border-border min-w-[140px]">
                      <div className="text-sm font-light text-foreground/90 truncate max-w-[140px]" title={member.name}>{member.name}</div>
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="p-2 border-b border-r border-border sticky left-0 bg-card/90 backdrop-blur-md z-20"></th>
                  {activeMembers.map(member => (
                    <React.Fragment key={`${member.id}-sub`}>
                      <th className="p-1 border-b border-r border-border/50 text-[10px] font-light text-muted-foreground bg-secondary/50 min-w-[70px]">L</th>
                      <th className="p-1 border-b border-r border-border text-[10px] font-light text-muted-foreground bg-secondary/50 min-w-[70px]">D</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map(date => {
                  const dayNum = parseInt(date.split('-')[2]);
                  const isSelected = date === mealDate;
                  return (
                    <tr key={date} className={`hover:bg-secondary/30 ${isSelected ? 'bg-primary/10' : ''}`}>
                      <td className={`p-3 border-b border-r border-border text-left sticky left-0 bg-card/90 font-light z-10 ${isSelected ? 'text-foreground' : 'text-foreground/90'}`}>
                        {dayNum} <span className="text-xs text-muted-foreground/80 font-normal uppercase">{format(new Date(date), "MMM")}</span>
                      </td>
                      {activeMembers.map(member => {
                        const lunchVal = mealValue(date, member.id, 'lunch', 'count');
                        const dinnerVal = mealValue(date, member.id, 'dinner', 'count');

                        return (
                          <React.Fragment key={`${date}-${member.id}`}>
                            {!isSelected || !isAdmin ? (
                              <td 
                                onClick={() => {
                                  if (!isAdmin) {
                                    showToast("Admin Login Required", "Please sign in as an admin to edit meals.", "error");
                                  }
                                }}
                                className={`p-2 border-b border-r border-border/50 ${lunchVal > 0 ? 'bg-secondary/50 text-foreground/90 font-light' : 'text-muted-foreground/80'} text-base cursor-pointer`}
                              >
                                {lunchVal > 0 ? lunchVal : '-'}
                              </td>
                            ) : (
                              <td className={`p-2 border-b border-r border-border/50 ${lunchVal > 0 ? 'bg-primary/20' : ''}`}>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={lunchVal === 0 ? '' : lunchVal}
                                  onChange={(e) => setMealValue(date, member.id, 'lunch', 'count', Number(e.target.value))}
                                  className="w-full min-w-[60px] h-8 text-center bg-transparent text-base focus:outline-none focus:bg-card focus:ring-2 focus:ring-primary rounded px-1 py-1 text-foreground font-light placeholder-muted-foreground/50"
                                  placeholder="-"
                                />
                              </td>
                            )}
                            {!isSelected || !isAdmin ? (
                              <td 
                                onClick={() => {
                                  if (!isAdmin) {
                                    showToast("Admin Login Required", "Please sign in as an admin to edit meals.", "error");
                                  }
                                }}
                                className={`p-2 border-b border-r border-border/50 ${dinnerVal > 0 ? 'bg-secondary/50 text-foreground/90 font-light' : 'text-muted-foreground/80'} text-base cursor-pointer`}
                              >
                                {dinnerVal > 0 ? dinnerVal : '-'}
                              </td>
                            ) : (
                              <td className={`p-2 border-b border-r border-border/50 ${dinnerVal > 0 ? 'bg-primary/20' : ''}`}>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={dinnerVal === 0 ? '' : dinnerVal}
                                  onChange={(e) => setMealValue(date, member.id, 'dinner', 'count', Number(e.target.value))}
                                  className="w-full min-w-[60px] h-8 text-center bg-transparent text-base focus:outline-none focus:bg-card focus:ring-2 focus:ring-primary rounded px-1 py-1 text-foreground font-light placeholder-muted-foreground/50"
                                  placeholder="-"
                                />
                              </td>
                            )}
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

  const ExpensesView = () => {
    const totalExpensesSum = expenses.reduce((acc, exp) => acc + exp.amount, 0);
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-end items-center mb-6 shrink-0">
          <Button 
            onClick={() => {
              if (isAdmin) {
                setExpenseModalOpen(true);
              } else {
                showToast("Admin Login Required", "Please sign in as an admin to record expenses.", "error");
              }
            }} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md cursor-pointer flex items-center gap-2"
          >
            {isAdmin ? <Plus size={18} /> : <Lock size={16} />} Add Expense
          </Button>
        </div>

        <div className="bg-card/60 backdrop-blur-md border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-sm bg-secondary/50">
                <th className="p-4 font-light">Date</th>
                <th className="p-4 font-light">Description</th>
                <th className="p-4 font-light">Shopper</th>
                <th className="p-4 font-light text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(exp => (
                <tr 
                  key={exp.id} 
                  onClick={() => {
                    if (!isAdmin) {
                      showToast("Admin Login Required", "Please sign in as an admin to manage expenses.", "error");
                    }
                  }}
                  className={`hover:bg-secondary/50 transition-colors ${!isAdmin ? 'cursor-pointer' : ''}`}
                >
                  <td className="p-4 text-foreground/80 whitespace-nowrap">{exp.date}</td>
                  <td className="p-4 text-foreground">{exp.description}</td>
                  <td className="p-4 text-foreground/80">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-secondary text-[10px] flex items-center justify-center font-light text-foreground/80">
                        {(exp.shopper_name || '?').substring(0, 2).toUpperCase()}
                      </span>
                      {exp.shopper_name || '-'}
                    </span>
                  </td>
                  <td className="p-4 font-light text-foreground text-right font-mono">৳{exp.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-secondary/30 font-light text-foreground">
                <td className="p-4">Total</td>
                <td className="p-4" colSpan={2}></td>
                <td className="p-4 text-right font-mono">৳{totalExpensesSum.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const DepositsView = () => {
    const totalDepositsSum = deposits.reduce((acc, dep) => acc + dep.amount, 0);
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-end items-center mb-6 shrink-0">
          <Button 
            onClick={() => {
              if (isAdmin) {
                setDepositModalOpen(true);
              } else {
                showToast("Admin Login Required", "Please sign in as an admin to add deposits.", "error");
              }
            }} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md cursor-pointer flex items-center gap-2"
          >
            {isAdmin ? <Plus size={18} /> : <Lock size={16} />} Add Deposit
          </Button>
        </div>

        <div className="bg-card/60 backdrop-blur-md border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-sm bg-secondary/50">
                <th className="p-4 font-light">Date</th>
                <th className="p-4 font-light">Member</th>
                <th className="p-4 font-light text-right">Amount</th>
                <th className="p-4 font-light text-center">Status</th>
                {isAdmin && <th className="p-4 font-light text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deposits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(dep => {
                return (
                  <tr 
                    key={dep.id} 
                    onClick={() => {
                      if (!isAdmin) {
                        showToast("Admin Login Required", "Please sign in as an admin to manage deposits.", "error");
                      }
                    }}
                    className={`hover:bg-secondary/50 transition-colors ${!isAdmin ? 'cursor-pointer' : ''}`}
                  >
                    <td className="p-4 text-foreground/80 whitespace-nowrap">{dep.date}</td>
                    <td className="p-4 font-light text-foreground">{dep.member_name || 'Unknown'}</td>
                    <td className="p-4 font-light text-foreground text-right font-mono">৳{dep.amount.toLocaleString()}</td>
                    <td className="p-4 text-center">
                      <Badge className="bg-chart-4/15 text-chart-4 hover:bg-chart-4/25" variant="secondary">Received</Badge>
                    </td>
                    {isAdmin && (
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                            onClick={() => {
                              setEditingDeposit(dep);
                              setEditDepositModalOpen(true);
                            }}
                          >
                            <Pencil size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                            onClick={async () => {
                              if (confirm(`Are you sure you want to delete this deposit of ৳${dep.amount} for ${dep.member_name}?`)) {
                                try {
                                  await api.deleteDeposit(dep.id);
                                  await loadAll();
                                  showToast("Deposit Deleted", "Member deposit was deleted successfully.");
                                } catch (err) {
                                  console.error(err);
                                  showToast("Error", "Failed to delete deposit.", "error");
                                }
                              }
                            }}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-secondary/30 font-light text-foreground">
                <td className="p-4">Total</td>
                <td className="p-4"></td>
                <td className="p-4 text-right font-mono">৳{totalDepositsSum.toLocaleString()}</td>
                <td className="p-4"></td>
                {isAdmin && <td className="p-4"></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const ReportsView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <div className="flex justify-end items-center mb-6 shrink-0">
        <Button onClick={async () => {
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
            console.error("Export failed", err);
            alert("Failed to export CSV");
          }
        }} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md">
          <FileText size={18} className="mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-light mb-1">Total Expenses</p>
          <h3 className="text-xl font-light text-foreground">৳{summary?.totals?.total_expense?.toLocaleString() || 0}</h3>
        </Card>
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-light mb-1">Total Deposits</p>
          <h3 className="text-xl font-light text-foreground">৳{summary?.totals?.total_deposit?.toLocaleString() || 0}</h3>
        </Card>
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-light mb-1">Total Meals</p>
          <h3 className="text-xl font-light text-foreground">{summary?.totals?.total_meals?.toFixed(1) || 0}</h3>
        </Card>
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-light mb-1">Meal Rate</p>
          <h3 className="text-xl font-light text-foreground">৳{summary?.totals?.meal_rate?.toFixed(2) || 0}</h3>
        </Card>
      </div>

      <div className="bg-card/60 backdrop-blur-md border border-border rounded-lg flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="sticky top-0 bg-card/90 backdrop-blur-md z-10">
              <tr className="border-b border-border text-muted-foreground text-sm">
                <th className="p-4 font-light">Member Name</th>
                <th className="p-4 font-light text-right">Opening Bal.</th>
                <th className="p-4 font-light text-right">Deposits</th>
                <th className="p-4 font-light text-center">Meals</th>
                <th className="p-4 font-light text-right">Per Person Cost</th>
                <th className="p-4 font-light text-right">Due/Refund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                const rows: React.ReactNode[] = [];
                for (const member of (summary?.member_summaries || [])) {
                  if (member.is_active || member.balance !== 0) {
                    rows.push(
                      <tr key={member.id} className="hover:bg-secondary/50 transition-colors">
                        <td className="p-4 font-normal text-foreground">
                          {member.name}
                          {!member.is_active && <Badge className="ml-2 bg-secondary text-muted-foreground text-[10px]" variant="secondary">Inactive</Badge>}
                        </td>
                        <td className="p-4 text-foreground/80 text-right font-mono">৳{member.opening_balance?.toFixed(2) || 0}</td>
                        <td className="p-4 text-foreground font-light text-right font-mono">৳{member.total_deposit?.toLocaleString() || 0}</td>
                        <td className="p-4 text-foreground/80 text-center font-mono">{member.total_meals || 0}</td>
                        <td className="p-4 text-foreground/80 text-right font-mono">৳{member.meal_cost?.toFixed(2) || 0}</td>
                        <td className="p-4 text-right">
                          <span className={`font-normal px-2 py-1 rounded-md font-mono ${member.balance >= 0 ? 'bg-chart-4/10 text-chart-4' : 'bg-destructive/10 text-destructive'}`}>
                            {member.balance >= 0 ? '+' : ''}৳{member.balance?.toFixed(2) || 0}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                }
                return rows;
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const SidebarItem = ({ id, icon: Icon, label }: { id: typeof activeTab, icon: any, label: string }) => {
    const active = activeTab === id;
    return (
      <button
        onClick={() => {
          setActiveTab(id);
          setIsMobileOpen(false);
        }}
        className={`transition-all duration-300 ease-in-out font-light rounded-md flex items-center gap-3 px-4 py-3 w-full cursor-pointer
          ${active ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
      >
        <Icon size={20} /> {label}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex overflow-hidden selection:bg-primary selection:text-primary-foreground relative w-full">


      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden cursor-pointer"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 md:static flex flex-col bg-sidebar/95 md:bg-sidebar/40 backdrop-blur-2xl border-r border-sidebar-border/50 transition-all duration-300 ease-in-out overflow-hidden
        ${isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
        ${isSidebarCollapsed ? 'md:w-0 md:opacity-0 md:-translate-x-full md:border-r-0' : 'md:w-64 md:opacity-100 md:translate-x-0'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-normal text-xl">
              M
            </div>
            <span className="text-xl font-extrabold tracking-tight text-foreground">Mess<span className="text-primary">Sync</span></span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileOpen(false)}
            className="md:hidden rounded-md hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X size={20} />
          </Button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <SidebarItem id="dashboard" icon={Home} label="Dashboard" />
          <SidebarItem id="members" icon={Users} label="Members" />
          <SidebarItem id="meals" icon={Utensils} label="Meals" />
          <SidebarItem id="expenses" icon={Receipt} label="Expenses" />
          <SidebarItem id="deposits" icon={Wallet} label="Deposits" />

          <div className="pt-6 pb-2">
            <p className="px-4 text-xs font-normal text-muted-foreground/80 uppercase tracking-wider">System</p>
          </div>
          <SidebarItem id="reports" icon={FileText} label="Reports" />
        </nav>

        <div className="p-4">
          <div className="bg-gradient-to-br from-primary to-primary/80 rounded-lg p-5 text-white relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/10 rounded-full blur-xl"></div>
            <p className="text-xs text-white/80 font-light mb-1">Month End</p>
            <h4 className="font-light text-sm mb-3">Close {monthLabel} &<br />Generate PDF</h4>
            <Button 
              disabled={isAdmin && isClosingMonth} 
              onClick={async () => {
                if (!isAdmin) {
                  showToast("Admin Login Required", "Please sign in as an admin to close the month.", "error");
                  return;
                }
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
              }} 
              className="bg-primary-foreground text-primary text-xs font-light w-full hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {!isAdmin && <Lock size={12} />}
              {isClosingMonth && isAdmin ? <><Loader2 className="animate-spin" size={12} /> Closing...</> : 'Close Month'}
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden z-10">
        <header className="h-20 bg-card/20 backdrop-blur-md border-b border-border/30 px-8 flex items-center justify-between sticky top-0 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  setIsMobileOpen(!isMobileOpen);
                } else {
                  toggleSidebar();
                }
              }}
              className="rounded-md hover:bg-secondary/80 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu size={20} />
            </Button>
            
            <div className="flex flex-col">
              <h1 className="text-lg font-light text-foreground leading-tight">
                {tabInfo[activeTab]?.title}
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {tabInfo[activeTab]?.subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
               <Button
                variant="outline"
                size="sm"
                onClick={() => setShareModalOpen(true)}
                className="rounded-md border-primary/20 text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground flex items-center gap-1.5 transition-all cursor-pointer animate-in fade-in"
              >
                <Share2 size={16} /> Share System
              </Button>
              <span className="text-sm font-light text-foreground/80 bg-card/50 px-3 py-1 rounded-md">{user ? `${user.username} (${user.role})` : 'Viewer Mode'}</span>
              {user && <Button variant="outline" size="sm" onClick={() => { localStorage.removeItem("access_token"); localStorage.removeItem("user"); window.location.reload(); }} className="rounded-md border-border text-foreground/80 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer">Logout</Button>}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 sm:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto h-full flex flex-col">
            {activeTab === 'dashboard' && DashboardView()}
            {activeTab === 'members' && MembersView()}
            {activeTab === 'meals' && MealsView()}
            {activeTab === 'expenses' && ExpensesView()}
            {activeTab === 'deposits' && DepositsView()}
            {activeTab === 'reports' && ReportsView()}
          </div>
        </div>
      </main>

      <Dialog open={isExpenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Add Daily Expense</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" action={async (formData: FormData) => {
            setExpenseModalOpen(false); // Optimistically close modal
            try {
              await api.createExpense({
                date: formData.get("date") as string,
                amount: Number(formData.get("amount")),
                description: formData.get("description") as string,
                shopper_member_id: Number(formData.get("shopper_member_id")) || null
              });
              await loadAll();
              showToast("Expense Added", "The expense was recorded successfully.");
            } catch (err) {
              console.error(err);
              showToast("Error", "Failed to record expense.", "error");
            }
          }}>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Date</label>
              <Input name="date" type="date" defaultValue={today} className="bg-secondary focus-visible:ring-primary rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Amount (৳)</label>
              <Input name="amount" type="number" min="0" step="0.01" placeholder="0.00" className="bg-secondary focus-visible:ring-primary rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Items Description</label>
              <Input name="description" type="text" placeholder="e.g., Rice, Chicken, Onion" className="bg-secondary focus-visible:ring-primary rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Purchased By</label>
              <Select name="shopper_member_id">
                <SelectTrigger className="bg-secondary focus-visible:ring-primary rounded-md">
                  <SelectValue placeholder="Select Shopper..." />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setExpenseModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md">Save Expense</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDepositModalOpen} onOpenChange={setDepositModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Add Member Deposit</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" action={async (formData: FormData) => {
            setDepositModalOpen(false); // Optimistically close
            try {
              await api.createDeposit({
                date: formData.get("date") as string,
                amount: Number(formData.get("amount")),
                member_id: Number(formData.get("member_id")),
                note: ""
              });
              await loadAll();
              showToast("Deposit Added", "Member deposit recorded successfully.");
            } catch (err) {
              console.error(err);
              showToast("Error", "Failed to add deposit.", "error");
            }
          }}>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Date</label>
              <Input name="date" type="date" defaultValue={today} className="bg-secondary focus-visible:ring-primary rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Member</label>
              <Select name="member_id" required>
                <SelectTrigger className="bg-secondary focus-visible:ring-primary rounded-md">
                  <SelectValue placeholder="Select Member..." />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Amount (৳)</label>
              <Input name="amount" type="number" min="0" step="0.01" placeholder="0.00" className="bg-secondary focus-visible:ring-primary rounded-md" required />
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setDepositModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md">Add Deposit</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDepositModalOpen} onOpenChange={setEditDepositModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Edit Member Deposit</DialogTitle>
          </DialogHeader>
          {editingDeposit && (
            <form className="space-y-4 mt-4" action={async (formData: FormData) => {
              setEditDepositModalOpen(false); // Optimistically close
              try {
                await api.updateDeposit(editingDeposit.id, {
                  date: formData.get("date") as string,
                  amount: Number(formData.get("amount")),
                  member_id: Number(formData.get("member_id")),
                  note: (formData.get("note") as string) || ""
                });
                await loadAll();
                showToast("Deposit Updated", "Member deposit updated successfully.");
              } catch (err) {
                console.error(err);
                showToast("Error", "Failed to update deposit.", "error");
              }
            }}>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Date</label>
                <Input name="date" type="date" defaultValue={editingDeposit.date} className="bg-secondary focus-visible:ring-primary rounded-md" required />
              </div>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Member</label>
                <Select name="member_id" defaultValue={editingDeposit.member_id.toString()} required>
                  <SelectTrigger className="bg-secondary focus-visible:ring-primary rounded-md">
                    <SelectValue placeholder="Select Member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeMembers.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Amount (৳)</label>
                <Input name="amount" type="number" min="0" step="0.01" defaultValue={editingDeposit.amount} className="bg-secondary focus-visible:ring-primary rounded-md" required />
              </div>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Note (Optional)</label>
                <Input name="note" type="text" defaultValue={editingDeposit.note || ""} placeholder="e.g., Cash, bKash" className="bg-secondary focus-visible:ring-primary rounded-md" />
              </div>
              <div className="pt-4 flex gap-3">
                <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setEditDepositModalOpen(false)}>Cancel</Button>
                <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md">Save Changes</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isMemberModalOpen} onOpenChange={setMemberModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" action={async (formData: FormData) => {
            setMemberModalOpen(false); // Optimistically close
            try {
              await api.createMember({
                name: formData.get("name") as string,
                phone: formData.get("phone") as string,
                entry_date: formData.get("entry_date") as string
              });
              await loadAll();
              showToast("Member Added", "New mess member joined successfully.");
            } catch (err) {
              console.error(err);
              showToast("Error", "Failed to add member.", "error");
            }
          }}>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Name</label>
              <Input name="name" type="text" className="bg-secondary focus-visible:ring-primary rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Phone</label>
              <Input name="phone" type="text" className="bg-secondary focus-visible:ring-primary rounded-md" />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Entry Date</label>
              <Input name="entry_date" type="date" defaultValue={today} className="bg-secondary focus-visible:ring-primary rounded-md" required />
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setMemberModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md">Add Member</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isShareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-light text-foreground flex items-center gap-2">
              <Share2 className="text-primary" size={20} />
              Share MessSync
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect other members to this meal management system. Make sure they are connected to the same <strong>Wi-Fi / Local Network (LAN)</strong>.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-normal text-muted-foreground uppercase tracking-wider">Access Link</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={shareUrl || "Loading link..."}
                  readOnly
                  className="flex-1 bg-secondary border-border text-foreground/90 font-light rounded-md select-all"
                />
                <Button
                  onClick={async () => {
                    if (!shareUrl) return;
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch (err) {
                      console.error("Failed to copy link", err);
                    }
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md px-4 flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center bg-secondary/50 rounded-lg p-6 border border-border/50 space-y-4">
              <span className="text-xs font-normal text-muted-foreground uppercase tracking-wider">Scan to Open on Mobile</span>
              <div className="bg-white p-3 rounded-lg border border-border/50 flex items-center justify-center">
                {shareUrl ? (
                  <canvas ref={qrCanvasRef} className="w-48 h-48 rounded-lg" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-muted-foreground/80 text-sm">
                    Generating QR Code...
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/80 text-center">
                Scan this QR code with your phone camera to open the application instantly.
              </p>
            </div>
            
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-md border-border hover:bg-secondary text-foreground/80 transition-colors cursor-pointer"
                onClick={() => setShareModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast Notification System */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`rounded-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] border p-4 pr-12 min-w-[300px] flex gap-3 backdrop-blur-md ${
            toastMessage.type === 'success' ? 'bg-card/90 border-primary/20 text-foreground' : 'bg-card/90 border-red-200 text-foreground'
          }`}>
            <div className={`mt-0.5 rounded-md p-1 h-fit shrink-0 ${toastMessage.type === 'success' ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>
              {toastMessage.type === 'success' ? <Check size={14} /> : <X size={14} />}
            </div>
            <div>
              <p className="font-normal text-sm">{toastMessage.title}</p>
              {toastMessage.message && <p className="text-xs text-muted-foreground mt-0.5">{toastMessage.message}</p>}
            </div>
            <button 
              onClick={() => setToastMessage(null)} 
              className="absolute right-4 top-4 text-muted-foreground/80 hover:text-foreground/80 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
