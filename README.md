# Seinfeld Trigger-Free Episode Picker

Pick Seinfeld episodes that avoid topics you want to skip. This is a static
site with a simple searchable combobox and a local JSON dataset.

## Run the site

Open `index.html` directly or serve the folder:

```
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Build episode data

The script pulls episode data from Wikipedia and uses an LLM to tag topics.

1. Install dependencies:

```
npm install
```

2. Set your OpenAI API key:

```
export OPENAI_API_KEY="your-key"
```

3. Build the dataset:

```
npm run build:data
```

The output overwrites `data/episodes.json`.

## Customize topics

Edit `data/topics.json` to add or remove topics. Re-run the build script to
retag episodes.
