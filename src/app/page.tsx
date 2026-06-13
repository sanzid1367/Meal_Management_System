'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home, Users, Utensils, Receipt, Wallet, Calendar,
  Search, Bell, Settings, Plus, Minus, ChevronRight,
  MoreVertical, X, FileText, CalendarDays, Share2, Copy, Check, Loader2
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { format } from "date-fns";
import QRCode from 'qrcode';

import { api } from "../lib/api";
import type { Deposit, Expense, MealEntry, Member, MemberSummary, ScheduleEntry, Summary } from "../types";

import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'meals' | 'expenses' | 'deposits' | 'schedule' | 'reports'>('dashboard');

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-white/60 to-white/30 backdrop-blur-md border-white/40 shadow-sm border rounded-2xl">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-teal-100 text-teal-600 rounded-xl">
                <Receipt size={24} />
              </div>
            </div>
            <p className="text-slate-500 text-sm font-medium mb-1">Total Expense</p>
            <h2 className="text-3xl font-bold text-slate-800">৳{summary?.totals.total_expense.toLocaleString() || 0}</h2>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white/60 to-white/30 backdrop-blur-md border-white/40 shadow-sm border rounded-2xl">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                <Utensils size={24} />
              </div>
            </div>
            <p className="text-slate-500 text-sm font-medium mb-1">Current Meal Rate</p>
            <h2 className="text-3xl font-bold text-slate-800">৳{summary?.totals.meal_rate.toFixed(2) || 0}</h2>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-white/60 to-white/30 backdrop-blur-md border-white/40 shadow-sm border rounded-2xl">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                <Wallet size={24} />
              </div>
            </div>
            <p className="text-slate-500 text-sm font-medium mb-1">Cash in Hand</p>
            <h2 className="text-3xl font-bold text-slate-800">৳{summary?.totals.cash_in_hand.toLocaleString() || 0}</h2>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-teal-500 to-teal-700 border-none shadow-xl shadow-teal-500/20 text-white flex flex-col justify-between rounded-2xl">
          <CardContent className="p-6 h-full flex flex-col justify-between">
            <div>
              <p className="text-teal-100 text-sm font-medium mb-1">Total Meals Served</p>
              <h2 className="text-4xl font-bold">{summary?.totals.total_meals.toFixed(1) || 0}</h2>
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
        <Card className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm p-6 lg:col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800">Expense Trend ({format(new Date(expenses[0]?.date || today), 'MMM')})</h3>
            <button onClick={() => setActiveTab('expenses')} className="text-teal-600 text-sm font-medium hover:underline cursor-pointer">View Ledger</button>
          </div>
          <div className="flex-1 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={expenseChartData.length ? expenseChartData : [{ day: '1', cost: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dx={-10} />
                <RechartsTooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="cost" stroke="#0d9488" strokeWidth={4} dot={{ r: 6, fill: '#0d9488', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Member Balances Mini-List */}
        <Card className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800">Member Balances</h3>
            <button onClick={() => setActiveTab('members')} className="text-teal-600 text-sm font-medium hover:underline cursor-pointer">View All</button>
          </div>
          <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {(summary?.member_summaries || []).filter(m => m.is_active).sort((a, b) => a.balance - b.balance).map((member, i) => (
              <div key={member.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50/50 transition-colors border border-transparent hover:border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                    ${i === 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}
                  `}>
                    {member.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{member.name}</p>
                    <p className="text-xs text-slate-500">{member.total_meals} meals</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${member.balance >= 0 ? 'text-teal-600' : 'text-red-500'}`}>
                    {member.balance >= 0 ? '+' : ''}৳{member.balance.toFixed(0)}
                  </p>
                  <p className="text-xs text-slate-400">Balance</p>
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Mess Members</h2>
          <p className="text-slate-500 text-sm">Manage member details and view individual summaries.</p>
        </div>
        {isAdmin && <Button onClick={() => setMemberModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">
          <Plus size={18} className="mr-2" /> Add Member
        </Button>}
      </div>

      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-sm">
              <th className="p-4 font-medium">Name</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Deposits</th>
              <th className="p-4 font-medium">Meals</th>
              <th className="p-4 font-medium">Total Cost</th>
              <th className="p-4 font-medium">Balance</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(summary?.member_summaries || []).map(member => (
              <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4">
                  <div className="font-semibold text-slate-800">{member.name}</div>
                  <div className="text-xs text-slate-500">{member.phone || '-'}</div>
                </td>
                <td className="p-4">
                  {member.is_active ? <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-200" variant="secondary">Active</Badge> : <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200" variant="secondary">Inactive</Badge>}
                </td>
                <td className="p-4 font-medium text-slate-700">৳{member.total_deposit}</td>
                <td className="p-4 text-slate-600">{member.total_meals}</td>
                <td className="p-4 text-slate-600">৳{member.meal_cost.toFixed(2)}</td>
                <td className="p-4">
                  <span className={`font-bold px-2 py-1 rounded-md ${member.balance >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {member.balance >= 0 ? '+' : ''}৳{member.balance.toFixed(2)}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {isAdmin && (
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
                      className={`text-xs rounded-lg transition-colors cursor-pointer ${member.is_active ? 'text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200' : 'text-teal-600 hover:bg-teal-50 hover:text-teal-700 border-teal-200'}`}
                    >
                      {member.is_active ? 'Drop Member' : 'Restore Member'}
                    </Button>
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
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col flex-1 min-h-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Daily Meal Entry</h2>
            <p className="text-slate-500 text-sm">Record lunch and dinner counts.</p>
          </div>
          <div className="flex gap-2 items-center">
            <Input type="date" value={mealDate} onChange={e => setMealDate(e.target.value)} className="w-auto bg-white/60" />
            {isAdmin && <Button disabled={isSavingMeals} onClick={saveMealGrid} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30 transition-all disabled:opacity-70">
              {isSavingMeals ? <><Loader2 className="animate-spin mr-2" size={16} /> Saving...</> : 'Save'}
            </Button>}
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="overflow-auto custom-scrollbar flex-1">
            <table className="w-full text-center border-collapse min-w-[800px]">
              <thead className="sticky top-0 bg-white/90 backdrop-blur-md z-10 shadow-sm">
                <tr>
                  <th className="p-3 border-b border-r border-slate-200 text-left sticky left-0 bg-white/90 backdrop-blur-md z-20 w-32">
                    <span className="text-sm font-medium text-slate-500">Date</span>
                  </th>
                  {activeMembers.map(member => (
                    <th key={member.id} colSpan={2} className="p-2 border-b border-r border-slate-200 min-w-[140px]">
                      <div className="text-sm font-bold text-slate-700 truncate max-w-[140px]" title={member.name}>{member.name}</div>
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="p-2 border-b border-r border-slate-200 sticky left-0 bg-white/90 backdrop-blur-md z-20"></th>
                  {activeMembers.map(member => (
                    <React.Fragment key={`${member.id}-sub`}>
                      <th className="p-1 border-b border-r border-slate-100 text-[10px] font-medium text-slate-500 bg-slate-50/50 min-w-[70px]">L</th>
                      <th className="p-1 border-b border-r border-slate-200 text-[10px] font-medium text-slate-500 bg-slate-50/50 min-w-[70px]">D</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map(date => {
                  const dayNum = parseInt(date.split('-')[2]);
                  const isSelected = date === mealDate;
                  return (
                    <tr key={date} className={`hover:bg-slate-50/30 ${isSelected ? 'bg-teal-50/20' : ''}`}>
                      <td className={`p-3 border-b border-r border-slate-200 text-left sticky left-0 bg-white/90 font-medium z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${isSelected ? 'text-teal-700' : 'text-slate-700'}`}>
                        {dayNum} <span className="text-xs text-slate-400 font-normal uppercase">{format(new Date(date), "MMM")}</span>
                      </td>
                      {activeMembers.map(member => {
                        const renderInput = (type: 'lunch' | 'dinner', val: number) => {
                          if (!isSelected || !isAdmin) {
                            return (
                              <td className={`p-2 border-b border-r border-slate-100 ${val > 0 ? 'bg-slate-100/50 text-slate-700 font-medium' : 'text-slate-400'} text-base`}>
                                {val > 0 ? val : '-'}
                              </td>
                            );
                          }
                          return (
                            <td className={`p-2 border-b border-r border-slate-100 ${val > 0 ? 'bg-teal-50/50' : ''}`}>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={val === 0 ? '' : val}
                                onChange={(e) => setMealValue(date, member.id, type, 'count', Number(e.target.value))}
                                className="w-full min-w-[60px] h-8 text-center bg-transparent text-base focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-500 rounded px-1 py-1 text-slate-800 font-medium placeholder-slate-300"
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Expenses & Bazar</h2>
          <p className="text-slate-500 text-sm">Track daily shopping costs.</p>
        </div>
        {isAdmin && <Button onClick={() => setExpenseModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">
          <Plus size={18} className="mr-2" /> Add Expense
        </Button>}
      </div>

      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-sm bg-slate-50/50">
              <th className="p-4 font-medium">Date</th>
              <th className="p-4 font-medium">Description</th>
              <th className="p-4 font-medium">Shopper</th>
              <th className="p-4 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(exp => (
              <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4 text-slate-600 whitespace-nowrap">{exp.date}</td>
                <td className="p-4 text-slate-800">{exp.description}</td>
                <td className="p-4 text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-200 text-[10px] flex items-center justify-center font-bold text-slate-600">
                      {(exp.shopper_name || '?').substring(0, 2).toUpperCase()}
                    </span>
                    {exp.shopper_name || '-'}
                  </span>
                </td>
                <td className="p-4 font-bold text-slate-800 text-right">৳{exp.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const DepositsView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Member Deposits</h2>
          <p className="text-slate-500 text-sm">Money collected for the month.</p>
        </div>
        {isAdmin && <Button onClick={() => setDepositModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">
          <Plus size={18} className="mr-2" /> Add Deposit
        </Button>}
      </div>

      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 text-sm bg-slate-50/50">
              <th className="p-4 font-medium">Date</th>
              <th className="p-4 font-medium">Member</th>
              <th className="p-4 font-medium text-right">Amount</th>
              <th className="p-4 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {deposits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(dep => {
              return (
                <tr key={dep.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-slate-600 whitespace-nowrap">{dep.date}</td>
                  <td className="p-4 font-medium text-slate-800">{dep.member_name || 'Unknown'}</td>
                  <td className="p-4 font-bold text-teal-700 text-right">৳{dep.amount.toLocaleString()}</td>
                  <td className="p-4 text-center">
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-200" variant="secondary">Received</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const ReportsView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Monthly Report</h2>
          <p className="text-slate-500 text-sm">Comprehensive summary of all expenses, deposits, and balances.</p>
        </div>
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
        }} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-lg shadow-teal-600/30">
          <FileText size={18} className="mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
        <Card className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm p-4">
          <p className="text-slate-500 text-xs font-medium mb-1">Total Expenses</p>
          <h3 className="text-xl font-bold text-slate-800">৳{summary?.totals?.total_expense?.toLocaleString() || 0}</h3>
        </Card>
        <Card className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm p-4">
          <p className="text-slate-500 text-xs font-medium mb-1">Total Deposits</p>
          <h3 className="text-xl font-bold text-slate-800">৳{summary?.totals?.total_deposit?.toLocaleString() || 0}</h3>
        </Card>
        <Card className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm p-4">
          <p className="text-slate-500 text-xs font-medium mb-1">Total Meals</p>
          <h3 className="text-xl font-bold text-slate-800">{summary?.totals?.total_meals?.toFixed(1) || 0}</h3>
        </Card>
        <Card className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm p-4">
          <p className="text-slate-500 text-xs font-medium mb-1">Meal Rate</p>
          <h3 className="text-xl font-bold text-teal-700">৳{summary?.totals?.meal_rate?.toFixed(2) || 0}</h3>
        </Card>
      </div>

      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-2xl shadow-sm flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="sticky top-0 bg-white/90 backdrop-blur-md z-10 shadow-sm">
              <tr className="border-b border-slate-200 text-slate-500 text-sm">
                <th className="p-4 font-medium">Member Name</th>
                <th className="p-4 font-medium text-right">Opening Bal.</th>
                <th className="p-4 font-medium text-right">Deposits</th>
                <th className="p-4 font-medium text-center">Meals</th>
                <th className="p-4 font-medium text-right">Per Person Cost</th>
                <th className="p-4 font-medium text-right">Due/Refund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(summary?.member_summaries || []).filter(m => m.is_active || m.balance !== 0).map(member => (
                <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-semibold text-slate-800">
                    {member.name}
                    {!member.is_active && <Badge className="ml-2 bg-slate-100 text-slate-500 text-[10px]" variant="secondary">Inactive</Badge>}
                  </td>
                  <td className="p-4 text-slate-600 text-right">৳{member.opening_balance?.toFixed(2) || 0}</td>
                  <td className="p-4 text-teal-700 font-medium text-right">৳{member.total_deposit?.toLocaleString() || 0}</td>
                  <td className="p-4 text-slate-600 text-center">{member.total_meals || 0}</td>
                  <td className="p-4 text-slate-600 text-right">৳{member.meal_cost?.toFixed(2) || 0}</td>
                  <td className="p-4 text-right">
                    <span className={`font-bold px-2 py-1 rounded-md ${member.balance >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {member.balance >= 0 ? '+' : ''}৳{member.balance?.toFixed(2) || 0}
                    </span>
                  </td>
                </tr>
              ))}
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
        onClick={() => setActiveTab(id)}
        className={`transition-all duration-300 ease-in-out font-medium rounded-xl flex items-center gap-3 px-4 py-3 w-full cursor-pointer
          ${active ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30' : 'text-slate-500 hover:bg-white/50 hover:text-teal-700'}`}
      >
        <Icon size={20} /> {label}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#e2f1f0] text-slate-800 font-sans flex overflow-hidden selection:bg-teal-200 relative w-full">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-teal-200/50 blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 blur-[120px]"></div>
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] rounded-full bg-purple-200/30 blur-[90px]"></div>
      </div>

      <aside className="w-64 bg-white/40 backdrop-blur-2xl border-r border-white/50 flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] hidden md:flex z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-teal-600/30">
            M
          </div>
          <span className="text-xl font-extrabold tracking-tight text-slate-800">Mess<span className="text-teal-600">Sync</span></span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <SidebarItem id="dashboard" icon={Home} label="Dashboard" />
          <SidebarItem id="members" icon={Users} label="Members" />
          <SidebarItem id="meals" icon={Utensils} label="Meals" />
          <SidebarItem id="expenses" icon={Receipt} label="Expenses" />
          <SidebarItem id="deposits" icon={Wallet} label="Deposits" />

          <div className="pt-6 pb-2">
            <p className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">System</p>
          </div>
          <SidebarItem id="reports" icon={FileText} label="Reports" />
          <button className="text-slate-500 hover:bg-white/50 hover:text-teal-700 transition-all duration-300 ease-in-out font-medium rounded-xl flex items-center gap-3 px-4 py-3 w-full cursor-pointer">
            <Settings size={20} /> Settings
          </button>
        </nav>

        <div className="p-4">
          {isAdmin && (
            <div className="bg-gradient-to-br from-teal-600 to-teal-800 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/10 rounded-full blur-xl"></div>
              <p className="text-xs text-teal-200 font-medium mb-1">Month End</p>
              <h4 className="font-bold text-sm mb-3">Close {monthLabel} &<br />Generate PDF</h4>
              <Button disabled={isClosingMonth} onClick={async () => {
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
              }} className="bg-white text-teal-800 text-xs font-bold w-full hover:bg-teal-50 transition-colors disabled:opacity-50">
                {isClosingMonth ? <><Loader2 className="animate-spin mr-2" size={14} /> Closing...</> : 'Close Month'}
              </Button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden z-10">
        <header className="h-20 bg-white/20 backdrop-blur-md border-b border-white/30 px-8 flex items-center justify-between sticky top-0 shrink-0">
          <div>
            <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <span className="text-slate-500 font-normal">Welcome{user ? ' back,' : ','}</span> {user ? 'Manager' : 'Viewer'} <span className="text-xl">👋</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareModalOpen(true)}
                className="rounded-xl border-teal-200 text-teal-700 bg-teal-50/50 hover:bg-teal-100/50 hover:text-teal-800 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Share2 size={16} /> Share System
              </Button>
              <span className="text-sm font-medium text-slate-600 bg-white/50 px-3 py-1 rounded-full">{user ? `${user.username} (${user.role})` : 'Viewer Mode'}</span>
              {user && <Button variant="outline" size="sm" onClick={() => { localStorage.removeItem("access_token"); localStorage.removeItem("user"); window.location.reload(); }} className="rounded-xl border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-colors cursor-pointer">Logout</Button>}
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
        <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-xl border-white rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Daily Expense</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <Input name="date" type="date" defaultValue={today} className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (৳)</label>
              <Input name="amount" type="number" min="0" step="0.01" placeholder="0.00" className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Items Description</label>
              <Input name="description" type="text" placeholder="e.g., Rice, Chicken, Onion" className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Purchased By</label>
              <Select name="shopper_member_id">
                <SelectTrigger className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl">
                  <SelectValue placeholder="Select Shopper..." />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setExpenseModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-xl">Save Expense</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDepositModalOpen} onOpenChange={setDepositModalOpen}>
        <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-xl border-white rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Member Deposit</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <Input name="date" type="date" defaultValue={today} className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Member</label>
              <Select name="member_id" required>
                <SelectTrigger className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl">
                  <SelectValue placeholder="Select Member..." />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map(m => <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (৳)</label>
              <Input name="amount" type="number" min="0" step="0.01" placeholder="0.00" className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl" required />
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setDepositModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-xl">Add Deposit</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isMemberModalOpen} onOpenChange={setMemberModalOpen}>
        <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-xl border-white rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <form className="space-y-4 mt-4" onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <Input name="name" type="text" className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <Input name="phone" type="text" className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Entry Date</label>
              <Input name="entry_date" type="date" defaultValue={today} className="bg-slate-50 focus-visible:ring-teal-500 rounded-xl" required />
            </div>
            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setMemberModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white rounded-xl">Add Member</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isShareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-md bg-white/95 backdrop-blur-xl border-white rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Share2 className="text-teal-600" size={20} />
              Share MessSync
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            <p className="text-sm text-slate-500 leading-relaxed">
              Connect other members to this meal management system. Make sure they are connected to the same <strong>Wi-Fi / Local Network (LAN)</strong>.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Access Link</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={shareUrl || "Loading link..."}
                  readOnly
                  className="flex-1 bg-slate-50 border-slate-200 text-slate-700 font-medium rounded-xl select-all"
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
                  className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-4 flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center bg-slate-50/50 rounded-2xl p-6 border border-slate-100 space-y-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scan to Open on Mobile</span>
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center">
                {shareUrl ? (
                  <canvas ref={qrCanvasRef} className="w-48 h-48 rounded-lg" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-sm">
                    Generating QR Code...
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                Scan this QR code with your phone camera to open the application instantly.
              </p>
            </div>
            
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
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
          <div className={`rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border p-4 pr-12 min-w-[300px] flex gap-3 backdrop-blur-md ${
            toastMessage.type === 'success' ? 'bg-white/90 border-teal-200 text-slate-800' : 'bg-white/90 border-red-200 text-slate-800'
          }`}>
            <div className={`mt-0.5 rounded-full p-1 h-fit shrink-0 ${toastMessage.type === 'success' ? 'bg-teal-100 text-teal-600' : 'bg-red-100 text-red-600'}`}>
              {toastMessage.type === 'success' ? <Check size={14} /> : <X size={14} />}
            </div>
            <div>
              <p className="font-semibold text-sm">{toastMessage.title}</p>
              {toastMessage.message && <p className="text-xs text-slate-500 mt-0.5">{toastMessage.message}</p>}
            </div>
            <button 
              onClick={() => setToastMessage(null)} 
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
