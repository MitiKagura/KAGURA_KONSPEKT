import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { ollamaStatus } from "@/lib/ollama";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = await ollamaStatus();
  return NextResponse.json(status);
}
