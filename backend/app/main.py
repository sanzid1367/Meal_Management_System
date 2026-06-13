from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Response, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm

from .database import db, init_db, row_to_dict, rows_to_dicts, utc_now
from .auth import get_current_user, create_access_token, verify_password, get_password_hash, ACCESS_TOKEN_EXPIRE_MINUTES
from .schemas import (
    DepositCreate,
    DepositUpdate,
    ExpenseCreate,
    ExpenseUpdate,
    MealBulkUpsert,
    MemberCreate,
    MemberUpdate,
    ScheduleUpsert,
    UserCreate,
    Token,
)


app = FastAPI(title="Local Mess Meal Manager", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    
    import socket
    def get_ip():
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip
        
    local_ip = get_ip()
    print("\n" + "="*60)
    print(" 🎉 Local Mess Meal Manager is running! 🎉")
    print(f" • Access locally:      http://localhost:8000")
    if local_ip != '127.0.0.1':
        print(f" • Share with members:  http://{local_ip}:8000")
    print("="*60 + "\n")


def active_month(conn) -> dict:
    month = conn.execute("SELECT * FROM months WHERE is_active = 1").fetchone()
    if month is None:
        name = date.today().strftime("%Y-%m")
        conn.execute(
            "INSERT INTO months (name, start_date, is_active) VALUES (?, ?, 1)",
            (name, f"{name}-01"),
        )
        month = conn.execute("SELECT * FROM months WHERE is_active = 1").fetchone()
    return row_to_dict(month)


def validate_member(conn, member_id: int) -> None:
    exists = conn.execute("SELECT id FROM members WHERE id = ?", (member_id,)).fetchone()
    if exists is None:
        raise HTTPException(status_code=404, detail="Member not found")



def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return user


def validate_half_step(value: float, field: str) -> None:
    if round(value * 2) != value * 2:
        raise HTTPException(status_code=422, detail=f"{field} must use 0.5 increments")


def build_summary(conn, month_id: int) -> dict:
    month = row_to_dict(conn.execute("SELECT * FROM months WHERE id = ?", (month_id,)).fetchone())
    members = rows_to_dicts(
        conn.execute(
            """
            SELECT m.*,
                   COALESCE(ob.amount, 0) AS opening_balance,
                   ob.note AS opening_note
            FROM members m
            LEFT JOIN opening_balances ob
              ON ob.member_id = m.id AND ob.month_id = ?
            ORDER BY m.is_active DESC, LOWER(m.name)
            """,
            (month_id,),
        ).fetchall()
    )
    total_expense = float(
        conn.execute("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE month_id = ?", (month_id,)).fetchone()[0]
    )
    total_deposit = float(
        conn.execute("SELECT COALESCE(SUM(amount), 0) FROM deposits WHERE month_id = ?", (month_id,)).fetchone()[0]
    )
    opening_total = float(
        conn.execute("SELECT COALESCE(SUM(amount), 0) FROM opening_balances WHERE month_id = ?", (month_id,)).fetchone()[0]
    )
    total_meals = float(
        conn.execute(
            "SELECT COALESCE(SUM(count + guest_count), 0) FROM meal_entries WHERE month_id = ?",
            (month_id,),
        ).fetchone()[0]
    )
    meal_rate = total_expense / total_meals if total_meals else 0

    member_rows = rows_to_dicts(
        conn.execute(
            """
            SELECT m.id, m.name, m.phone, m.is_active,
                   COALESCE(ob.amount, 0) AS opening_balance,
                   COALESCE(d.total_deposit, 0) AS total_deposit,
                   COALESCE(me.total_member_meals, 0) AS total_member_meals,
                   COALESCE(me.total_guest_meals, 0) AS total_guest_meals
            FROM members m
            LEFT JOIN opening_balances ob ON ob.member_id = m.id AND ob.month_id = ?
            LEFT JOIN (
              SELECT member_id, SUM(amount) AS total_deposit
              FROM deposits WHERE month_id = ? GROUP BY member_id
            ) d ON d.member_id = m.id
            LEFT JOIN (
              SELECT member_id,
                     SUM(count) AS total_member_meals,
                     SUM(guest_count) AS total_guest_meals
              FROM meal_entries WHERE month_id = ? GROUP BY member_id
            ) me ON me.member_id = m.id
            ORDER BY m.is_active DESC, LOWER(m.name)
            """,
            (month_id, month_id, month_id),
        ).fetchall()
    )
    for member in member_rows:
        meals = float(member["total_member_meals"]) + float(member["total_guest_meals"])
        member["total_meals"] = meals
        member["meal_cost"] = meals * meal_rate
        member["available_funds"] = float(member["opening_balance"]) + float(member["total_deposit"])
        member["balance"] = member["available_funds"] - member["meal_cost"]

    return {
        "month": month,
        "members": members,
        "member_summaries": member_rows,
        "totals": {
            "total_expense": total_expense,
            "total_deposit": total_deposit,
            "opening_balance_total": opening_total,
            "total_meals": total_meals,
            "meal_rate": meal_rate,
            "cash_in_hand": total_deposit - total_expense,
            "book_balance": total_deposit + opening_total - total_expense,
        },
    }



@app.post("/api/auth/register", status_code=201)
def register(payload: UserCreate):
    with db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE username = ?", (payload.username,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Username already registered")
        hashed_password = get_password_hash(payload.password)
        cursor = conn.execute(
            "INSERT INTO users (username, hashed_password, role, created_at) VALUES (?, ?, 'member', ?)",
            (payload.username, hashed_password, utc_now()),
        )
        user = conn.execute("SELECT id, username, role, created_at FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return row_to_dict(user)

@app.post("/api/auth/token", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE username = ?", (form_data.username,)).fetchone()
        if not user or not verify_password(form_data.password, user["hashed_password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        access_token = create_access_token(data={"sub": user["username"]})
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "created_at": user["created_at"],
            }
        }

@app.get("/api/auth/me")
def read_users_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "role": current_user["role"],
        "created_at": current_user["created_at"],
    }

@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/share-info")
def get_share_info(current_user: dict = Depends(get_current_user)) -> dict:
    import socket
    def get_ip():
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))
            ip = s.getsockname()[0]
        except Exception:
            ip = '127.0.0.1'
        finally:
            s.close()
        return ip
    local_ip = get_ip()
    return {
        "local_ip": local_ip,
        "port": 8000,
        "share_url": f"http://{local_ip}:8000" if local_ip != '127.0.0.1' else "http://localhost:8000"
    }


