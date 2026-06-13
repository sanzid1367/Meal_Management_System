import { NextResponse } from 'next/server';
import os from 'os';
import { getCurrentUser } from '@/lib/auth';
import { initDb } from '@/lib/db';

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    const networkInterface = interfaces[name];
    if (networkInterface) {
      for (const net of networkInterface) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

export async function GET(request: Request) {
  try {
    await initDb();
    
    // Auth check
    

    const localIp = getLocalIp();
    const port = process.env.PORT || 3000;
    
    return NextResponse.json({
      local_ip: localIp,
      port: Number(port),
      share_url: localIp !== '127.0.0.1' ? `http://${localIp}:${port}` : `http://localhost:${port}`
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || "Failed to fetch share info" }, { status: 500 });
  }
}
