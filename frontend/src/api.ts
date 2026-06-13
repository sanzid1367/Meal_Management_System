import type { Deposit, Expense, MealEntry, Member, ScheduleEntry, Summary } from "./types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {})
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const response = await fetch(path, {
    ...options,
    headers
  });
  
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      if (path !== '/api/auth/me' && path !== '/api/auth/token') {
        if (localStorage.getItem("access_token")) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("user");
          window.location.reload();
        }
      }
    }
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}

export const api = {
  summary: () => request<Summary>("/api/summary"),
  members: (includeInactive = true) => request<Member[]>(`/api/members?include_inactive=${includeInactive}`),
  createMember: (data: { name: string; phone?: string; entry_date: string }) =>
    request<Member>("/api/members", { method: "POST", body: JSON.stringify(data) }),
  updateMember: (id: number, data: Partial<Member>) =>
    request<Member>(`/api/members/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deposits: () => request<Deposit[]>("/api/deposits"),
  createDeposit: (data: { member_id: number; date: string; amount: number; note?: string }) =>
    request<Deposit>("/api/deposits", { method: "POST", body: JSON.stringify(data) }),
  updateDeposit: (id: number, data: Partial<Deposit>) =>
    request<Deposit>(`/api/deposits/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  expenses: () => request<Expense[]>("/api/expenses"),
  createExpense: (data: { date: string; amount: number; description: string; shopper_member_id?: number | null }) =>
    request<Expense>("/api/expenses", { method: "POST", body: JSON.stringify(data) }),
  updateExpense: (id: number, data: Partial<Expense>) =>
    request<Expense>(`/api/expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  meals: (start: string, end: string) => request<MealEntry[]>(`/api/meals?start=${start}&end=${end}`),
  saveMeals: (entries: Array<Omit<MealEntry, "id">>) =>
    request<{ updated: number }>("/api/meals", { method: "PUT", body: JSON.stringify({ entries }) }),
  schedule: () => request<ScheduleEntry[]>("/api/schedule"),
  saveSchedule: (data: { date: string; member_id: number; note?: string }) =>
    request<{ ok: boolean }>("/api/schedule", { method: "PUT", body: JSON.stringify(data) }),
  closeMonth: () => request<{ new_month: { name: string } }>("/api/months/close", { method: "POST" }),
  
  // Auth
  login: async (username: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);
    const response = await fetch("/api/auth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }
    return response.json() as Promise<{ access_token: string; user: { id: number; username: string; role: string; created_at: string } }>;
  },
  register: (data: { username: string; password: string }) =>
    request<{ id: number; username: string; role: string }>("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
  me: () => request<{ id: number; username: string; role: string; created_at: string }>("/api/auth/me"),
  shareInfo: () => request<{ local_ip: string; port: number; share_url: string }>("/api/share-info")
};
