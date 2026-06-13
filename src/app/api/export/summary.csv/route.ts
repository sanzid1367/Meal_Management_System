import { getActiveMonth, buildSummary } from '@/lib/db-helpers';
import { getCurrentUser } from '@/lib/auth';
import { initDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await initDb();
    

    const month = await getActiveMonth();
    const summary = await buildSummary(month.id);

    // Build CSV rows
    const csvRows: string[][] = [];
    csvRows.push(["Month", month.name]);
    csvRows.push([]);
    csvRows.push(["Member", "Opening", "Deposits", "Meals", "Cost", "Balance"]);
    
    for (const member of summary.member_summaries) {
      csvRows.push([
        member.name,
        member.opening_balance.toFixed(2),
        member.total_deposit.toFixed(2),
        member.total_meals.toFixed(1),
        member.meal_cost.toFixed(2),
        member.balance.toFixed(2)
      ]);
    }
    
    csvRows.push([]);
    csvRows.push(["Total expense", summary.totals.total_expense.toFixed(2)]);
    csvRows.push(["Total deposit", summary.totals.total_deposit.toFixed(2)]);
    csvRows.push(["Total meals", summary.totals.total_meals.toFixed(1)]);
    csvRows.push(["Meal rate", summary.totals.meal_rate.toFixed(2)]);

    // Escape and join rows
    const csvContent = csvRows
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="mess-summary-${month.name}.csv"`,
      },
    });
  } catch (error: any) {
    return new Response(error.message || "Failed to export CSV", { status: 500 });
  }
}
