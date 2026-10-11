// samples.js: a REAL answer from Gemma 2 2B Instruct to the app's own prompt, kept so people without
// WebGPU can see what the model does. Recorded with llama.cpp (gemma-2-2b-it, Q4_K_M, same JSON schema
// as a grammar), for: Chennai, 30 min, birding, pleasant, an October afternoon. Unedited.
export const SAMPLE = {
  input: { city: "Chennai", minutes: 30, interests: ["birding"], conditions: "cloudy", note: "" },
  date: "2026-10-11T17:30:00",
  raw: "{\n  \"title\": \"Chennai Birding Blitz\",\n  \"steps\": [\n    \"Walk to the park: 5 minutes.\",\n    \"Scan for wagtails and sparrows: near drains.\",\n    \"Head back home: 5 minutes.\"\n  ],\n  \"spot\": [\n    {\"name\": \"Grey Wagtail\", \"hint\": \"Near drains and puddles\"},\n    {\"name\": \"Common Sandpiper\", \"hint\": \"Water's edge\"},\n    {\"name\": \"Barn Swallow\", \"hint\": \"Over open ground\" }\n  ],\n  \"tip\": \"Winter migrants are arriving, so you may see some new birds.\",\n  \"bring\": [\n    \"Notebook to record sightings\",\n    \"Water bottle\"\n  ],\n  \"why\": \"The weather is pleasant for a quick birding adventure!\"\n}",
};
