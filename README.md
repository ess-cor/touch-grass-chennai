# Touch Grass 🌿

**Plan in 30 seconds. Spend the rest outside.**

Touch Grass is a one-screen outdoor planner. You tell it where you are, how long you have, what you feel like (birding, walking, gardening, beach, cycling) and what the weather is doing. An open-weight model running **inside your browser** gives you a three-step plan and one seasonal tip. Then you press **Go outside**, the screen turns into a plain timer and checklist, and the idea is that you put the phone away.

**Live:** https://ess-cor.github.io/touch-grass-chennai/

Built for the DEV [Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).

## What makes it work

- **On-device model.** [WebLLM](https://github.com/mlc-ai/web-llm) (Apache-2.0) runs the model on your GPU through WebGPU. The default model is **Gemma 2 2B Instruct** (`gemma-2-2b-it-q4f16_1-MLC`, or the `q4f32` build on GPUs without `shader-f16`). There is a **lite** option, **Qwen2.5 0.5B Instruct**, for phones with less memory.
- **Nothing leaves the device.** No server, no API key, no analytics. Your location, notes and outdoor log stay in your browser's storage.
- **Works offline after the first load.** A service worker caches the app and the WebLLM library, and WebLLM caches the model weights. Next time it starts from cache, even with no signal.
- **Grounded, not guessing.** Small models love to invent bird species. For Chennai, the app hands the model a short list of seasonal facts (birds around this season, what to plant now, nearby green spaces) and tells it to use only those. For other cities it is told not to name species at all.
- **Works without AI too.** If WebGPU isn't available, or the model's reply can't be parsed, a rule-based planner built on the same seasonal data takes over. You always get a plan.

## Files

| File | What it does |
|---|---|
| `index.html` | The single screen, plus the "outside" view |
| `app.js` | UI, WebGPU check, model loading, streaming, timer, local log |
| `planner.js` | Chennai seasonal data, prompt builder, reply parser, non-AI planner |
| `sw.js` | Offline cache for the app shell and the WebLLM library |

No build step. Serve the folder with any static server (for example `python3 -m http.server`) and open it in a browser with WebGPU (recent Chrome or Edge on desktop or Android).

## Limits, honestly

- The first model download is large: about 1.4 GB for Gemma 2 2B, about 270 MB for the lite model. Do it on Wi-Fi.
- WebGPU support varies. Where it's missing you get the built-in planner instead.
- The seasonal notes are written for Chennai and are general guidance, not a field guide. Check rain alerts and opening times before you go.

## Licence

MIT © 2026 Mohamed Adib. WebLLM is Apache-2.0. Gemma 2 is released under the Gemma Terms of Use; Qwen2.5 0.5B under Apache-2.0.
