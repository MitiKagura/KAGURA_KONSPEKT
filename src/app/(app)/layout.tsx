import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getUser } from "@/lib/auth";
import Providers from "@/components/providers";
import AppShell from "@/components/shell";
import ViewModeProvider from "@/components/view-mode-provider";
import {
  VIEW_COOKIE,
  VIEW_PARAM,
  detectFromUserAgent,
  isViewMode,
} from "@/lib/view-mode";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
  searchParams,
}: {
  children: React.ReactNode;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  // Приоритет: адрес (?view=) → сохранённый выбор → тип устройства.
  const params = (await searchParams) ?? {};
  const rawParam = params[VIEW_PARAM];
  const fromUrl = Array.isArray(rawParam) ? rawParam[0] : rawParam;

  const cookieStore = await cookies();
  const saved = cookieStore.get(VIEW_COOKIE)?.value;
  const headerList = await headers();

  const initialMode = isViewMode(fromUrl)
    ? fromUrl
    : isViewMode(saved)
      ? saved
      : detectFromUserAgent(headerList.get("user-agent") || "");

  return (
    <Suspense fallback={null}>
      <ViewModeProvider initialMode={initialMode} initialPinned={isViewMode(fromUrl) || isViewMode(saved)}>
        <Providers>
          <AppShell user={user}>{children}</AppShell>
        </Providers>
      </ViewModeProvider>
    </Suspense>
  );
}
