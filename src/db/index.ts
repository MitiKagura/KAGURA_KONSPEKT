import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Подхватываем .env даже если переменные не были проброшены извне
// (Next.js уже грузит .env, это — страховка для systemd/ручного запуска).
if (!process.env.DATABASE_URL) {
  config({ path: ".env" });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. " +
      "Создайте файл .env в корне проекта (см. .env.example / install.sh) " +
      "со строкой DATABASE_URL=postgresql://user:pass@127.0.0.1:55432/kagura_db " +
      "или установите переменную окружения DATABASE_URL.",
  );
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
