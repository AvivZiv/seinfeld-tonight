const topicCheckboxes = document.getElementById("topic-checkboxes");
const selectedTopicsEl = document.getElementById("selected-topics");
const resultsList = document.getElementById("results-list");
const resultsCount = document.getElementById("results-count");
const randomQuote = document.getElementById("random-quote");
const resetTopicsButton = document.getElementById("reset-topics");
const randomEpisodeButton = document.getElementById("random-episode");
const showAllEpisodesButton = document.getElementById("show-all-episodes");
const modeToggleInput = document.getElementById("mode-toggle");
const modeLabel = document.getElementById("mode-label");
const topicsLabel = document.getElementById("topics-label");
const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");
const quoteSearch = document.getElementById("quote-search");
const quotesList = document.getElementById("quotes-list");
const quoteDetail = document.getElementById("quote-detail");

let allTopics = [];
let episodes = [];
let selectedTopics = [];
let mode = "exclude";
let quotes = [];
let selectedQuoteId = null;

const readFallbackJson = (id) => {
  const node = document.getElementById(id);
  if (!node) return null;
  try {
    return JSON.parse(node.textContent);
  } catch (error) {
    console.warn(`Failed to parse fallback JSON for ${id}`, error);
    return null;
  }
};

const readGlobalJson = (key) => {
  const value = globalThis[key];
  return Array.isArray(value) ? value : null;
};

const loadData = async () => {
  try {
    const [topicsResponse, episodesResponse, quotesResponse] = await Promise.all([
      fetch("data/topics.json"),
      fetch("data/episodes.json"),
      fetch("data/quotes.json"),
    ]);
    if (!topicsResponse.ok || !episodesResponse.ok || !quotesResponse.ok) {
      throw new Error("Failed to fetch data files.");
    }
    allTopics = await topicsResponse.json();
    episodes = await episodesResponse.json();
    quotes = await quotesResponse.json();
  } catch (error) {
    const globalTopics = readGlobalJson("__TOPICS__");
    const globalEpisodes = readGlobalJson("__EPISODES__");
    const globalQuotes = readGlobalJson("__QUOTES__");
    const fallbackTopics = readFallbackJson("fallback-topics");
    const fallbackEpisodes = readFallbackJson("fallback-episodes");
    allTopics =
      globalTopics || (Array.isArray(fallbackTopics) ? fallbackTopics : []);
    episodes =
      globalEpisodes || (Array.isArray(fallbackEpisodes) ? fallbackEpisodes : []);
    quotes = globalQuotes || [];
  }
  render();
  renderQuotes();
};

const renderTopicCheckboxes = () => {
  topicCheckboxes.innerHTML = "";
  allTopics.forEach((topic) => {
    const label = document.createElement("label");
    label.className = "topic-checkbox";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = topic;
    checkbox.checked = selectedTopics.includes(topic);
    checkbox.addEventListener("change", () => toggleTopic(topic));
    const text = document.createElement("span");
    text.textContent = topic;
    label.append(checkbox, text);
    topicCheckboxes.appendChild(label);
  });
};

