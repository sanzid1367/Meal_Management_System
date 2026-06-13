# MessSync — Meal Management System (Next.js Edition)

A modern, full-stack, offline-first mess/meal management system for tracking member meals, deposits, daily expenses, balances, roster scheduling, and monthly summaries with CSV exports.

Built using **Next.js (App Router)** and **PostgreSQL** — ready for one-click deployment to **Vercel** and cloud database services like **Supabase** or **Neon**.

---

## Deploy to Vercel (Recommended)

You can deploy this entire application (frontend, API routes, and database initialization) to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsanzid1367%2FMeal_Management_System&envDescription=Provide%20a%20PostgreSQL%20database%20connection%20URL%20and%20session%20key.&envLink=https%3A%2F%2Fneon.tech&env=DATABASE_URL,JWT_SECRET)

### Steps to Deploy manually:
1. Push this project to your GitHub repository: `https://github.com/sanzid1367/Meal_Management_System`.
2. Get a free PostgreSQL database URL from [Neon.tech](https://neon.tech) or [Supabase.com](https://supabase.com).
3. Log in to [Vercel](https://vercel.com) and click **Add New > Project**.
4. Import your GitHub repository.
5. In the **Environment Variables** section, add the following variables:
   - `DATABASE_URL`: Your cloud PostgreSQL connection string (e.g. `postgresql://...`).
   - `JWT_SECRET`: A secure, random text string for encoding session tokens.
6. Click **Deploy**. Vercel will build and launch your application!

---

## Local Development Setup

If you want to run the project locally on your machine:

### Prerequisites
- Node.js (v18 or higher)
- A local or remote PostgreSQL database instance

### Steps:
1. Clone the repository and navigate to the project root:
   ```bash
   cd Meal_Management_System
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory and add your database URL:
   ```env
   DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<dbname>?sslmode=require"
   JWT_SECRET="develop-secret-key-12345"
   ```
4. Start the local development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```
   *Note: The app will automatically initialize database tables and seed a default admin user (`username: admin`, `password: admin123`) on your first visit!*

---

## Features Included
- **Dynamic Local IP sharing**: Click "Share System" in the header to get a scan-to-open QR code or direct Wi-Fi URL for members on the same network.
- **Member Ledgers**: Add, deactivate, and track balances.
- **Deposit & Expense tracking**: Complete audit history of monthly bazar shopping and deposits.
- **Daily Meal Grid**: Enter guest and member meals in 0.5 increments.
- **Bazar Roster**: Schedule members for daily shopping tasks.
- **Month Rollover**: Automatically carry over member balances to the new month with one click.
- **CSV Export**: Instantly export a printable summary sheet.
