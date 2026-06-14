'use client';

import React from 'react';
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface ExpenseChartProps {
  data: Array<{ day: string; cost: number }>;
}

export default function ExpenseChart({ data }: ExpenseChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.length ? data : [{ day: '1', cost: 0 }]}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} dy={10} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} dx={-10} />
        <RechartsTooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
            borderRadius: '12px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
          }}
          labelStyle={{ color: 'var(--foreground)', fontWeight: 'bold' }}
          itemStyle={{ color: 'var(--primary)' }}
        />
        <Line type="monotone" dataKey="cost" stroke="var(--primary)" strokeWidth={4} dot={{ r: 6, fill: 'var(--primary)', strokeWidth: 2, stroke: 'var(--card)' }} activeDot={{ r: 8 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
