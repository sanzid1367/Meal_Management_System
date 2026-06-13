import re

with open(r"e:\Meal\backend\app\main.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
imports = """from fastapi import FastAPI, HTTPException, Query, Response, Depends, status
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
)"""

content = re.sub(
    r"from fastapi import FastAPI.*ScheduleUpsert,\n\)", 
    imports, 
    content, 
    flags=re.DOTALL
)

# 2. Add require_admin
require_admin_code = """
def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return user
"""
content = content.replace("def validate_half_step(value: float, field: str) -> None:", require_admin_code + "\n\ndef validate_half_step(value: float, field: str) -> None:")


# 3. Add Auth Endpoints
auth_endpoints = """
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
"""
content = content.replace("@app.get(\"/api/health\")", auth_endpoints + "\n@app.get(\"/api/health\")")

# 4. Inject Dependencies into Endpoints
# For GET routes, we require Depends(get_current_user)
# For POST/PUT/PATCH, we require Depends(require_admin)

def patch_endpoint(match):
    decorator = match.group(1)
    method = match.group(2).lower()
    path = match.group(3)
    func_def = match.group(4)
    args = match.group(5)
    
    # We don't protect /api/health or /api/auth routes
    if "auth" in path or "health" in path:
        return match.group(0)

    # Determine dependency
    dep = "current_user: dict = Depends(get_current_user)"
    if method in ["post", "put", "patch", "delete"]:
        dep = "admin_user: dict = Depends(require_admin)"
        
    if args.strip() == "":
        new_args = dep
    else:
        new_args = f"{args}, {dep}"
        
    return f"{decorator}\ndef {func_def}({new_args})"

content = re.sub(
    r"(@app\.(get|post|put|patch|delete)\(\"([^\"]+)\"[^\)]*\))\ndef ([a-zA-Z_0-9]+)\((.*?)\)",
    patch_endpoint,
    content
)

with open(r"e:\Meal\backend\app\main.py", "w", encoding="utf-8") as f:
    f.write(content)

print("Patched main.py")
