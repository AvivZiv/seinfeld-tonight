import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const OUTPUT_PATH = path.join(projectRoot, "data", "quotes.json");
const OUTPUT_JS_PATH = path.join(projectRoot, "data", "quotes.js");

const WIKIQUOTE_URL = "https://en.wikiquote.org/wiki/Seinfeld";
const WIKIQUOTE_API =
  "https://en.wikiquote.org/w/api.php?action=parse&prop=text&format=json&origin=*";
const WIKIQUOTE_WIKITEXT_API =
  "https://en.wikiquote.org/w/api.php?action=parse&prop=wikitext&format=json&origin=*";

const FETCH_HEADERS = {
  "User-Agent": "seinfeld-tonight/1.0 (quotes scraper)",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchText = async (url) => {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
};

const fetchHtmlFromApi = async (page) => {
  const url = `${WIKIQUOTE_API}&page=${encodeURIComponent(page)}`;
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.parse?.text?.["*"] || "";
};

const fetchWikitextFromApi = async (page) => {
  const url = `${WIKIQUOTE_WIKITEXT_API}&page=${encodeURIComponent(page)}`;
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.parse?.wikitext?.["*"] || "";
};

const cleanText = (text) =>
  text.replace(/\s+/g, " ").replace(/\[\d+\]/g, "").trim();

const looksLikeCastLine = (text) => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > 220) return false;
  if (/^\d+$/.test(trimmed)) return true;
  // Lines like "Actor – Character" without punctuation are likely cast lists.
  return /^[A-Za-zÀ-ÿ .,'’\-()]+–[A-Za-zÀ-ÿ .,'’\-()]+$/.test(trimmed);
};

const looksLikeNavigation = (text) => {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return true;
  if (trimmed.includes("seasons") && trimmed.includes("main")) return true;
  if (trimmed.includes("quotes at the internet movie database")) return true;
  if (trimmed.includes("seinfeldscripts.com")) return true;
  if (/^season\s+\d+/.test(trimmed)) return true;
  if (/^episode\s+\d+/.test(trimmed)) return true;
  if (trimmed.startsWith("external links")) return true;
  return false;
};

const isEpisodeHeading = (text) =>
  /\[\d+\.\d+\]/.test(text) || /the .*?\(.*?\)/i.test(text);

const normalizeDash = (text) => text.replace(/\s+–\s+/g, " — ");

const splitSpeaker = (raw) => {
  const normalized = normalizeDash(raw);
  if (normalized.includes(" — ")) {
    const [speaker, ...rest] = normalized.split(" — ");
    if (speaker.length < 40) {
      return { speaker: speaker.trim(), text: rest.join(" — ").trim() };
    }
  }
  const parts = raw.split(":");
  if (parts.length > 1 && parts[0].length < 40) {
    return { speaker: parts[0].trim(), text: parts.slice(1).join(":").trim() };
  }
  return { speaker: "", text: raw.trim() };
};

