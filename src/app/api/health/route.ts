import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus = "down";
  try {
    await db.execute(sql`select 1`);
    dbStatus = "up";
  } catch {
    dbStatus = "down";
  }
  return NextResponse.json({
    ok: true,
    app: "KAGURA-KONSPEKT",
    db: dbStatus,
    time: new Date().toISOString(),
  });
}
