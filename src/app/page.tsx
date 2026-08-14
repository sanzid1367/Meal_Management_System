'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Users, Utensils, Receipt, Wallet, Calendar,
  Plus, ChevronRight, X, FileText, CalendarDays, Share2, Copy, Check, Loader2, Menu,
  Pencil, Trash2, KeyRound, Building2, Shield, LogIn, LogOut, ArrowRight, CheckCircle2, Sparkles
} from 'lucide-react';
import { format } from "date-fns";
import QRCode from 'qrcode';
import dynamic from 'next/dynamic';

import { api } from "../lib/api";
import type { Deposit, Expense, MealEntry, Member, MemberSummary, ScheduleEntry, Summary, User, Mess } from "../types";
import { Auth } from "../components/Auth";
import { UnattachedMessView } from "../components/UnattachedMessView";

import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const ExpenseChart = dynamic(() => import('../components/ExpenseChart'), { ssr: false });

const today = format(new Date(), "yyyy-MM-dd");

const tabInfo: Record<string, { title: string; subtitle: string }> = {
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
  },
  messes: {
    title: "Platform Messes",
    subtitle: "Super Admin overview of all registered tenant groups."
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });

  const isSuperAdmin = user?.role === 'super_admin';
  const isManager = user?.role === 'manager' || isSuperAdmin;
  const isMember = user?.role === 'member';
  const isAdmin = isManager; // Backward compatibility

  const pathname = usePathname();
  const router = useRouter();
  const currentTab = useMemo<'dashboard' | 'members' | 'meals' | 'expenses' | 'deposits' | 'schedule' | 'reports' | 'messes'>(() => {
    if (!pathname || pathname === '/') return 'dashboard';
    const clean = pathname.replace(/^\//, '').split('/')[0];
    if (['dashboard', 'members', 'meals', 'expenses', 'deposits', 'schedule', 'reports', 'messes'].includes(clean)) {
      return clean as any;
    }
    return 'dashboard';
  }, [pathname]);

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
  const [allMesses, setAllMesses] = useState<Mess[]>([]);

  // Modals
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [isMessModalOpen, setMessModalOpen] = useState(false);
  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  const [isEditExpenseModalOpen, setEditExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isDepositModalOpen, setDepositModalOpen] = useState(false);
  const [isEditDepositModalOpen, setEditDepositModalOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [isMemberModalOpen, setMemberModalOpen] = useState(false);
  const [isScheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(today);
  const [scheduleMemberId, setScheduleMemberId] = useState<string>('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState<{ local_ip: string; port: number; share_url: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // New Mess Form States
  const [newMessName, setNewMessName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isCreatingMess, setIsCreatingMess] = useState(false);
  const [isJoiningMess, setIsJoiningMess] = useState(false);
  // Loading & UX States
  const [isSavingMeals, setIsSavingMeals] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isClosingMonth, setIsClosingMonth] = useState(false);
  const [toastMessage, setToastMessage] = useState<{title: string, message?: string, type: 'success' | 'error'} | null>(null);
  const [updatingMembers, setUpdatingMembers] = useState<Record<number, boolean>>({});
  const [deletingDeposits, setDeletingDeposits] = useState<Record<number, boolean>>({});
  const [deletingExpenses, setDeletingExpenses] = useState<Record<number, boolean>>({});
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [isUpdatingExpense, setIsUpdatingExpense] = useState(false);
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);
  const [isUpdatingDeposit, setIsUpdatingDeposit] = useState(false);
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  const showToast = (title: string, message?: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ title, message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const activeMembers = useMemo(() => members.filter(m => m.is_active), [members]);
  const monthLabel = summary?.month?.name ?? format(new Date(), "yyyy-MM");

  const displayMembers = useMemo(() => {
    if (summary?.member_summaries && summary.member_summaries.length > 0) {
      return summary.member_summaries;
    }
    if (members && members.length > 0) {
      return members.map(m => ({
        id: Number(m.id),
        name: m.name,
        phone: m.phone,
        is_active: Number(m.is_active),
        opening_balance: 0,
        total_deposit: 0,
        total_member_meals: 0,
        total_guest_meals: 0,
        total_meals: 0,
        meal_cost: 0,
        available_funds: 0,
        balance: 0
      }));
    }
    return [];
  }, [summary, members]);

  // Personal Member Summary (if current user corresponds to a member)
  const personalSummary = useMemo(() => {
    if (!user || !summary?.member_summaries) return null;
    return summary.member_summaries.find(
      m => (user.member_id && m.id === user.member_id) || m.name.toLowerCase() === user.username.toLowerCase()
    ) || null;
  }, [user, summary]);

  async function loadAll() {
    try {
      // Check fresh membership status from server
      if (typeof window !== 'undefined' && localStorage.getItem("access_token")) {
        try {
          const me = await api.me();
          if (me) {
            setUser(me);
            localStorage.setItem('user', JSON.stringify(me));
            if (me.role !== 'super_admin' && (me.membership_status === 'removed' || me.membership_status === 'unattached' || !me.mess_id)) {
              setSummary(null);
              return;
            }
          }
        } catch (authErr) {
          console.warn("Auth status check failed:", authErr);
        }
      }

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

      if (isSuperAdmin) {
        const messesRes = await api.getMess();
        if (Array.isArray(messesRes)) {
          setAllMesses(messesRes);
        }
      }
    } catch (e: any) {
      if (e?.message?.includes("MEMBERSHIP_INACTIVE") || e?.message?.includes("deactivated") || e?.message?.includes("not attached")) {
        setUser(prev => prev ? { ...prev, membership_status: 'removed' } : null);
        showToast("Access Restricted", "You are no longer an active member of this mess.", "error");
      }
      console.error(e);
    }
  }

  useEffect(() => {
    loadAll();
  }, [user?.id, user?.mess_id]);

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
  }, [mealDate, user?.mess_id]);

  function mealValue(date: string, memberId: number, mealType: "lunch" | "dinner", kind: "count" | "guest") {
    return draftMeals[`${date}:${memberId}:${mealType}:${kind}`] ?? 0;
  }

  function setMealValue(date: string, memberId: number, mealType: "lunch" | "dinner", kind: "count" | "guest", value: number) {
    const safeValue = Math.max(0, Math.round(value * 2) / 2);
    setDraftMeals((current) => ({ ...current, [`${date}:${memberId}:${mealType}:${kind}`]: safeValue }));
  }

  async function saveMealGrid() {
    if (isSavingMeals) return;
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

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    setUser(null);
    window.location.reload();
  };

  const DashboardView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Personal Member Highlights (if logged in as member) */}
      {personalSummary && (
        <Card className="bg-gradient-to-r from-primary/15 via-primary/5 to-card backdrop-blur-md border border-primary/20 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-normal text-lg">
                {personalSummary.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-normal text-foreground">Welcome back, {personalSummary.name}!</h3>
                  <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-primary">Your Account</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {summary?.mess ? summary.mess.name : "Your Mess Group"} • {monthLabel} Cycle
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 w-full sm:w-auto text-left sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-border/60">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Your Meals</p>
                <p className="text-lg font-light font-mono text-foreground">{personalSummary.total_meals}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Deposits</p>
                <p className="text-lg font-light font-mono text-foreground">৳{personalSummary.total_deposit}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Net Balance</p>
                <p className={`text-lg font-medium font-mono ${personalSummary.balance >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                  {personalSummary.balance >= 0 ? '+' : ''}৳{personalSummary.balance.toFixed(1)}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

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
              <Link href="/meals" className="text-sm bg-white/20 hover:bg-white/30 transition-colors py-2 px-4 rounded-lg w-full text-left flex justify-between items-center backdrop-blur-sm cursor-pointer">
                Update Daily Meals <ChevronRight size={16} />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart area */}
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-6 lg:col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-light text-foreground">Expense Trend ({format(new Date(expenses[0]?.date || today), 'MMM')})</h3>
            <Link href="/expenses" className="text-primary text-sm font-light hover:underline cursor-pointer">View Ledger</Link>
          </div>
          <div className="flex-1 min-h-[250px]">
            <ExpenseChart data={expenseChartData} />
          </div>
        </Card>

        {/* Member Balances Mini-List */}
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-light text-foreground">Member Balances</h3>
            <Link href="/members" className="text-primary text-sm font-light hover:underline cursor-pointer">View All</Link>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {(summary?.member_summaries || []).filter(m => m.is_active).sort((a, b) => a.balance - b.balance).map((member, i) => (
              <Link 
                key={member.id} 
                href="/members"
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
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  const MembersView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <p className="text-sm text-muted-foreground">
          {activeMembers.length} active members enrolled in this mess.
        </p>
        {isManager && (
          <Button 
            onClick={() => setMemberModalOpen(true)} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md cursor-pointer flex items-center gap-2"
          >
            <Plus size={18} /> Add Member
          </Button>
        )}
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
              {isManager && <th className="p-4 font-light text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayMembers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">
                  No members found in this mess. {isManager && "Click '+ Add Member' above to enroll members or ask members to sign up!"}
                </td>
              </tr>
            ) : (
              displayMembers.map(member => (
              <tr 
                key={member.id} 
                onClick={() => {
                  if (!isManager) {
                    showToast("Manager Required", "Mess Manager permission needed to manage members.", "error");
                  }
                }}
                className={`hover:bg-secondary/50 transition-colors ${!isManager ? 'cursor-pointer' : ''}`}
              >
                <td className="p-4">
                  <div className="font-normal text-foreground">{member.name}</div>
                  {(isManager || user?.member_id === member.id) && member.phone && (
                    <div className="text-xs text-muted-foreground">{member.phone}</div>
                  )}
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
                {isManager && (
                  <td className="p-4 text-right">
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={updatingMembers[member.id]}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (updatingMembers[member.id]) return;
                        if (member.is_active) {
                          if (!confirm(`Are you sure you want to drop ${member.name}? They will be marked as inactive.`)) return;
                        }
                        setUpdatingMembers(prev => ({ ...prev, [member.id]: true }));
                        try {
                          await api.updateMember(member.id, { is_active: member.is_active ? 0 : 1 });
                          await loadAll();
                          showToast(member.is_active ? "Member Deactivated" : "Member Restored");
                        } catch (err) {
                          showToast("Error", "Failed to update member.", "error");
                        } finally {
                          setUpdatingMembers(prev => ({ ...prev, [member.id]: false }));
                        }
                      }} 
                      className={`text-xs rounded-lg transition-colors cursor-pointer ${member.is_active ? 'text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20' : 'text-primary hover:bg-primary/10 hover:text-primary/90 border-primary/20'}`}
                    >
                      {updatingMembers[member.id] && <Loader2 className="animate-spin mr-1.5" size={12} />}
                      {member.is_active ? 'Drop Member' : 'Restore Member'}
                    </Button>
                  </td>
                )}
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const MealsView = () => {
    const dates = Array.from({ length: 15 }, (_, i) => format(new Date(new Date(mealDate).getTime() + (i - 7) * 86400000), "yyyy-MM-dd"));

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col flex-1 min-h-0">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <p className="text-xs text-muted-foreground">
            {isManager ? 'Select a date and enter meal counts (0.5 increments). Click Save to sync.' : 'View-only meal ledger for this month.'}
          </p>
          <div className="flex items-center gap-2">
            <Input type="date" value={mealDate} onChange={e => setMealDate(e.target.value)} className="w-auto bg-card/60" />
            {isManager && (
              <Button 
                disabled={isSavingMeals} 
                onClick={saveMealGrid} 
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-all disabled:opacity-70 cursor-pointer flex items-center gap-2"
              >
                {isSavingMeals ? <Loader2 className="animate-spin" size={16} /> : 'Save Meals'}
              </Button>
            )}
          </div>
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
                            {!isSelected || !isManager ? (
                              <td 
                                onClick={() => {
                                  if (!isManager) {
                                    showToast("Manager Required", "Sign in as Mess Manager to edit meal logs.", "error");
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
                            {!isSelected || !isManager ? (
                              <td 
                                onClick={() => {
                                  if (!isManager) {
                                    showToast("Manager Required", "Sign in as Mess Manager to edit meal logs.", "error");
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
        <div className="flex justify-between items-center mb-6 shrink-0">
          <p className="text-sm text-muted-foreground">
            Total Bazar Logged: <strong className="text-foreground">৳{totalExpensesSum.toLocaleString()}</strong>
          </p>
          {isManager && (
            <Button 
              onClick={() => setExpenseModalOpen(true)} 
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md cursor-pointer flex items-center gap-2"
            >
              <Plus size={18} /> Add Expense
            </Button>
          )}
        </div>

        <div className="bg-card/60 backdrop-blur-md border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-sm bg-secondary/50">
                <th className="p-4 font-light">Date</th>
                <th className="p-4 font-light">Description</th>
                <th className="p-4 font-light">Shopper</th>
                <th className="p-4 font-light text-right">Amount</th>
                {isManager && <th className="p-4 font-light text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map(exp => (
                <tr key={exp.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="p-4 font-light text-foreground">{exp.date}</td>
                  <td className="p-4 font-light text-foreground">{exp.description}</td>
                  <td className="p-4 font-light text-foreground/80">{exp.shopper_name || 'General'}</td>
                  <td className="p-4 font-light text-right text-foreground font-mono">৳{exp.amount.toLocaleString()}</td>
                  {isManager && (
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            setEditingExpense(exp);
                            setEditExpenseModalOpen(true);
                          }}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          disabled={deletingExpenses[exp.id]}
                          onClick={async () => {
                            if (deletingExpenses[exp.id]) return;
                            if (confirm(`Delete expense "${exp.description}" of ৳${exp.amount}?`)) {
                              setDeletingExpenses(prev => ({ ...prev, [exp.id]: true }));
                              try {
                                await api.deleteExpense(exp.id);
                                await loadAll();
                                showToast("Expense Deleted");
                              } catch (err) {
                                showToast("Error", "Failed to delete expense.", "error");
                              } finally {
                                setDeletingExpenses(prev => ({ ...prev, [exp.id]: false }));
                              }
                            }
                          }}
                          className="h-8 w-8 text-destructive/80 hover:text-destructive"
                        >
                          {deletingExpenses[exp.id] ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-secondary/30 font-light text-foreground">
                <td className="p-4 font-medium">Total</td>
                <td className="p-4"></td>
                <td className="p-4"></td>
                <td className="p-4 text-right font-mono font-medium">৳{totalExpensesSum.toLocaleString()}</td>
                {isManager && <td className="p-4"></td>}
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
        <div className="flex justify-between items-center mb-6 shrink-0">
          <p className="text-sm text-muted-foreground">
            Total Deposits Collected: <strong className="text-foreground">৳{totalDepositsSum.toLocaleString()}</strong>
          </p>
          {isManager && (
            <Button 
              onClick={() => setDepositModalOpen(true)} 
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md cursor-pointer flex items-center gap-2"
            >
              <Plus size={18} /> Add Deposit
            </Button>
          )}
        </div>

        <div className="bg-card/60 backdrop-blur-md border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-sm bg-secondary/50">
                <th className="p-4 font-light">Date</th>
                <th className="p-4 font-light">Member</th>
                <th className="p-4 font-light text-right">Amount</th>
                <th className="p-4 font-light">Note</th>
                {isManager && <th className="p-4 font-light text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deposits.map(dep => (
                <tr key={dep.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="p-4 font-light text-foreground">{dep.date}</td>
                  <td className="p-4 font-light text-foreground">{dep.member_name}</td>
                  <td className="p-4 font-light text-right text-foreground font-mono">৳{dep.amount.toLocaleString()}</td>
                  <td className="p-4 font-light text-muted-foreground text-sm">{dep.note || '-'}</td>
                  {isManager && (
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            setEditingDeposit(dep);
                            setEditDepositModalOpen(true);
                          }}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          disabled={deletingDeposits[dep.id]}
                          onClick={async () => {
                            if (deletingDeposits[dep.id]) return;
                            if (confirm(`Delete deposit of ৳${dep.amount} for ${dep.member_name}?`)) {
                              setDeletingDeposits(prev => ({ ...prev, [dep.id]: true }));
                              try {
                                await api.deleteDeposit(dep.id);
                                await loadAll();
                                showToast("Deposit Deleted");
                              } catch (err) {
                                showToast("Error", "Failed to delete deposit.", "error");
                              } finally {
                                setDeletingDeposits(prev => ({ ...prev, [dep.id]: false }));
                              }
                            }
                          }}
                          className="h-8 w-8 text-destructive/80 hover:text-destructive"
                        >
                          {deletingDeposits[dep.id] ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-secondary/30 font-light text-foreground">
                <td className="p-4 font-medium">Total</td>
                <td className="p-4"></td>
                <td className="p-4 text-right font-mono font-medium">৳{totalDepositsSum.toLocaleString()}</td>
                <td className="p-4"></td>
                {isManager && <td className="p-4"></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const ScheduleView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <p className="text-sm text-muted-foreground">
          Bazar duty assignments for the active month.
        </p>
        {isManager && (
          <Button 
            onClick={() => setScheduleModalOpen(true)} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md cursor-pointer flex items-center gap-2"
          >
            <CalendarDays size={18} /> Assign Duty
          </Button>
        )}
      </div>

      <div className="bg-card/60 backdrop-blur-md border border-border rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-sm bg-secondary/50">
              <th className="p-4 font-light">Date</th>
              <th className="p-4 font-light">Duty Member</th>
              <th className="p-4 font-light">Duty Notes</th>
              {isManager && <th className="p-4 font-light text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schedule.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground text-sm">
                  No bazar duties scheduled yet. {isManager && 'Click "Assign Duty" to set up the roster.'}
                </td>
              </tr>
            ) : (
              schedule.map(entry => (
                <tr key={entry.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="p-4 font-light text-foreground font-mono">{entry.date}</td>
                  <td className="p-4 font-normal text-foreground flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center text-xs">
                      {entry.member_name?.substring(0, 2).toUpperCase()}
                    </span>
                    {entry.member_name}
                  </td>
                  <td className="p-4 font-light text-muted-foreground text-sm">{entry.note || 'Regular Bazar'}</td>
                  {isManager && (
                    <td className="p-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setScheduleDate(entry.date);
                          setScheduleMemberId(String(entry.member_id));
                          setScheduleNote(entry.note || '');
                          setScheduleModalOpen(true);
                        }}
                        className="text-xs"
                      >
                        Change
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const ReportsView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h3 className="text-base font-normal text-foreground">Monthly Ledger & Balance Rollover</h3>
          <p className="text-xs text-muted-foreground">Cycle: {monthLabel}</p>
        </div>
        <Button 
          disabled={isExportingCSV}
          onClick={async () => {
            if (isExportingCSV) return;
            setIsExportingCSV(true);
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
              showToast("Export Failed", "Could not export CSV file.", "error");
            } finally {
              setIsExportingCSV(false);
            }
          }} 
          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md flex items-center gap-1.5"
        >
          {isExportingCSV ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
          <span>Export CSV</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-light mb-1">Total Expenses</p>
          <h3 className="text-xl font-light text-foreground font-mono">৳{summary?.totals?.total_expense?.toLocaleString() || 0}</h3>
        </Card>
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-light mb-1">Total Deposits</p>
          <h3 className="text-xl font-light text-foreground font-mono">৳{summary?.totals?.total_deposit?.toLocaleString() || 0}</h3>
        </Card>
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-light mb-1">Total Meals</p>
          <h3 className="text-xl font-light text-foreground font-mono">{summary?.totals?.total_meals?.toFixed(1) || 0}</h3>
        </Card>
        <Card className="bg-card/60 backdrop-blur-md border border-border rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-light mb-1">Meal Rate</p>
          <h3 className="text-xl font-light text-foreground font-mono">৳{summary?.totals?.meal_rate?.toFixed(2) || 0}</h3>
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

  const MessesView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h3 className="text-base font-normal text-foreground">All Platform Mess Groups</h3>
          <p className="text-xs text-muted-foreground">Multi-tenant group oversight & administrative controls</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => setMessModalOpen(true)} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md cursor-pointer flex items-center gap-2"
          >
            <Plus size={18} /> Create New Mess
          </Button>
        </div>
      </div>

      <div className="bg-card/60 backdrop-blur-md border border-border rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-sm bg-secondary/50">
              <th className="p-4 font-light">Mess ID</th>
              <th className="p-4 font-light">Mess Name</th>
              <th className="p-4 font-light">Join Code</th>
              <th className="p-4 font-light">Members</th>
              <th className="p-4 font-light">Created At</th>
              <th className="p-4 font-light text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allMesses.map(m => (
              <tr key={m.id} className="hover:bg-secondary/50 transition-colors">
                <td className="p-4 font-mono text-sm text-foreground">#{m.id}</td>
                <td className="p-4 font-medium text-foreground">{m.name}</td>
                <td className="p-4 font-mono text-sm tracking-wider text-primary font-medium">{m.join_code}</td>
                <td className="p-4 font-mono text-foreground/80">{m.member_count ?? 0} members</td>
                <td className="p-4 text-xs text-muted-foreground">{format(new Date(m.created_at), 'PPP')}</td>
                <td className="p-4 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(m.join_code);
                      showToast("Code Copied", `Join code ${m.join_code} copied to clipboard.`);
                    }}
                    className="text-xs flex items-center gap-1 ml-auto"
                  >
                    <Copy size={13} /> Copy Code
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const SidebarItem = ({ id, icon: Icon, label }: { id: typeof currentTab, icon: any, label: string }) => {
    const active = currentTab === id;
    const href = id === 'dashboard' ? '/' : `/${id}`;
    return (
      <Link
        href={href}
        onClick={() => {
          setIsMobileOpen(false);
        }}
        className={`transition-all duration-200 font-light rounded-md flex items-center gap-3 px-4 py-3 w-full cursor-pointer
          ${active ? 'bg-primary text-primary-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
      >
        <Icon size={18} /> {label}
      </Link>
    );
  };

  // If user is not logged in, render the Auth view directly
  if (!user) {
    return (
      <Auth onLogin={(loggedInUser) => {
        setUser(loggedInUser);
        loadAll();
      }} />
    );
  }

  // If user is logged in, but dropped or unattached to any mess, render UnattachedMessView
  const isUnattachedOrRemoved = user && user.role !== 'super_admin' && (
    user.membership_status === 'removed' || user.membership_status === 'unattached' || !user.mess_id
  );

  if (isUnattachedOrRemoved) {
    return (
      <UnattachedMessView
        user={user}
        onMessJoinedOrCreated={(updatedUser, newMess) => {
          setUser(updatedUser);
          loadAll();
        }}
        onLogout={handleLogout}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex overflow-hidden selection:bg-primary selection:text-primary-foreground relative w-full">

      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden cursor-pointer"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 md:static flex flex-col bg-sidebar/95 md:bg-sidebar/40 backdrop-blur-2xl border-r border-sidebar-border/50 transition-all duration-300 ease-in-out overflow-hidden
        ${isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
        ${isSidebarCollapsed ? 'md:w-0 md:opacity-0 md:-translate-x-full md:border-r-0' : 'md:w-64 md:opacity-100 md:translate-x-0'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-normal text-xl shadow-sm">
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

        {/* Mess Workspace Badge in Sidebar */}
        <div className="px-4 pb-2">
          <div className="p-3 bg-secondary/60 border border-border/60 rounded-lg flex items-center justify-between">
            <div className="overflow-hidden pr-2">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Mess Workspace</p>
              <p className="text-xs font-semibold text-foreground truncate">{summary?.mess?.name || user?.mess_name || "My Mess"}</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0 capitalize">
              {user?.role === 'manager' ? 'Manager' : user?.role === 'super_admin' ? 'Admin' : 'Member'}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          <SidebarItem id="dashboard" icon={Home} label="Dashboard" />
          <SidebarItem id="members" icon={Users} label="Members" />
          <SidebarItem id="meals" icon={Utensils} label="Meals Grid" />
          <SidebarItem id="expenses" icon={Receipt} label="Bazar Expenses" />
          <SidebarItem id="deposits" icon={Wallet} label="Deposits" />
          <SidebarItem id="schedule" icon={CalendarDays} label="Bazar Schedule" />

          <div className="pt-4 pb-1">
            <p className="px-4 text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider">System</p>
          </div>
          <SidebarItem id="reports" icon={FileText} label="Monthly Reports" />
          {isSuperAdmin && (
            <SidebarItem id="messes" icon={Shield} label="Platform Messes" />
          )}
        </nav>

        {isManager && (
          <div className="p-4">
            <div className="bg-gradient-to-br from-primary to-primary/80 rounded-lg p-4 text-white relative overflow-hidden shadow-sm">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/10 rounded-full blur-xl"></div>
              <p className="text-[10px] text-white/80 uppercase font-medium mb-1">Month Rollover</p>
              <h4 className="font-medium text-xs mb-2.5">Close {monthLabel} & Archive</h4>
              <Button 
                disabled={isClosingMonth} 
                onClick={async () => {
                  if (isClosingMonth) return;
                  if (confirm(`Are you sure you want to close ${monthLabel}? Balances will roll over into next month.`)) {
                    setIsClosingMonth(true);
                    try {
                      await api.closeMonth();
                      await loadAll();
                      showToast("Month Closed", "Balances rolled over into the new month.");
                    } catch (err) {
                      showToast("Error", "Failed to close month.", "error");
                    } finally {
                      setIsClosingMonth(false);
                    }
                  }
                }} 
                className="bg-white text-primary text-xs font-medium w-full hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 h-8"
              >
                {isClosingMonth ? <><Loader2 className="animate-spin" size={12} /> Closing...</> : 'Close Month'}
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden z-10">
        <header className="h-20 bg-card/20 backdrop-blur-md border-b border-border/30 px-6 sm:px-8 flex items-center justify-between sticky top-0 shrink-0">
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
              <h1 className="text-lg font-normal text-foreground leading-tight">
                {tabInfo[currentTab]?.title}
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {tabInfo[currentTab]?.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Join Code Quick-Badge for Mess Managers */}
            {summary?.mess && isManager && (
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(summary.mess!.join_code);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                  showToast("Join Code Copied", `Mess Code: ${summary.mess!.join_code}`);
                }}
                className="hidden lg:flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                title="Click to copy Mess Join Code"
              >
                <KeyRound size={13} />
                <span>Code: <strong className="font-mono tracking-wider">{summary.mess.join_code}</strong></span>
                {copiedCode ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              </button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareModalOpen(true)}
              className="rounded-md border-primary/20 text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground flex items-center gap-1.5 transition-all cursor-pointer text-xs"
            >
              <Share2 size={14} /> <span className="hidden sm:inline">Share</span>
            </Button>

            {user ? (
              <div className="flex items-center gap-2">
                <div className="bg-card border border-border px-3 py-1 rounded-md flex items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">{user.username}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                    {user.role.replace('_', ' ')}
                  </Badge>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout} 
                  className="rounded-md border-border text-foreground/80 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer text-xs flex items-center gap-1"
                >
                  <LogOut size={13} /> <span className="hidden sm:inline">Logout</span>
                </Button>
              </div>
            ) : (
              <Button 
                size="sm" 
                onClick={() => setAuthModalOpen(true)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <LogIn size={14} /> Sign In / Join Mess
              </Button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 sm:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto h-full flex flex-col">
            {currentTab === 'dashboard' && DashboardView()}
            {currentTab === 'members' && MembersView()}
            {currentTab === 'meals' && MealsView()}
            {currentTab === 'expenses' && ExpensesView()}
            {currentTab === 'deposits' && DepositsView()}
            {currentTab === 'schedule' && ScheduleView()}
            {currentTab === 'reports' && ReportsView()}
            {currentTab === 'messes' && isSuperAdmin && MessesView()}
          </div>
        </div>
      </main>

      {/* Auth Modal (Sign In / Register / Join) */}
      <Dialog open={isAuthModalOpen} onOpenChange={setAuthModalOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-transparent border-none">
          <Auth onLogin={(loggedInUser) => {
            setUser(loggedInUser);
            setAuthModalOpen(false);
            showToast("Welcome!", `Signed in as ${loggedInUser.username}`);
            loadAll();
          }} />
        </DialogContent>
      </Dialog>

      {/* Mess Management / Join / Create Modal */}
      <Dialog open={isMessModalOpen} onOpenChange={setMessModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium flex items-center gap-2">
              <Building2 className="text-primary" size={20} />
              Mess Group Settings
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Current Mess Info */}
            <div className="p-4 bg-secondary/50 rounded-lg border border-border/60 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Current Mess</p>
              <div className="flex justify-between items-center">
                <span className="text-base font-medium text-foreground">{summary?.mess?.name || "Main Mess"}</span>
                {summary?.mess && (
                  <Badge variant="outline" className="font-mono text-xs text-primary border-primary/30">
                    Code: {summary.mess.join_code}
                  </Badge>
                )}
              </div>
            </div>

            {/* Join via Code */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Join Another Mess with Code
              </label>
              <div className="flex gap-2">
                <Input 
                  type="text" 
                  value={joinCodeInput} 
                  onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. MESSSYNC01"
                  className="font-mono uppercase tracking-wider bg-secondary"
                  disabled={isJoiningMess}
                />
                <Button 
                  onClick={async () => {
                    if (!joinCodeInput.trim()) return;
                    setIsJoiningMess(true);
                    try {
                      const res = await api.joinMess({ join_code: joinCodeInput.trim() });
                      localStorage.setItem('access_token', res.access_token);
                      localStorage.setItem('user', JSON.stringify(res.user));
                      setUser(res.user);
                      setMessModalOpen(false);
                      setJoinCodeInput('');
                      await loadAll();
                      showToast("Success!", res.message);
                    } catch (err: any) {
                      showToast("Join Failed", err.message || "Invalid join code", "error");
                    } finally {
                      setIsJoiningMess(false);
                    }
                  }}
                  disabled={isJoiningMess}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                >
                  {isJoiningMess && <Loader2 className="animate-spin mr-1" size={14} />}
                  Join
                </Button>
              </div>
            </div>

            {/* Create New Mess */}
            <div className="space-y-3 pt-4 border-t border-border/50">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Create a New Mess Group
              </label>
              <div className="flex gap-2">
                <Input 
                  type="text" 
                  value={newMessName} 
                  onChange={e => setNewMessName(e.target.value)}
                  placeholder="e.g. Green Villa Dining"
                  className="bg-secondary"
                  disabled={isCreatingMess}
                />
                <Button 
                  onClick={async () => {
                    if (!newMessName.trim()) return;
                    setIsCreatingMess(true);
                    try {
                      const res = await api.createMess({ name: newMessName.trim() });
                      localStorage.setItem('access_token', res.access_token);
                      localStorage.setItem('user', JSON.stringify(res.user));
                      setUser(res.user);
                      setMessModalOpen(false);
                      setNewMessName('');
                      await loadAll();
                      showToast("Mess Created!", `Created "${res.mess.name}" with code ${res.mess.join_code}`);
                    } catch (err: any) {
                      showToast("Creation Failed", err.message || "Failed to create mess", "error");
                    } finally {
                      setIsCreatingMess(false);
                    }
                  }}
                  disabled={isCreatingMess}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                >
                  {isCreatingMess && <Loader2 className="animate-spin mr-1" size={14} />}
                  Create
                </Button>
              </div>
            </div>


          </div>
        </DialogContent>
      </Dialog>

      {/* Add Expense Modal */}
      <Dialog open={isExpenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Add Daily Bazar Expense</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            if (isSubmittingExpense) return;
            setIsSubmittingExpense(true);
            const formData = new FormData(e.currentTarget);
            try {
              await api.createExpense({
                date: formData.get("date") as string,
                amount: Number(formData.get("amount")),
                description: formData.get("description") as string,
                shopper_member_id: Number(formData.get("shopper_member_id")) || null
              });
              setExpenseModalOpen(false);
              await loadAll();
              showToast("Expense Added", "The expense was recorded successfully.");
            } catch (err: any) {
              showToast("Error", err.message || "Failed to add expense", "error");
            } finally {
              setIsSubmittingExpense(false);
            }
          }}>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Date</label>
              <Input type="date" name="date" defaultValue={today} required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Amount (৳)</label>
              <Input type="number" step="0.01" min="0" name="amount" placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Items Description</label>
              <Input type="text" name="description" placeholder="e.g. Fish, Chicken, Rice, Oil" required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Purchased By (Shopper)</label>
              <Select name="shopper_member_id">
                <SelectTrigger>
                  <SelectValue placeholder="Select member (Optional)" />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setExpenseModalOpen(false)} disabled={isSubmittingExpense}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md flex items-center justify-center gap-1.5" disabled={isSubmittingExpense}>
                {isSubmittingExpense && <Loader2 className="animate-spin" size={16} />}
                {isSubmittingExpense ? 'Saving...' : 'Add Expense'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Expense Modal */}
      <Dialog open={isEditExpenseModalOpen} onOpenChange={setEditExpenseModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Edit Bazar Expense</DialogTitle>
          </DialogHeader>
          {editingExpense && (
            <form className="space-y-4 mt-4" onSubmit={async (e) => {
              e.preventDefault();
              if (isUpdatingExpense) return;
              setIsUpdatingExpense(true);
              const formData = new FormData(e.currentTarget);
              try {
                await api.updateExpense(editingExpense.id, {
                  date: formData.get("date") as string,
                  amount: Number(formData.get("amount")),
                  description: formData.get("description") as string,
                  shopper_member_id: Number(formData.get("shopper_member_id")) || null
                });
                setEditExpenseModalOpen(false);
                setEditingExpense(null);
                await loadAll();
                showToast("Expense Updated");
              } catch (err: any) {
                showToast("Error", err.message || "Failed to update expense", "error");
              } finally {
                setIsUpdatingExpense(false);
              }
            }}>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Date</label>
                <Input type="date" name="date" defaultValue={editingExpense.date} required />
              </div>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Amount (৳)</label>
                <Input type="number" step="0.01" min="0" name="amount" defaultValue={editingExpense.amount} required />
              </div>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Items Description</label>
                <Input type="text" name="description" defaultValue={editingExpense.description} required />
              </div>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Purchased By</label>
                <Select name="shopper_member_id" defaultValue={editingExpense.shopper_member_id ? String(editingExpense.shopper_member_id) : undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select member (Optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeMembers.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-4 flex gap-3">
                <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setEditExpenseModalOpen(false)} disabled={isUpdatingExpense}>Cancel</Button>
                <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md flex items-center justify-center gap-1.5" disabled={isUpdatingExpense}>
                  {isUpdatingExpense && <Loader2 className="animate-spin" size={16} />}
                  {isUpdatingExpense ? 'Updating...' : 'Update Expense'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Deposit Modal */}
      <Dialog open={isDepositModalOpen} onOpenChange={setDepositModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Record Member Deposit</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            if (isSubmittingDeposit) return;
            setIsSubmittingDeposit(true);
            const formData = new FormData(e.currentTarget);
            try {
              await api.createDeposit({
                member_id: Number(formData.get("member_id")),
                date: formData.get("date") as string,
                amount: Number(formData.get("amount")),
                note: formData.get("note") as string || undefined
              });
              setDepositModalOpen(false);
              await loadAll();
              showToast("Deposit Recorded");
            } catch (err: any) {
              showToast("Error", err.message || "Failed to record deposit", "error");
            } finally {
              setIsSubmittingDeposit(false);
            }
          }}>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Date</label>
              <Input type="date" name="date" defaultValue={today} required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Member</label>
              <Select name="member_id" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Amount (৳)</label>
              <Input type="number" step="0.01" min="0" name="amount" placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Note (Optional)</label>
              <Input type="text" name="note" placeholder="e.g. Bank transfer, Bkash, Cash" />
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setDepositModalOpen(false)} disabled={isSubmittingDeposit}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md flex items-center justify-center gap-1.5" disabled={isSubmittingDeposit}>
                {isSubmittingDeposit && <Loader2 className="animate-spin" size={16} />}
                {isSubmittingDeposit ? 'Saving...' : 'Record Deposit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Deposit Modal */}
      <Dialog open={isEditDepositModalOpen} onOpenChange={setEditDepositModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Edit Member Deposit</DialogTitle>
          </DialogHeader>
          {editingDeposit && (
            <form className="space-y-4 mt-4" onSubmit={async (e) => {
              e.preventDefault();
              if (isUpdatingDeposit) return;
              setIsUpdatingDeposit(true);
              const formData = new FormData(e.currentTarget);
              try {
                await api.updateDeposit(editingDeposit.id, {
                  member_id: Number(formData.get("member_id")),
                  date: formData.get("date") as string,
                  amount: Number(formData.get("amount")),
                  note: formData.get("note") as string || undefined
                });
                setEditDepositModalOpen(false);
                setEditingDeposit(null);
                await loadAll();
                showToast("Deposit Updated");
              } catch (err: any) {
                showToast("Error", err.message || "Failed to update deposit", "error");
              } finally {
                setIsUpdatingDeposit(false);
              }
            }}>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Date</label>
                <Input type="date" name="date" defaultValue={editingDeposit.date} required />
              </div>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Member</label>
                <Select name="member_id" defaultValue={String(editingDeposit.member_id)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeMembers.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Amount (৳)</label>
                <Input type="number" step="0.01" min="0" name="amount" defaultValue={editingDeposit.amount} required />
              </div>
              <div>
                <label className="block text-sm font-light text-foreground/90 mb-1">Note (Optional)</label>
                <Input type="text" name="note" defaultValue={editingDeposit.note || ''} />
              </div>
              <div className="pt-4 flex gap-3">
                <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setEditDepositModalOpen(false)} disabled={isUpdatingDeposit}>Cancel</Button>
                <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md flex items-center justify-center gap-1.5" disabled={isUpdatingDeposit}>
                  {isUpdatingDeposit && <Loader2 className="animate-spin" size={16} />}
                  {isUpdatingDeposit ? 'Updating...' : 'Update Deposit'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Member Modal */}
      <Dialog open={isMemberModalOpen} onOpenChange={setMemberModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Enroll New Member</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            if (isSubmittingMember) return;
            setIsSubmittingMember(true);
            const formData = new FormData(e.currentTarget);
            try {
              await api.createMember({
                name: formData.get("name") as string,
                phone: formData.get("phone") as string || undefined,
                entry_date: formData.get("entry_date") as string,
                password: formData.get("password") as string || undefined
              });
              setMemberModalOpen(false);
              await loadAll();
              showToast("Member Enrolled", "New roommate added to your mess workspace.");
            } catch (err: any) {
              showToast("Error", err.message || "Failed to add member", "error");
            } finally {
              setIsSubmittingMember(false);
            }
          }}>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Name</label>
              <Input type="text" name="name" placeholder="Full Name (e.g. Shakil)" required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Login Password (Optional)</label>
              <Input type="password" name="password" placeholder="Set password so member can sign in" />
              <p className="text-[11px] text-muted-foreground mt-1">If provided, this member can sign in directly with their name and this password.</p>
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Phone (Optional)</label>
              <Input type="tel" name="phone" placeholder="017xxxxxxxx" />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Entry Date</label>
              <Input type="date" name="entry_date" defaultValue={today} required />
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setMemberModalOpen(false)} disabled={isSubmittingMember}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md flex items-center justify-center gap-1.5" disabled={isSubmittingMember}>
                {isSubmittingMember && <Loader2 className="animate-spin" size={16} />}
                {isSubmittingMember ? 'Adding...' : 'Add Member'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bazar Schedule Modal */}
      <Dialog open={isScheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border rounded-lg">
          <DialogHeader>
            <DialogTitle>Assign Bazar Duty</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            if (isSavingSchedule) return;
            setIsSavingSchedule(true);
            try {
              await api.saveSchedule({
                date: scheduleDate,
                member_id: Number(scheduleMemberId),
                note: scheduleNote.trim() || undefined
              });
              setScheduleModalOpen(false);
              await loadAll();
              showToast("Duty Scheduled");
            } catch (err: any) {
              showToast("Error", err.message || "Failed to schedule duty", "error");
            } finally {
              setIsSavingSchedule(false);
            }
          }}>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Date</label>
              <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Assigned Member</label>
              <Select value={scheduleMemberId} onValueChange={(val) => setScheduleMemberId(val || '')} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select duty member" />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-light text-foreground/90 mb-1">Duty Notes (Optional)</label>
              <Input type="text" value={scheduleNote} onChange={e => setScheduleNote(e.target.value)} placeholder="e.g. Fish Market & Vegetables" />
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-md" onClick={() => setScheduleModalOpen(false)} disabled={isSavingSchedule}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md flex items-center justify-center gap-1.5" disabled={isSavingSchedule}>
                {isSavingSchedule && <Loader2 className="animate-spin" size={16} />}
                {isSavingSchedule ? 'Saving...' : 'Assign Duty'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Share System Modal */}
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
              Connect flatmates to this mess. Share the link and your unique <strong>Mess Join Code</strong>:
            </p>

            {summary?.mess && (
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-primary tracking-wider">Mess Join Code</p>
                  <p className="text-lg font-mono font-bold text-primary tracking-widest">{summary.mess.join_code}</p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(summary.mess!.join_code);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
                >
                  {copiedCode ? "Copied!" : "Copy Code"}
                </Button>
              </div>
            )}

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
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    } catch (err) {
                      console.error("Failed to copy link", err);
                    }
                  }}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md px-4 flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                >
                  {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                  {copiedLink ? "Copied!" : "Copy"}
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

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`rounded-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] border p-4 pr-12 min-w-[300px] flex gap-3 backdrop-blur-md ${
            toastMessage.type === 'success' ? 'bg-card/90 border-primary/20 text-foreground' : 'bg-card/90 border-red-200 text-foreground'
          }`}>
            <div className={`mt-0.5 rounded-md p-1 h-fit shrink-0 ${toastMessage.type === 'success' ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'}`}>
              {toastMessage.type === 'success' ? <Check size={14} /> : <X size={14} />}
            </div>
            <div>
              <p className="font-medium text-sm">{toastMessage.title}</p>
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
