// Prints remaining OpenRouter credit (never prints the key).
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);

const res = await fetch("https://openrouter.ai/api/v1/credits", {
  headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
});
const { data = {} } = await res.json();
console.log(`remaining $${((data.total_credits ?? 0) - (data.total_usage ?? 0)).toFixed(2)}`);