@app.get("/api/months/active")
def get_active_month(current_user: dict = Depends(get_current_user)) -> dict:
    with db() as conn:
        return active_month(conn)


@app.get("/api/summary")
def get_summary(current_user: dict = Depends(get_current_user)) -> dict:
    with db() as conn:
        month = active_month(conn)
        return build_summary(conn, month["id"])


@app.get("/api/members")
def list_members(include_inactive: bool = False, current_user: dict = Depends(get_current_user)) -> list[dict]:
    with db() as conn:
        where = "" if include_inactive else "WHERE is_active = 1"
        rows = conn.execute(f"SELECT * FROM members {where} ORDER BY is_active DESC, LOWER(name)").fetchall()
        return rows_to_dicts(rows)


@app.post("/api/members", status_code=201)
def create_member(payload: MemberCreate, admin_user: dict = Depends(require_admin)) -> dict:
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO members (name, phone, entry_date, created_at) VALUES (?, ?, ?, ?)",
            (payload.name.strip(), payload.phone, payload.entry_date.isoformat(), utc_now()),
        )
        return row_to_dict(conn.execute("SELECT * FROM members WHERE id = ?", (cursor.lastrowid,)).fetchone())


@app.patch("/api/members/{member_id}")
def update_member(member_id: int, payload: MemberUpdate, admin_user: dict = Depends(require_admin)) -> dict:
    with db() as conn:
        validate_member(conn, member_id)
        current = row_to_dict(conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone())
        data = payload.model_dump(exclude_unset=True)
        fields: list[str] = []
        values: list[object] = []
        for key, value in data.items():
            if key == "entry_date" and value is not None:
                value = value.isoformat()
            if key == "is_active":
                value = 1 if value else 0
                if not value and current["is_active"]:
                    fields.append("deactivated_at = ?")
                    values.append(utc_now())
                if value:
                    fields.append("deactivated_at = NULL")
            fields.append(f"{key} = ?")
            values.append(value)
        if fields:
            conn.execute(f"UPDATE members SET {', '.join(fields)} WHERE id = ?", (*values, member_id))
        return row_to_dict(conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone())


@app.get("/api/deposits")
def list_deposits(current_user: dict = Depends(get_current_user)) -> list[dict]:
    with db() as conn:
        month = active_month(conn)
        rows = conn.execute(
            """
            SELECT d.*, m.name AS member_name
            FROM deposits d
            JOIN members m ON m.id = d.member_id
            WHERE d.month_id = ?
            ORDER BY d.date DESC, d.id DESC
            """,
            (month["id"],),
        ).fetchall()
        return rows_to_dicts(rows)


