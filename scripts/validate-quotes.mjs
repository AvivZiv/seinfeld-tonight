import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const QUOTES_PATH = path.join(projectRoot, "data", "quotes.json");

const requiredKeys = [
  "id",
  "text",
  "speaker",
  "listener",
  "situation",
  "episodeTitle",
  "season",
  "episode",
  "source",
];

const main = async () => {
  const raw = await fs.readFile(QUOTES_PATH, "utf-8");
  const quotes = JSON.parse(raw);

  if (!Array.isArray(quotes)) {
    throw new Error("Quotes file is not an array.");
  }

  const errors = [];
  const ids = new Set();
  quotes.forEach((quote, index) => {
    requiredKeys.forEach((key) => {
      if (!(key in quote)) {
        errors.push(`Missing key '${key}' at index ${index}`);
      }
    });
    if (quote.id) {
      if (ids.has(quote.id)) {
        errors.push(`Duplicate id '${quote.id}'`);
      }
      ids.add(quote.id);
    }
    if (!quote.text || typeof quote.text !== "string") {
      errors.push(`Invalid text at index ${index}`);
    }
  });

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log(`Quotes validation passed (${quotes.length} entries).`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