const renderSelectedTopics = () => {
  selectedTopicsEl.innerHTML = "";
  if (selectedTopics.length === 0) {
    selectedTopicsEl.textContent = "No topics selected.";
    return;
  }
  selectedTopics.forEach((topic) => {
    const pill = document.createElement("span");
    pill.className = "topic-pill";
    pill.textContent = topic;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${topic}`);
    removeButton.addEventListener("click", () => removeTopic(topic));
    pill.appendChild(removeButton);
    selectedTopicsEl.appendChild(pill);
  });
};

const renderEpisodes = () => {
  const filtered = episodes.filter((episode) => {
    const episodeTopics = episode.topics || [];
    if (selectedTopics.length === 0) {
      return true;
    }
    if (mode === "include") {
      return selectedTopics.every((topic) => episodeTopics.includes(topic));
    }
    return selectedTopics.every((topic) => !episodeTopics.includes(topic));
  });
  resultsList.innerHTML = "";
  resultsCount.textContent = `${filtered.length} of ${episodes.length} episodes`;
  randomEpisodeButton.disabled = filtered.length === 0;
  if (filtered.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent =
      "No episodes match your filters. Try removing a topic.";
    resultsList.appendChild(emptyState);
    return;
  }
  filtered.forEach((episode) => {
    const card = document.createElement("article");
    card.className = "episode-card";
    const title = document.createElement("h3");
    title.textContent = episode.title;
    const subtitle = document.createElement("p");
    subtitle.className = "episode-subtitle";
    subtitle.textContent = episode.subtitle || "";
    const meta = document.createElement("p");
    meta.className = "episode-meta";
    if (episode.season) {
      meta.textContent = `Season ${episode.season} · Episode ${episode.episode}`;
    } else if (episode.episode) {
      meta.textContent = `Episode ${episode.episode}`;
    } else {
      meta.textContent = "Episode details unavailable";
    }
    if (episode.subtitle) {
      card.append(title, subtitle, meta);
    } else {
      card.append(title, meta);
    }
    resultsList.appendChild(card);
  });
};

const render = () => {
  renderSelectedTopics();
  renderTopicCheckboxes();
  renderEpisodes();
  if (mode === "include") {
    modeLabel.textContent = "Inclusion";
    topicsLabel.textContent = "Include only these topics";
    modeToggleInput.checked = true;
  } else {
    modeLabel.textContent = "Exclusion";
    topicsLabel.textContent = "Avoid these topics";
    modeToggleInput.checked = false;
  }
};

const setActiveTab = (tabName) => {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
};

const renderQuoteDetail = () => {
  const quote = quotes.find((item) => item.id === selectedQuoteId);
  if (!quote) {
    quoteDetail.innerHTML =
      '<p class="quote-detail-empty">Select a quote to see its details.</p>';
    return;
  }

  const speakerLine = quote.speaker
    ? `${quote.speaker}${quote.listener ? ` → ${quote.listener}` : ""}`
    : "Unknown speaker";
  const episodeLine = quote.episodeTitle
    ? `${quote.episodeTitle} · Season ${quote.season ?? "?"} · Episode ${
        quote.episode ?? "?"
      }`
    : "Episode details unavailable";

  quoteDetail.innerHTML = `
    <h3>Quote details</h3>
    <p class="quote-text">“${quote.text}”</p>
    <p><strong>Speaker:</strong> ${speakerLine}</p>
    <p><strong>Episode:</strong> ${episodeLine}</p>
    ${quote.situation ? `<p><strong>Situation:</strong> ${quote.situation}</p>` : ""}
    ${quote.source ? `<p><strong>Source:</strong> ${quote.source}</p>` : ""}
  `;
};

const renderQuotes = () => {
  if (quotes.length === 0) {
    quotesList.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "quote-detail-empty";
    empty.textContent =
      "No quotes loaded. Run npm run build:quotes to fetch them.";
    quotesList.appendChild(empty);
    renderQuoteDetail();
    return;
  }
  const query = quoteSearch.value.trim().toLowerCase();
  const filtered = quotes.filter((quote) => {
    const haystack = [
      quote.text,
      quote.speaker,
      quote.listener,
      quote.episodeTitle,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  quotesList.innerHTML = "";
  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "quote-detail-empty";
    empty.textContent = "No quotes match your search.";
    quotesList.appendChild(empty);
    return;
  }

  filtered.forEach((quote) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "quote-item";
    if (quote.id === selectedQuoteId) {
      item.classList.add("active");
    }
    item.innerHTML = `
      <p class="quote-text">“${quote.text}”</p>
      <p class="quote-meta">${quote.speaker || "Unknown speaker"} · ${
        quote.episodeTitle || "Unknown episode"
      }</p>
    `;
    item.addEventListener("click", () => {
      selectedQuoteId = quote.id;
      renderQuotes();
      renderQuoteDetail();
    });
    quotesList.appendChild(item);
  });
};

const addTopic = (topic) => {
  if (!selectedTopics.includes(topic)) {
    selectedTopics = [...selectedTopics, topic];
  }
  render();
};

const removeTopic = (topic) => {
  selectedTopics = selectedTopics.filter((item) => item !== topic);
  render();
};

const toggleTopic = (topic) => {
  if (selectedTopics.includes(topic)) {
    removeTopic(topic);
  } else {
    addTopic(topic);
  }
};

const resetTopics = () => {
  selectedTopics = [];
  render();
};

const pickRandomEpisode = () => {
  const eligible = episodes.filter((episode) => {
    const episodeTopics = episode.topics || [];
    if (selectedTopics.length === 0) {
      return true;
    }
    if (mode === "include") {
      return selectedTopics.every((topic) => episodeTopics.includes(topic));
    }
    return selectedTopics.every((topic) => !episodeTopics.includes(topic));
  });
  if (eligible.length === 0) return;
  const choice = eligible[Math.floor(Math.random() * eligible.length)];
  resultsList.innerHTML = "";
  resultsCount.textContent = `1 of ${eligible.length} eligible episodes`;

  randomQuote.textContent =
    "Did you notice sometimes you don't have enough faith in yourself to choose the right episode so you let a computer do it for you?";
  randomQuote.classList.add("visible");
  randomQuote.scrollIntoView({ behavior: "smooth", block: "start" });

  window.setTimeout(() => {
    randomQuote.classList.remove("visible");
    const card = document.createElement("article");
    card.className = "episode-card";
    const title = document.createElement("h3");
    title.textContent = choice.title;
    const subtitle = document.createElement("p");
    subtitle.className = "episode-subtitle";
    subtitle.textContent = choice.subtitle || "";
    const meta = document.createElement("p");
    meta.className = "episode-meta";
    if (choice.season) {
      meta.textContent = `Season ${choice.season} · Episode ${choice.episode}`;
    } else if (choice.episode) {
      meta.textContent = `Episode ${choice.episode}`;
    } else {
      meta.textContent = "Episode details unavailable";
    }
    if (choice.subtitle) {
      card.append(title, subtitle, meta);
    } else {
      card.append(title, meta);
    }
    resultsList.appendChild(card);
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 5000);
};

const toggleMode = () => {
  mode = modeToggleInput.checked ? "include" : "exclude";
  render();
};

resetTopicsButton.addEventListener("click", resetTopics);
randomEpisodeButton.addEventListener("click", pickRandomEpisode);
showAllEpisodesButton.addEventListener("click", renderEpisodes);
modeToggleInput.addEventListener("change", toggleMode);
tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});
quoteSearch.addEventListener("input", renderQuotes);

loadData();
