import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const g = globalThis as unknown as { __fashionDb?: DB; __fashionSql?: postgres.Sql };

function connect(): DB {
  const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/fashion_studio";
  const remote = !/localhost|127\.0\.0\.1/.test(url);
  const sql = postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    ssl: remote ? "require" : undefined,
    onnotice: () => {},
  });
  g.__fashionSql = sql;
  return drizzle(sql, { schema });
}

/** Lazily-created singleton (survives Next dev HMR). */
export function db(): DB {
  if (!g.__fashionDb) g.__fashionDb = connect();
  return g.__fashionDb;
}

export async function closeDb() {
  await g.__fashionSql?.end({ timeout: 5 });
  g.__fashionDb = undefined;
  g.__fashionSql = undefined;
}

export { schema };
