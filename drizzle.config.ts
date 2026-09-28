import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit сам подхватит .env; config() — страховка
config({ path: ".env" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@127.0.0.1:55432/kagura_db",
  },
});
