'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@/components/Auth';

export default function VirusPage() {
  const router = useRouter();

  // If already logged in, redirect
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('user');
      if (saved) {
        router.push('/');
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <Auth onLogin={() => {
        router.push('/');
      }} />
    </div>
  );
}
