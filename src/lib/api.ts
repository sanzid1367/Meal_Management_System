import type { Deposit, Expense, MealEntry, Member, ScheduleEntry, Summary, User, Mess } from "../types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem("access_token") : null;
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
        if (token) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("user");
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }
      }
    }
    let errorMsg = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        errorMsg = parsed.detail || parsed.message || parsed.error || text;
      }
    } catch (e) {}
    throw new Error(errorMsg || response.statusText);
  }
  return response.json() as Promise<T>;
}

export const api = {
  summary: () => request<Summary>("/api/summary"),
  members: (includeInactive = true) => request<Member[]>(`/api/members?include_inactive=${includeInactive}`),
  createMember: (data: { name: string; phone?: string; entry_date: string; password?: string }) =>
    request<Member>("/api/members", { method: "POST", body: JSON.stringify(data) }),
  updateMember: (id: number, data: Partial<Member>) =>
    request<Member>(`/api/members/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deposits: () => request<Deposit[]>("/api/deposits"),
  createDeposit: (data: { member_id: number; date: string; amount: number; note?: string }) =>
    request<Deposit>("/api/deposits", { method: "POST", body: JSON.stringify(data) }),
  updateDeposit: (id: number, data: Partial<Deposit>) =>
    request<Deposit>(`/api/deposits/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteDeposit: (id: number) =>
    request<{ success: boolean }>(`/api/deposits/${id}`, { method: "DELETE" }),
  expenses: () => request<Expense[]>("/api/expenses"),
  createExpense: (data: { date: string; amount: number; description: string; shopper_member_id?: number | null }) =>
    request<Expense>("/api/expenses", { method: "POST", body: JSON.stringify(data) }),
  updateExpense: (id: number, data: Partial<Expense>) =>
    request<Expense>(`/api/expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteExpense: (id: number) =>
    request<{ success: boolean }>(`/api/expenses/${id}`, { method: "DELETE" }),
  meals: (start: string, end: string) => request<MealEntry[]>(`/api/meals?start=${start}&end=${end}`),
  saveMeals: (entries: Array<Omit<MealEntry, "id" | "mess_id">>) =>
    request<{ updated: number }>("/api/meals", { method: "PUT", body: JSON.stringify({ entries }) }),
  schedule: () => request<ScheduleEntry[]>("/api/schedule"),
  saveSchedule: (data: { date: string; member_id: number; note?: string }) =>
    request<{ ok: boolean }>("/api/schedule", { method: "PUT", body: JSON.stringify(data) }),
  closeMonth: () => request<{ new_month: { name: string } }>("/api/months/close", { method: "POST" }),
  
  // Mess / Tenant operations
  getMess: () => request<Mess | Mess[]>("/api/messes"),
  publicMesses: () => request<Array<{ id: number; name: string }>>("/api/messes/public"),
  createMess: (data: { name: string }) =>
    request<{ mess: Mess; user: User; access_token: string }>("/api/messes", { method: "POST", body: JSON.stringify(data) }),
  joinMess: (data: { join_code: string }) =>
    request<{ mess: Mess; user: User; access_token: string; message: string }>("/api/messes/join", { method: "POST", body: JSON.stringify(data) }),

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
      let errorMsg = text;
      try {
        const json = JSON.parse(text);
        if (json.detail) errorMsg = json.detail;
      } catch (e) {}
      throw new Error(errorMsg || response.statusText);
    }
    return response.json() as Promise<{ access_token: string; user: User }>;
  },
  register: (data: { username: string; password: string; role?: string; mess_id?: number | null; mess_name?: string }) =>
    request<{ access_token: string; user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
  me: () => request<User & { mess?: Mess }>("/api/auth/me"),
  shareInfo: () => request<{ local_ip: string; port: number; share_url: string }>("/api/share-info")
};