const stripWikiMarkup = (line) => {
  return line
    .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/'''+/g, "")
    .replace(/''/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[http[^\]]+\]/g, "")
    .replace(/\[\d+\]/g, "")
    .trim();
};

const parseQuotesFromWikitext = (wikitext, season = null) => {
  const lines = wikitext.split("\n");
  let episodeTitle = "";
  const quotes = [];

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith("==") || line.startsWith("{{") || line.startsWith("[[")) {
      return;
    }

    const headingMatch = line.match(/^===+\s*(.*?)\s*===+$/);
    if (headingMatch) {
      episodeTitle = stripWikiMarkup(headingMatch[1]).replace("[edit]", "").trim();
      return;
    }

    if (!/^[*#:;]/.test(line)) return;
    const cleaned = stripWikiMarkup(line.replace(/^[*#:;]+\s*/, ""));
    if (!cleaned || cleaned.length < 10) return;
    if (looksLikeCastLine(cleaned) || looksLikeNavigation(cleaned)) return;

    const { speaker, text } = splitSpeaker(cleaned);
    if (!text || text.length < 8) return;
    quotes.push({
      id: "",
      text,
      speaker,
      listener: "",
      situation: "",
      episodeTitle,
      season,
      episode: null,
      source: "Wikiquote",
    });
  });

  return quotes;
};

const extractQuoteCandidates = ($, root) => {
  const items = [];
  root.find("li").each((_, li) => {
    const raw = cleanText($(li).text());
    if (raw) items.push(raw);
  });
  root.find("dd").each((_, dd) => {
    const raw = cleanText($(dd).text());
    if (raw) items.push(raw);
  });
  return items;
};

const parseQuotesFromWikiquote = (html, season = null, debug = false) => {
  const $ = cheerio.load(html);
  const quotes = [];

  const contentRoot =
    $("#mw-content-text").length > 0
      ? $("#mw-content-text").first()
      : $("body").length > 0
        ? $("body").first()
        : $.root();
  const content = contentRoot.clone();
  content.find(".navbox, .toc, .mw-editsection, .mw-references-wrap").remove();

  let sectionHeaders = content.find("h2, h3, h4");
  if (debug) {
    console.log(
      `Debug: season ${season ?? "base"} has ${sectionHeaders.length} headers`
    );
  }

  const episodeHeaders = sectionHeaders.filter((_, header) =>
    isEpisodeHeading(cleanText($(header).text()).replace("[edit]", "").trim())
  );
  if (debug) {
    console.log(
      `Debug: season ${season ?? "base"} episode headers ${episodeHeaders.length}`
    );
  }
  if (episodeHeaders.length === 0) {
    extractQuoteCandidates($, content).forEach((raw) => {
      if (looksLikeCastLine(raw) || looksLikeNavigation(raw)) return;
      quotes.push({ raw, episodeTitle: "" });
    });
  } else {
    episodeHeaders.each((_, header) => {
      const title = cleanText($(header).text()).replace("[edit]", "").trim();
      const sectionNodes = $(header).nextUntil("h2, h3, h4");
      const sectionRoot = $("<div></div>");
      sectionNodes.each((__, node) => sectionRoot.append($(node).clone()));
      extractQuoteCandidates($, sectionRoot).forEach((raw) => {
        if (looksLikeCastLine(raw) || looksLikeNavigation(raw)) return;
        const lines = raw
          .split(/\s*\n+\s*| {2,}/)
          .map((line) => cleanText(line))
          .filter(Boolean);
        lines.forEach((line) => {
          if (looksLikeCastLine(line) || looksLikeNavigation(line)) return;
          if (line.length < 8) return;
          quotes.push({ raw: line, episodeTitle: title });
        });
      });
    });
  }

  const seen = new Set();
  const normalizedQuotes = [];
  quotes.forEach(({ raw, episodeTitle }) => {
    const cleaned = cleanText(raw);
    if (!cleaned || cleaned.length < 4) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    normalizedQuotes.push({ cleaned, episodeTitle });
  });

  const mapped = normalizedQuotes.map(({ cleaned, episodeTitle }, index) => {
    const { speaker, text } = splitSpeaker(cleaned);
    if (!text || text.length < 6) return null;
    return {
      id: `wq-${season ?? "base"}-${index + 1}`,
      text,
      speaker,
      listener: "",
      situation: "",
      episodeTitle,
      season,
      episode: null,
      source: "Wikiquote",
    };
  }).filter(Boolean);
  if (debug) {
    console.log(
      `Debug: season ${season ?? "base"} extracted ${mapped.length} quotes`
    );
    if (mapped.length === 0) {
      const sampleLis = content.find("li").slice(0, 8);
      const samples = sampleLis
        .map((_, li) => cleanText($(li).text()))
        .get()
        .filter(Boolean);
      console.log("Debug: sample list items:", samples);
    }
  }
  return mapped;
};

const buildSeasonPages = () =>
  Array.from(
    { length: 9 },
    (_, i) => `https://en.wikiquote.org/wiki/Seinfeld_(season_${i + 1})`
  );

const dedupeAndReindex = (quotes) => {
  const seen = new Set();
  const deduped = [];
  quotes.forEach((quote) => {
    const key = `${quote.text}|${quote.episodeTitle}|${quote.season}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(quote);
  });
  return deduped.map((quote, index) => ({ ...quote, id: `wq-${index + 1}` }));
};

const parseEnrichmentContent = (content) => {
  const text = (content || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting the first JSON object from markdown or mixed output.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const fetchWithRetry = async (url, options, attempts = 4) => {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      const delay = 300 * (i + 1);
      await sleep(delay);
    }
  }
  throw lastError;
};

const enrichQuote = async (quote) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return quote;

  let response;
  try {
    response = await fetchWithRetry(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You enrich Seinfeld quotes with metadata. Respond with strict JSON: {\"episodeTitle\": string, \"season\": number|null, \"episode\": number|null, \"listener\": string, \"situation\": string}. Use empty strings or null if unknown.",
            },
            {
              role: "user",
              content: JSON.stringify({
                quote: quote.text,
                speaker: quote.speaker,
              }),
            },
          ],
        }),
      },
      4
    );
  } catch (error) {
    console.warn(`Enrichment request failed for ${quote.id}:`, error?.message || error);
    return quote;
  }

  if (!response.ok) {
    const error = await response.text();
    console.warn(`OpenAI error for ${quote.id}: ${response.status} ${error}`);
    return quote;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const parsed = parseEnrichmentContent(content);
  if (parsed) {
    return {
      ...quote,
      episodeTitle: typeof parsed.episodeTitle === "string" ? parsed.episodeTitle : "",
      season: Number.isFinite(parsed.season) ? parsed.season : null,
      episode: Number.isFinite(parsed.episode) ? parsed.episode : null,
      listener: typeof parsed.listener === "string" ? parsed.listener : "",
      situation: typeof parsed.situation === "string" ? parsed.situation : "",
    };
  }
  console.warn("Failed to parse enrichment content for quote id:", quote.id);
  return quote;
};

const main = async () => {
  const debug = process.env.SCRAPE_DEBUG === "1";
  const enrichAll = process.env.QUOTES_ENRICH_ALL === "1";
  const enrichLimit = Number.parseInt(process.env.QUOTE_ENRICH_LIMIT || "120", 10);
  const html = await fetchText(WIKIQUOTE_URL);
  const seasonPages = buildSeasonPages();
  let quotes = [];

  for (const page of seasonPages) {
    const seasonMatch = page.match(/season_(\d+)/i);
    const season = seasonMatch ? Number.parseInt(seasonMatch[1], 10) : null;
    let seasonWikitext = "";
    let seasonHtml = "";
    try {
      seasonWikitext = await fetchWikitextFromApi(`Seinfeld_(season_${season})`);
    } catch (error) {
      seasonWikitext = "";
    }

    if (seasonWikitext) {
      quotes.push(...parseQuotesFromWikitext(seasonWikitext, season));
      if (debug) {
        console.log(`Debug: season ${season} wikitext quotes total ${quotes.length}`);
      }
      await sleep(100);
      continue;
    }

    try {
      seasonHtml = await fetchText(page);
    } catch (error) {
      seasonHtml = "";
    }
    if (!seasonHtml) {
      if (debug) {
        console.warn(`Debug: no HTML returned for ${page}`);
      }
      continue;
    }
    if (debug) {
      console.log(
        `Debug: fetched ${page} html length ${seasonHtml.length}`
      );
    }
    quotes.push(...parseQuotesFromWikiquote(seasonHtml, season, debug));
    if (debug) {
      console.log(`Debug: total quotes so far ${quotes.length}`);
    }
    await sleep(150);
  }

  if (quotes.length === 0) {
    const baseHtml = await fetchHtmlFromApi("Seinfeld");
    if (!baseHtml && debug) {
      console.warn("Debug: no HTML returned for Seinfeld base page.");
    }
    if (debug) {
      console.log(
        `Debug: base html length ${(baseHtml || html).length}`
      );
    }
    quotes = parseQuotesFromWikiquote(baseHtml || html, null, debug);
  }

  quotes = dedupeAndReindex(quotes);

  if (quotes.length === 0) {
    if (debug) {
      console.warn("Debug: parsed 0 quotes after all fallbacks.");
    }
    throw new Error("Parsed 0 quotes from Wikiquote.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set. Quotes will be saved without details.");
  }

  if (apiKey) {
    let targetQuotes = quotes;
    if (!enrichAll && quotes.length > enrichLimit) {
      targetQuotes = quotes.slice(0, enrichLimit);
      console.warn(
        `Enriching first ${targetQuotes.length} of ${quotes.length} quotes. Set QUOTES_ENRICH_ALL=1 to enrich all.`
      );
    }

    const enrichedById = new Map();
    for (const quote of targetQuotes) {
      enrichedById.set(quote.id, await enrichQuote(quote));
      await sleep(200);
    }
    quotes = quotes.map((quote) => enrichedById.get(quote.id) || quote);
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(quotes, null, 2));
  await fs.writeFile(
    OUTPUT_JS_PATH,
    `window.__QUOTES__ = ${JSON.stringify(quotes, null, 2)};\n`
  );
  console.log(`Wrote ${quotes.length} quotes to ${OUTPUT_PATH}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
