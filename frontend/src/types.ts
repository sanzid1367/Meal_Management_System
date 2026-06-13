export type Member = {
  id: number;
  name: string;
  phone: string | null;
  entry_date: string;
  is_active: number;
  created_at: string;
  deactivated_at: string | null;
};

export type Month = {
  id: number;
  name: string;
  start_date: string;
  closed_at: string | null;
  is_active: number;
};

export type Deposit = {
  id: number;
  member_id: number;
  member_name?: string;
  date: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export type Expense = {
  id: number;
  date: string;
  amount: number;
  description: string;
  shopper_member_id: number | null;
  shopper_name?: string | null;
  created_at: string;
};

export type MealEntry = {
  id: number;
  member_id: number;
  date: string;
  meal_type: "lunch" | "dinner";
  count: number;
  guest_count: number;
};

export type ScheduleEntry = {
  id: number;
  date: string;
  member_id: number;
  member_name: string;
  note: string | null;
};

export type MemberSummary = {
  id: number;
  name: string;
  phone: string | null;
  is_active: number;
  opening_balance: number;
  total_deposit: number;
  total_member_meals: number;
  total_guest_meals: number;
  total_meals: number;
  meal_cost: number;
  available_funds: number;
  balance: number;
};

export type Summary = {
  month: Month;
  members: Array<Member & { opening_balance: number; opening_note: string | null }>;
  member_summaries: MemberSummary[];
  totals: {
    total_expense: number;
    total_deposit: number;
    opening_balance_total: number;
    total_meals: number;
    meal_rate: number;
    cash_in_hand: number;
    book_balance: number;
  };
};
