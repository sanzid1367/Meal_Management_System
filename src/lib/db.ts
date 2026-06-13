import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // We don't throw immediately so build-time static checks don't fail, 
  // but we will throw if a query is actually executed.
  console.warn("⚠️ DATABASE_URL is not set. Database queries will fail.");
}

const globalForDb = global as unknown as { sql: postgres.Sql<{}> };

export const sql = globalForDb.sql || postgres(connectionString || '', {
  ssl: connectionString ? 'require' : false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql;

// Helper to check and init database tables
let isDbInitialized = false;

export async function initDb() {
  if (isDbInitialized) return;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Cannot initialize database.");
  }

  try {
    // 1. Create months table
    await sql`
      CREATE TABLE IF NOT EXISTS months (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        start_date TEXT NOT NULL,
        closed_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 0
      );
    `;

    // 2. Create members table
    await sql`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        entry_date TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        deactivated_at TEXT
      );
    `;

    // 3. Create opening_balances table
    await sql`
      CREATE TABLE IF NOT EXISTS opening_balances (
        id SERIAL PRIMARY KEY,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(member_id, month_id)
      );
    `;

    // 4. Create deposits table
    await sql`
      CREATE TABLE IF NOT EXISTS deposits (
        id SERIAL PRIMARY KEY,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        note TEXT,
        created_at TEXT NOT NULL
      );
    `;

    // 5. Create expenses table
    await sql`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        description TEXT NOT NULL,
        shopper_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );
    `;

    // 6. Create meal_entries table
    await sql`
      CREATE TABLE IF NOT EXISTS meal_entries (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        meal_type TEXT NOT NULL CHECK(meal_type IN ('lunch', 'dinner')),
        count REAL NOT NULL DEFAULT 0 CHECK(count >= 0),
        guest_count REAL NOT NULL DEFAULT 0 CHECK(guest_count >= 0),
        updated_at TEXT NOT NULL,
        UNIQUE(month_id, member_id, date, meal_type)
      );
    `;

    // 7. Create bazar_schedule table
    await sql`
      CREATE TABLE IF NOT EXISTS bazar_schedule (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        note TEXT,
        UNIQUE(month_id, date)
      );
    `;

    // 8. Create month_closings table
    await sql`
      CREATE TABLE IF NOT EXISTS month_closings (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL UNIQUE REFERENCES months(id) ON DELETE CASCADE,
        summary_json TEXT NOT NULL,
        closed_at TEXT NOT NULL
      );
    `;

    // 9. Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        hashed_password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL
      );
    `;

    // 10. Seed default admin if it doesn't exist
    const adminExists = await sql`
      SELECT id FROM users WHERE username = 'admin' LIMIT 1
    `;

    if (adminExists.length === 0) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      await sql`
        INSERT INTO users (username, hashed_password, role, created_at)
        VALUES ('admin', ${hashedPassword}, 'admin', ${now})
      `;
      console.log(" seeded default admin user (admin / admin123)");
    }

    isDbInitialized = true;
  } catch (error) {
    console.error("❌ Failed to initialize database:", error);
    throw error;
  }
}
