from __future__ import annotations

from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class MemberCreate(BaseModel):
    name: str = Field(min_length=1)
    phone: str | None = None
    entry_date: Date


class MemberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    phone: str | None = None
    entry_date: Date | None = None
    is_active: bool | None = None


class DepositCreate(BaseModel):
    member_id: int
    date: Date
    amount: float = Field(ge=0)
    note: str | None = None


class DepositUpdate(BaseModel):
    member_id: int | None = None
    date: Date | None = None
    amount: float | None = Field(default=None, ge=0)
    note: str | None = None


class ExpenseCreate(BaseModel):
    date: Date
    amount: float = Field(ge=0)
    description: str = Field(min_length=1)
    shopper_member_id: int | None = None


class ExpenseUpdate(BaseModel):
    date: Date | None = None
    amount: float | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, min_length=1)
    shopper_member_id: int | None = None


class MealEntryUpsert(BaseModel):
    member_id: int
    date: Date
    meal_type: Literal["lunch", "dinner"]
    count: float = Field(ge=0)
    guest_count: float = Field(default=0, ge=0)

    @field_validator("count", "guest_count")
    @classmethod
    def half_step(cls, value: float) -> float:
        if round(value * 2) != value * 2:
            raise ValueError("Meal values must use 0.5 increments")
        return value


class MealBulkUpsert(BaseModel):
    entries: list[MealEntryUpsert]


class ScheduleUpsert(BaseModel):
    date: Date
    member_id: int
    note: str | None = None


class UserCreate(BaseModel):
    username: str = Field(min_length=3)
    password: str = Field(min_length=6)


class User(BaseModel):
    id: int
    username: str
    role: str
    created_at: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: User
