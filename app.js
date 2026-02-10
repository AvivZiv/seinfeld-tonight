const topicCheckboxes = document.getElementById("topic-checkboxes");
const selectedTopicsEl = document.getElementById("selected-topics");
const resultsList = document.getElementById("results-list");
const resultsCount = document.getElementById("results-count");
const resetTopicsButton = document.getElementById("reset-topics");
const randomEpisodeButton = document.getElementById("random-episode");
const showAllEpisodesButton = document.getElementById("show-all-episodes");
const modeToggleInput = document.getElementById("mode-toggle");
const modeLabel = document.getElementById("mode-label");
const topicsLabel = document.getElementById("topics-label");

let allTopics = [];
let episodes = [];
let selectedTopics = [];
let mode = "exclude";

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
    const [topicsResponse, episodesResponse] = await Promise.all([
      fetch("data/topics.json"),
      fetch("data/episodes.json"),
    ]);
    if (!topicsResponse.ok || !episodesResponse.ok) {
      throw new Error("Failed to fetch data files.");
    }
    allTopics = await topicsResponse.json();
    episodes = await episodesResponse.json();
  } catch (error) {
    const globalTopics = readGlobalJson("__TOPICS__");
    const globalEpisodes = readGlobalJson("__EPISODES__");
    const fallbackTopics = readFallbackJson("fallback-topics");
    const fallbackEpisodes = readFallbackJson("fallback-episodes");
    allTopics =
      globalTopics || (Array.isArray(fallbackTopics) ? fallbackTopics : []);
    episodes =
      globalEpisodes || (Array.isArray(fallbackEpisodes) ? fallbackEpisodes : []);
  }
  render();
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
    const summary = document.createElement("p");
    summary.className = "episode-summary";
    summary.textContent = episode.summary;
    if (episode.subtitle) {
      card.append(title, subtitle, meta, summary);
    } else {
      card.append(title, meta, summary);
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
  const summary = document.createElement("p");
  summary.className = "episode-summary";
  summary.textContent = choice.summary;
  if (choice.subtitle) {
    card.append(title, subtitle, meta, summary);
  } else {
    card.append(title, meta, summary);
  }
  resultsList.appendChild(card);
  card.scrollIntoView({ behavior: "smooth", block: "start" });
};

const toggleMode = () => {
  mode = modeToggleInput.checked ? "include" : "exclude";
  render();
};

resetTopicsButton.addEventListener("click", resetTopics);
randomEpisodeButton.addEventListener("click", pickRandomEpisode);
showAllEpisodesButton.addEventListener("click", renderEpisodes);
modeToggleInput.addEventListener("change", toggleMode);

loadData();
