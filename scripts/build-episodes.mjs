import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const TOPICS_PATH = path.join(projectRoot, "data", "topics.json");
const OUTPUT_PATH = path.join(projectRoot, "data", "episodes.json");
const OUTPUT_JS_PATH = path.join(projectRoot, "data", "episodes.js");
const TOPICS_JS_PATH = path.join(projectRoot, "data", "topics.js");
const WIKI_HTML_URLS = [
  "https://en.wikipedia.org/w/index.php?title=List_of_Seinfeld_episodes&printable=yes",
  "https://en.wikipedia.org/wiki/List_of_Seinfeld_episodes?action=render",
  "https://en.wikipedia.org/api/rest_v1/page/html/List_of_Seinfeld_episodes",
];
const WIKI_PARSE_URL =
  "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_Seinfeld_episodes&prop=text&format=json&origin=*";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FETCH_HEADERS = {
  "User-Agent": "seinfeld-tonight/1.0 (episode scraper)",
};

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
};

const stripCitations = (text) => text.replace(/\[\w+\]/g, "");

const cleanTitle = (rawTitle) =>
  stripCitations(rawTitle)
    .replace(/^"|"$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const parseSeasonFromCaption = (captionText) => {
  const match = captionText.match(/season\s+(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
};

const findSeasonForTable = ($, table) => {
  const captionText = $(table).find("caption").first().text().trim();
  const captionSeason = parseSeasonFromCaption(captionText);
  if (captionSeason) return captionSeason;

  const colspanHeaderText = $(table)
    .find("th[colspan]")
    .first()
    .text()
    .trim();
  const headerSeason = parseSeasonFromCaption(colspanHeaderText);
  return headerSeason || null;
};

const findSeasonFromHeading = ($, table) => {
  const headingText = $(table)
    .prevAll("h2, h3, h4")
    .first()
    .text()
    .replace(/\[edit\]/i, "")
    .trim();
  return parseSeasonFromCaption(headingText);
};

const normalizeHeader = (text) =>
  text.toLowerCase().replace(/\s+/g, "").replace(/[^\w]/g, "");

const parseEpisodesFromList = (html, debug = false, seasonOverride = null) => {
  const $ = cheerio.load(html);

  const isEpisodeHeaderRow = (headers) =>
    headers.length > 1 &&
    headers.some((text) => text.includes("title")) &&
    headers.some((text) => text.includes("nooverall") || text.includes("noinseason"));

  const parseFromSelector = (selector) => {
    const episodes = [];
    if (debug) {
      console.log(`Debug: selector ${selector} has ${$(selector).length} tables`);
    }
    $(selector).each((_, table) => {
      const seasonFromCaption =
        findSeasonForTable($, table) || findSeasonFromHeading($, table);
      const seasonFromContext = seasonOverride || seasonFromCaption;
      if (debug && !seasonFromCaption) {
        const heading = $(table)
          .prevAll("h2, h3, h4")
          .first()
          .text()
          .replace(/\[edit\]/i, "")
          .trim();
        console.log("Debug: table has no season, heading:", heading);
      }

      let currentHeaders = [];

      $(table)
        .find("tr")
        .each((__, row) => {
          const headerTexts = $(row)
            .find("th")
            .map((___, th) =>
              normalizeHeader(stripCitations($(th).text()).trim())
            )
            .get();
          if (isEpisodeHeaderRow(headerTexts)) {
            currentHeaders = headerTexts;
            if (debug) {
              console.log("Debug: headers", currentHeaders);
            }
          }

          const cells = $(row).find("td, th");
          if (cells.length === 0) return;

          const titleIndex = currentHeaders.findIndex((text) =>
            text.includes("title")
          );
          const summaryIndex = currentHeaders.findIndex((text) =>
            text.includes("summary")
          );
          const overallIndex = currentHeaders.findIndex((text) =>
            text.includes("nooverall")
          );
          const episodeIndex = currentHeaders.findIndex((text) =>
            text.includes("noinseason")
          );

          if (titleIndex === -1 || (overallIndex === -1 && episodeIndex === -1)) {
            return;
          }

          const titleCell = cells.eq(titleIndex);
          const titleLink = titleCell.find("a").first();
          const title = cleanTitle(
            titleLink.attr("title") || titleCell.text()
          );

          const summary =
            summaryIndex >= 0
              ? stripCitations(cells.eq(summaryIndex).text()).trim()
              : "";
          const episodeNumber =
            episodeIndex >= 0
              ? Number.parseInt(cells.eq(episodeIndex).text(), 10)
              : null;
          const overallNumber =
            overallIndex >= 0
              ? Number.parseInt(cells.eq(overallIndex).text(), 10)
              : null;

          if (!title) return;

          episodes.push({
            title,
            season: seasonFromContext ?? null,
            episode: episodeNumber ?? overallNumber ?? null,
            summary,
          });
        });
    });
    return episodes;
  };

  const fromEpisodeTables = parseFromSelector("table.wikiepisodetable");
  if (fromEpisodeTables.length > 0) {
    return fromEpisodeTables;
  }

  return parseFromSelector("table.wikitable");
};

const parseEpisodesFromSections = async (debug = false) => {
  const sectionsUrl =
    "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_Seinfeld_episodes&prop=sections&format=json&origin=*";
  const sectionsData = await fetchJson(sectionsUrl);
  const sections = sectionsData.parse?.sections || [];
  const seasonSections = sections.filter((section) =>
    section.line?.toLowerCase().includes("season")
  );
  if (debug) {
    console.log(
      "Debug: season sections",
      seasonSections.map((section) => section.line)
    );
  }

  const episodes = [];
  for (const section of seasonSections) {
    const seasonNumber = parseSeasonFromCaption(section.line || "");
    const sectionUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=List_of_Seinfeld_episodes&section=${section.index}&prop=text&format=json&origin=*`;
    const sectionData = await fetchJson(sectionUrl);
    const sectionHtml = sectionData.parse?.text?.["*"] || "";
    if (!sectionHtml) continue;
    episodes.push(...parseEpisodesFromList(sectionHtml, debug, seasonNumber));
  }
  return episodes;
};

const dedupeEpisodes = (episodes) => {
  const seen = new Set();
  return episodes.filter((episode) => {
    const key = `${episode.season ?? ""}-${episode.episode ?? ""}-${episode.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fetchEpisodeSummary = async (title) => {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exintro=1&titles=${encodeURIComponent(
    title
  )}&format=json&origin=*`;
  const data = await fetchJson(url);
  const pages = data.query?.pages || {};
  const firstPage = pages[Object.keys(pages)[0]];
  return firstPage?.extract?.trim() || "";
};

const tagEpisode = async ({ title, summary }, topics) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { subtitle: "", topics: [] };
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
            "You label Seinfeld episode summaries with a short subtitle and trigger topics. The subtitle is a short description of the episode (1 sentence). Respond with strict JSON in the shape {\"subtitle\": string, \"topics\": string[]}. Use only topics from the provided list. Use an empty string and empty array if unknown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            title,
            summary,
            topics,
          }),
        },
      ],
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${error}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content);
    return {
      subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "",
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    };
  } catch (error) {
    console.warn(`Failed to parse topics for ${title}:`, error);
    return { subtitle: "", topics: [] };
  }
};

const main = async () => {
  const topics = JSON.parse(await fs.readFile(TOPICS_PATH, "utf-8"));
  let html = "";
  for (const url of WIKI_HTML_URLS) {
    try {
      html = await fetchText(url);
      if (html) break;
    } catch (error) {
      html = "";
    }
  }
  if (!html) {
    const listData = await fetchJson(WIKI_PARSE_URL);
    html = listData.parse?.text?.["*"] || "";
  }
  if (!html) {
    throw new Error("Failed to read Wikipedia HTML.");
  }
  const debug = process.env.SCRAPE_DEBUG === "1";
  let episodes = parseEpisodesFromList(html, debug);
  if (episodes.length === 0) {
    episodes = await parseEpisodesFromSections(debug);
  }
  episodes = dedupeEpisodes(episodes);
  if (episodes.length === 0) {
    throw new Error(
      "Parsed 0 episodes from Wikipedia. Aborting to avoid overwriting data."
    );
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "OPENAI_API_KEY is not set. Episodes will be saved without topics."
    );
  }

  const enriched = [];
  for (const episode of episodes) {
    const summary =
      episode.summary || (await fetchEpisodeSummary(episode.title));
    const enrichment =
      apiKey && summary
        ? await tagEpisode({ title: episode.title, summary }, topics)
        : { subtitle: "", topics: [] };
    enriched.push({
      ...episode,
      summary: summary || "Summary not available.",
      subtitle: enrichment.subtitle,
      topics: enrichment.topics,
    });
    await sleep(250);
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(enriched, null, 2));
  await fs.writeFile(
    OUTPUT_JS_PATH,
    `window.__EPISODES__ = ${JSON.stringify(enriched, null, 2)};\n`
  );
  await fs.writeFile(
    TOPICS_JS_PATH,
    `window.__TOPICS__ = ${JSON.stringify(topics, null, 2)};\n`
  );
  console.log(`Wrote ${enriched.length} episodes to ${OUTPUT_PATH}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
