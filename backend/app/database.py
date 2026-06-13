from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Iterator

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.environ.get("MEAL_DB_PATH", DATA_DIR / "meal_manager.db"))


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [row_to_dict(row) for row in rows]


def current_month_key() -> str:
    return date.today().strftime("%Y-%m")


def utc_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS months (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                start_date TEXT NOT NULL,
                closed_at TEXT,
                is_active INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT,
                entry_date TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                deactivated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS opening_balances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER NOT NULL REFERENCES members(id),
                month_id INTEGER NOT NULL REFERENCES months(id),
                amount REAL NOT NULL,
                note TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(member_id, month_id)
            );

            CREATE TABLE IF NOT EXISTS deposits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER NOT NULL REFERENCES members(id),
                month_id INTEGER NOT NULL REFERENCES months(id),
                date TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount >= 0),
                note TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month_id INTEGER NOT NULL REFERENCES months(id),
                date TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount >= 0),
                description TEXT NOT NULL,
                shopper_member_id INTEGER REFERENCES members(id),
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS meal_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month_id INTEGER NOT NULL REFERENCES months(id),
                member_id INTEGER NOT NULL REFERENCES members(id),
                date TEXT NOT NULL,
                meal_type TEXT NOT NULL CHECK(meal_type IN ('lunch', 'dinner')),
                count REAL NOT NULL DEFAULT 0 CHECK(count >= 0),
                guest_count REAL NOT NULL DEFAULT 0 CHECK(guest_count >= 0),
                updated_at TEXT NOT NULL,
                UNIQUE(month_id, member_id, date, meal_type)
            );

            CREATE TABLE IF NOT EXISTS bazar_schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month_id INTEGER NOT NULL REFERENCES months(id),
                date TEXT NOT NULL,
                member_id INTEGER NOT NULL REFERENCES members(id),
                note TEXT,
                UNIQUE(month_id, date)
            );

            CREATE TABLE IF NOT EXISTS month_closings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month_id INTEGER NOT NULL UNIQUE REFERENCES months(id),
                summary_json TEXT NOT NULL,
                closed_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                hashed_password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'member',
                created_at TEXT NOT NULL
            );
            """
        )
        active = conn.execute("SELECT id FROM months WHERE is_active = 1").fetchone()
        if active is None:
            month = current_month_key()
            conn.execute(
                "INSERT OR IGNORE INTO months (name, start_date, is_active) VALUES (?, ?, 1)",
                (month, f"{month}-01"),
            )

        admin = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
        if admin is None:
            hashed_pw = pwd_context.hash("admin123")
            conn.execute(
                "INSERT INTO users (username, hashed_password, role, created_at) VALUES (?, ?, ?, ?)",
                ("admin", hashed_pw, "admin", utc_now()),
            )
