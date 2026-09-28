import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ user });
}