@app.post("/api/deposits", status_code=201)
def create_deposit(payload: DepositCreate, admin_user: dict = Depends(require_admin)) -> dict:
    with db() as conn:
        month = active_month(conn)
        validate_member(conn, payload.member_id)
        cursor = conn.execute(
            "INSERT INTO deposits (member_id, month_id, date, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (payload.member_id, month["id"], payload.date.isoformat(), payload.amount, payload.note, utc_now()),
        )
        return row_to_dict(conn.execute("SELECT * FROM deposits WHERE id = ?", (cursor.lastrowid,)).fetchone())


@app.patch("/api/deposits/{deposit_id}")
def update_deposit(deposit_id: int, payload: DepositUpdate, admin_user: dict = Depends(require_admin)) -> dict:
    with db() as conn:
        if conn.execute("SELECT id FROM deposits WHERE id = ?", (deposit_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Deposit not found")
        data = payload.model_dump(exclude_unset=True)
        fields: list[str] = []
        values: list[object] = []
        for key, value in data.items():
            if key == "member_id" and value is not None:
                validate_member(conn, value)
            if key == "date" and value is not None:
                value = value.isoformat()
            fields.append(f"{key} = ?")
            values.append(value)
        if fields:
            conn.execute(f"UPDATE deposits SET {', '.join(fields)} WHERE id = ?", (*values, deposit_id))
        return row_to_dict(conn.execute("SELECT * FROM deposits WHERE id = ?", (deposit_id,)).fetchone())


@app.get("/api/expenses")
def list_expenses(current_user: dict = Depends(get_current_user)) -> list[dict]:
    with db() as conn:
        month = active_month(conn)
        rows = conn.execute(
            """
            SELECT e.*, m.name AS shopper_name
            FROM expenses e
            LEFT JOIN members m ON m.id = e.shopper_member_id
            WHERE e.month_id = ?
            ORDER BY e.date DESC, e.id DESC
            """,
            (month["id"],),
        ).fetchall()
        return rows_to_dicts(rows)


@app.post("/api/expenses", status_code=201)
def create_expense(payload: ExpenseCreate, admin_user: dict = Depends(require_admin)) -> dict:
    with db() as conn:
        month = active_month(conn)
        if payload.shopper_member_id is not None:
            validate_member(conn, payload.shopper_member_id)
        cursor = conn.execute(
            """
            INSERT INTO expenses (month_id, date, amount, description, shopper_member_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                month["id"],
                payload.date.isoformat(),
                payload.amount,
                payload.description.strip(),
                payload.shopper_member_id,
                utc_now(),
            ),
        )
        return row_to_dict(conn.execute("SELECT * FROM expenses WHERE id = ?", (cursor.lastrowid,)).fetchone())


@app.patch("/api/expenses/{expense_id}")
def update_expense(expense_id: int, payload: ExpenseUpdate, admin_user: dict = Depends(require_admin)) -> dict:
    with db() as conn:
        if conn.execute("SELECT id FROM expenses WHERE id = ?", (expense_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Expense not found")
        data = payload.model_dump(exclude_unset=True)
        fields: list[str] = []
        values: list[object] = []
        for key, value in data.items():
            if key == "shopper_member_id" and value is not None:
                validate_member(conn, value)
            if key == "date" and value is not None:
                value = value.isoformat()
            fields.append(f"{key} = ?")
            values.append(value)
        if fields:
            conn.execute(f"UPDATE expenses SET {', '.join(fields)} WHERE id = ?", (*values, expense_id))
        return row_to_dict(conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone())


@app.get("/api/meals")
def list_meals(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
) -> list[dict]:
    with db() as conn:
        month = active_month(conn)
        clauses = ["month_id = ?"]
        values: list[object] = [month["id"]]
        if start:
            clauses.append("date >= ?")
            values.append(start.isoformat())
        if end:
            clauses.append("date <= ?")
            values.append(end.isoformat())
        rows = conn.execute(
            f"SELECT * FROM meal_entries WHERE {' AND '.join(clauses)} ORDER BY date, member_id, meal_type",
            values,
        ).fetchall()
        return rows_to_dicts(rows)


@app.put("/api/meals")
def upsert_meals(payload: MealBulkUpsert, admin_user: dict = Depends(require_admin)) -> dict:
    with db() as conn:
        month = active_month(conn)
        for entry in payload.entries:
            validate_member(conn, entry.member_id)
            validate_half_step(entry.count, "count")
            validate_half_step(entry.guest_count, "guest_count")
            conn.execute(
                """
                INSERT INTO meal_entries (month_id, member_id, date, meal_type, count, guest_count, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(month_id, member_id, date, meal_type)
                DO UPDATE SET count = excluded.count,
                              guest_count = excluded.guest_count,
                              updated_at = excluded.updated_at
                """,
                (
                    month["id"],
                    entry.member_id,
                    entry.date.isoformat(),
                    entry.meal_type,
                    entry.count,
                    entry.guest_count,
                    utc_now(),
                ),
            )
        return {"updated": len(payload.entries)}


@app.get("/api/schedule")
def list_schedule(current_user: dict = Depends(get_current_user)) -> list[dict]:
    with db() as conn:
        month = active_month(conn)
        rows = conn.execute(
            """
            SELECT s.*, m.name AS member_name
            FROM bazar_schedule s
            JOIN members m ON m.id = s.member_id
            WHERE s.month_id = ?
            ORDER BY s.date
            """,
            (month["id"],),
        ).fetchall()
        return rows_to_dicts(rows)


@app.put("/api/schedule")
def upsert_schedule(payload: ScheduleUpsert, admin_user: dict = Depends(require_admin)) -> dict:
    with db() as conn:
        month = active_month(conn)
        validate_member(conn, payload.member_id)
        conn.execute(
            """
            INSERT INTO bazar_schedule (month_id, date, member_id, note)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(month_id, date)
            DO UPDATE SET member_id = excluded.member_id, note = excluded.note
            """,
            (month["id"], payload.date.isoformat(), payload.member_id, payload.note),
        )
        return {"ok": True}


@app.post("/api/months/close")
def close_month(admin_user: dict = Depends(require_admin)) -> dict:
    with db() as conn:
        month = active_month(conn)
        summary = build_summary(conn, month["id"])
        now = utc_now()
        conn.execute(
            "INSERT OR REPLACE INTO month_closings (month_id, summary_json, closed_at) VALUES (?, ?, ?)",
            (month["id"], json.dumps(summary), now),
        )
        conn.execute("UPDATE months SET is_active = 0, closed_at = ? WHERE id = ?", (now, month["id"]))

        current_start = datetime.strptime(month["start_date"], "%Y-%m-%d").date()
        next_month_start = (current_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        next_name = next_month_start.strftime("%Y-%m")
        conn.execute(
            "INSERT OR IGNORE INTO months (name, start_date, is_active) VALUES (?, ?, 0)",
            (next_name, next_month_start.isoformat()),
        )
        next_month = row_to_dict(conn.execute("SELECT * FROM months WHERE name = ?", (next_name,)).fetchone())
        conn.execute("UPDATE months SET is_active = 1 WHERE id = ?", (next_month["id"],))

        for member in summary["member_summaries"]:
            conn.execute(
                """
                INSERT INTO opening_balances (member_id, month_id, amount, note, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(member_id, month_id)
                DO UPDATE SET amount = excluded.amount, note = excluded.note
                """,
                (
                    member["id"],
                    next_month["id"],
                    round(member["balance"], 2),
                    f"Rollover from {month['name']}",
                    now,
                ),
            )
        return {"closed_month": month, "new_month": next_month, "summary": summary}


@app.get("/api/export/summary.csv")
def export_summary_csv(current_user: dict = Depends(get_current_user)) -> Response:
    with db() as conn:
        month = active_month(conn)
        summary = build_summary(conn, month["id"])
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Month", month["name"]])
    writer.writerow([])
    writer.writerow(["Member", "Opening", "Deposits", "Meals", "Cost", "Balance"])
    for member in summary["member_summaries"]:
        writer.writerow(
            [
                member["name"],
                f"{member['opening_balance']:.2f}",
                f"{member['total_deposit']:.2f}",
                f"{member['total_meals']:.1f}",
                f"{member['meal_cost']:.2f}",
                f"{member['balance']:.2f}",
            ]
        )
    writer.writerow([])
    writer.writerow(["Total expense", f"{summary['totals']['total_expense']:.2f}"])
    writer.writerow(["Total deposit", f"{summary['totals']['total_deposit']:.2f}"])
    writer.writerow(["Total meals", f"{summary['totals']['total_meals']:.1f}"])
    writer.writerow(["Meal rate", f"{summary['totals']['meal_rate']:.2f}"])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=mess-summary-{month['name']}.csv"},
    )


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
