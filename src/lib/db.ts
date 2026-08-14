import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL || '';

const globalForDb = global as unknown as { sql: any };

function getDatabaseInstance(): any {
  if (globalForDb.sql) return globalForDb.sql;

  if (!connectionString) {
    console.warn("⚠️ DATABASE_URL is not set. Please configure your PostgreSQL connection string in .env");
  }

  const pgSql = postgres(connectionString, {
    ssl: connectionString.includes('sslmode=require') || connectionString.includes('supabase') || connectionString.includes('neon') ? 'require' : false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForDb.sql = pgSql;
  }
  return pgSql;
}

export const sql: any = getDatabaseInstance();

let isDbInitialized = false;

export async function initDb() {
  if (isDbInitialized) return;

  try {
    // 1. Create messes table (Tenants)
    await sql`
      CREATE TABLE IF NOT EXISTS messes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        join_code TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        created_by INTEGER
      );
    `;

    // 2. Create months table
    await sql`
      CREATE TABLE IF NOT EXISTS months (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        closed_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 0,
        mess_id INTEGER REFERENCES messes(id) ON DELETE CASCADE
      );
    `;

    // 3. Create members table
    await sql`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        entry_date TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        deactivated_at TEXT,
        mess_id INTEGER REFERENCES messes(id) ON DELETE CASCADE,
        user_id INTEGER
      );
    `;

    // 4. Create opening_balances table
    await sql`
      CREATE TABLE IF NOT EXISTS opening_balances (
        id SERIAL PRIMARY KEY,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        amount NUMERIC NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        mess_id INTEGER REFERENCES messes(id) ON DELETE CASCADE,
        UNIQUE(member_id, month_id)
      );
    `;

    // 5. Create deposits table
    await sql`
      CREATE TABLE IF NOT EXISTS deposits (
        id SERIAL PRIMARY KEY,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        amount NUMERIC NOT NULL CHECK(amount >= 0),
        note TEXT,
        created_at TEXT NOT NULL,
        mess_id INTEGER REFERENCES messes(id) ON DELETE CASCADE
      );
    `;

    // 6. Create expenses table
    await sql`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        amount NUMERIC NOT NULL CHECK(amount >= 0),
        description TEXT NOT NULL,
        shopper_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        mess_id INTEGER REFERENCES messes(id) ON DELETE CASCADE
      );
    `;

    // 7. Create meal_entries table
    await sql`
      CREATE TABLE IF NOT EXISTS meal_entries (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        meal_type TEXT NOT NULL CHECK(meal_type IN ('lunch', 'dinner')),
        count NUMERIC NOT NULL DEFAULT 0 CHECK(count >= 0),
        guest_count NUMERIC NOT NULL DEFAULT 0 CHECK(guest_count >= 0),
        updated_at TEXT NOT NULL,
        mess_id INTEGER REFERENCES messes(id) ON DELETE CASCADE,
        UNIQUE(month_id, member_id, date, meal_type)
      );
    `;

    // 8. Create bazar_schedule table
    await sql`
      CREATE TABLE IF NOT EXISTS bazar_schedule (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        note TEXT,
        mess_id INTEGER REFERENCES messes(id) ON DELETE CASCADE,
        UNIQUE(month_id, date)
      );
    `;

    // 9. Create month_closings table
    await sql`
      CREATE TABLE IF NOT EXISTS month_closings (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        summary_json TEXT NOT NULL,
        closed_at TEXT NOT NULL,
        mess_id INTEGER REFERENCES messes(id) ON DELETE CASCADE,
        UNIQUE(month_id)
      );
    `;

    // 10. Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        hashed_password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL,
        mess_id INTEGER REFERENCES messes(id) ON DELETE SET NULL,
        member_id INTEGER
      );
    `;

    // Ensure unique indexes for ON CONFLICT resolution
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_opening_balances_uniq ON opening_balances (member_id, month_id);`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_entries_uniq ON meal_entries (month_id, member_id, date, meal_type);`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_bazar_schedule_uniq ON bazar_schedule (month_id, date);`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_month_closings_uniq ON month_closings (month_id);`;

    // Seed default mess if no messes exist
    const defaultMesses = await sql`
      SELECT id FROM messes LIMIT 1
    `;

    let defaultMessId = defaultMesses.length > 0 ? defaultMesses[0].id : null;

    if (!defaultMessId) {
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const newMess = await sql`
        INSERT INTO messes (name, join_code, created_at)
        VALUES ('Main Mess', 'MESSSYNC01', ${now})
        RETURNING id
      `;
      defaultMessId = newMess[0].id;
    }

    // Seed default super admin if no admin exists
    const adminExists = await sql`
      SELECT id, role, mess_id FROM users WHERE username = 'admin' LIMIT 1
    `;

    if (adminExists.length === 0) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      await sql`
        INSERT INTO users (username, hashed_password, role, mess_id, created_at)
        VALUES ('admin', ${hashedPassword}, 'super_admin', ${defaultMessId}, ${now})
      `;
    }

    isDbInitialized = true;
  } catch (error) {
    console.error("❌ Failed to initialize PostgreSQL database:", error);
    throw error;
  }
}
