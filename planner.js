// planner.js: local seasonal knowledge + the non-AI fallback planner.
// Everything here is plain data and plain logic. It is used two ways:
//   1. As grounding facts handed to the on-device model (so it does not invent bird species).
//   2. As a complete rule-based planner when WebGPU or the model is not available.

export const INTERESTS = {
  birding: "Birding",
  walking: "Walking",
  gardening: "Gardening",
  beach: "Beach",
  cycling: "Cycling",
};

export const CONDITIONS = {
  clear: "Clear / sunny",
  cloudy: "Cloudy, pleasant",
  hot: "Very hot",
  drizzle: "Light rain",
  storm: "Heavy rain / storm",
};

// Seasonal notes for Chennai (coastal Tamil Nadu). Month index: 0 = January.
export const CHENNAI_SEASONS = [
  {
    months: [0, 1],
    name: "Cool, dry winter (Jan–Feb)",
    weather: "Pleasant mornings. The best weeks of the year to be outside.",
    birds: ["Northern Pintail", "Garganey", "Northern Shoveler", "Painted Stork", "Spot-billed Pelican", "Black-winged Stilt", "Grey Wagtail", "Blue-tailed Bee-eater"],
    plant: ["tomato and brinjal seedlings", "coriander", "spinach and amaranth greens", "beans"],
    gardenTask: "Sow coriander or a tray of greens. Water early in the morning only.",
    note: "Winter migrants are at their peak on wetlands like Pallikaranai.",
  },
  {
    months: [2, 3, 4],
    name: "Hot season (Mar–May)",
    weather: "Very hot by 9 am. Go out early or after 5:30 pm.",
    birds: ["Asian Koel", "Purple-rumped Sunbird", "White-throated Kingfisher", "Indian Pond Heron", "Red-vented Bulbul", "Rose-ringed Parakeet", "Black Drongo"],
    plant: ["amaranth (keerai)", "okra (vendakkai)", "gourds on a trellis"],
    gardenTask: "Mulch your pots with dry leaves and water at dawn or dusk.",
    note: "Koels call loudly this season, so listen before you look. Most migrants leave by March.",
  },
  {
    months: [5, 6, 7, 8],
    name: "Humid southwest-monsoon months (Jun–Sep)",
    weather: "Humid, with the odd evening thunderstorm.",
    birds: ["Indian Pond Heron", "Asian Koel", "Spotted Owlet", "Common Tailorbird", "White-throated Kingfisher", "Purple-rumped Sunbird", "Black Drongo"],
    plant: ["okra", "cluster beans", "bottle gourd and ridge gourd", "greens"],
    gardenTask: "Sow okra or gourd seeds and give climbers a string or stick to climb.",
    note: "Pond herons are in their brown-and-maroon breeding colours around now.",
  },
  {
    months: [9, 10, 11],
    name: "Northeast monsoon (Oct–Dec)",
    weather: "Chennai's main rainy season. Check rain alerts before you head out.",
    birds: ["Blue-tailed Bee-eater", "Grey Wagtail", "Brown Shrike", "Wood Sandpiper", "Common Sandpiper", "Barn Swallow", "Black-winged Stilt"],
    plant: ["a native tree sapling (neem, pungai)", "greens", "radish", "coriander", "tomato seedlings"],
    gardenTask: "Plant a sapling or sow greens while the rain does the watering. Check that every pot drains.",
    note: "Winter migrants are starting to arrive and the wetlands are filling up.",
  },
];

export const CHENNAI_PLACES = {
  birding: ["Pallikaranai Marsh", "Guindy National Park", "Broken Bridge at the Adyar river mouth", "Nanmangalam Reserve Forest"],
  walking: ["Semmozhi Poonga", "Anna Nagar Tower Park", "the Besant Nagar beach promenade", "your own street, end to end"],
  gardening: ["your balcony, terrace or doorstep"],
  beach: ["Elliot's Beach (Besant Nagar)", "Marina Beach", "Thiruvanmiyur beach", "Kovalam beach"],
  cycling: ["East Coast Road at sunrise (watch the traffic)", "quiet inner roads near home"],
};

// Field notes for every bird the app may ask you to look for. These go into the prompt as facts,
// so the model writes hints from them instead of from memory.
export const BIRD_NOTES = {
  "Northern Pintail": "a duck with a long, pointed tail, on open water",
  "Garganey": "a small duck; the male has a bold white stripe over the eye",
  "Northern Shoveler": "a duck with a huge spoon-shaped bill, sweeping the water",
  "Painted Stork": "a big white stork with a yellow bill and a pink wash on its back",
  "Spot-billed Pelican": "a large grey pelican, often floating in groups",
  "Black-winged Stilt": "black and white, with very long pink legs, wading in shallow water",
  "Grey Wagtail": "pumps its long tail up and down near drains, puddles and streams",
  "Blue-tailed Bee-eater": "slim and green, perched on wires, darting out after insects",
  "Asian Koel": "heard more than seen: a loud, rising 'ku-oo' from the treetops",
  "Purple-rumped Sunbird": "tiny, with a curved bill, flitting between flowers",
  "White-throated Kingfisher": "electric blue with a brown head; a loud, laughing call",
  "Indian Pond Heron": "looks plain brown standing still, then flashes white wings when it flies",
  "Red-vented Bulbul": "a crested bird with a red patch under the tail",
  "Rose-ringed Parakeet": "bright green with a long tail, screeching in flocks",
  "Black Drongo": "glossy black with a forked tail, sitting on wires",
  "Spotted Owlet": "a small owl, often in pairs in old trees around dusk",
  "Common Tailorbird": "tiny, tail held upright, with a loud 'towit-towit' call",
  "Brown Shrike": "sits on top of a bush, with a black 'bandit mask' through the eye",
  "Wood Sandpiper": "a small wader with a speckled back, at marsh edges",
  "Common Sandpiper": "a small wader that bobs its rear end at the water's edge",
  "Barn Swallow": "fast and agile, with a forked tail, skimming over open ground and water",
};

// Things worth noticing anywhere in the world. Safe for cities where the app has no local data.
export const NOTICE = {
  "a flowering tree": "look up: which tree near you is in flower right now?",
  "a butterfly": "check sunny patches and flowering bushes",
  "a spider web": "low bushes and fence corners, best when the light is behind it",
  "a bird call you can't place": "stop, close your eyes for ten seconds, and listen",
  "something growing through concrete": "cracks in walls, steps and pavements",
  "a leaf bigger than your hand": "compare a few trees on your way",
  "a cloud that looks like something": "lie back or lean on a wall and give it a name",
  "an ant trail": "follow it for a minute: where is it going?",
  "the smell after rain": "notice it on soil, leaves and warm stone",
  "a tree older than you": "thick trunk, rough bark: say hello",
};

export function isChennai(city) {
  const c = (city || "").trim().toLowerCase();
  return c === "" || c.includes("chennai") || c.includes("madras");
}

export function seasonFor(date = new Date()) {
  const m = date.getMonth();
  return CHENNAI_SEASONS.find((s) => s.months.includes(m));
}

export function partOfDay(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 8) return "early morning";
  if (h >= 8 && h < 11) return "morning";
  if (h >= 11 && h < 15) return "midday";
  if (h >= 15 && h < 18) return "afternoon";
  if (h >= 18 && h < 20) return "evening";
  return "night";
}

// The facts the model is allowed to use, and the closed list of things it may ask you to spot.
export function localFacts(input, date = new Date()) {
  const chennai = isChennai(input.city);
  const season = chennai ? seasonFor(date) : null;
  const interests = input.interests && input.interests.length ? input.interests : ["walking"];
  const when = partOfDay(date);
  let spotOptions = Object.keys(NOTICE);
  if (season) {
    const birds = season.birds.filter((b) => BIRD_NOTES[b]);
    // Owls and dusk birds only make sense late in the day; everything else is fair game.
    const timed = birds.filter((b) => b !== "Spotted Owlet" || when === "evening" || when === "night");
    spotOptions = [...timed, ...spotOptions];
  }
  if (input.conditions !== "drizzle" && input.conditions !== "storm") spotOptions = spotOptions.filter((s) => s !== "the smell after rain");
  return {
    chennai,
    season,
    interests,
    // Named places only when there is time to get there and back; otherwise stay close to home.
    places: chennai && Number(input.minutes) >= 60 ? interests.flatMap((i) => CHENNAI_PLACES[i] || []) : [],
    when,
    spotOptions,
  };
}

export function noteFor(name) {
  return BIRD_NOTES[name] || NOTICE[name] || "";
}

// JSON Schema for the model's answer. The "spot" names are an enum built per request,
// so with grammar-constrained decoding the model physically cannot name a species we did not give it.
export function planSchema(facts) {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      steps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      spot: {
        type: "array",
        minItems: 3,
        maxItems: 4,
        items: {
          type: "object",
          properties: { name: { type: "string", enum: facts.spotOptions }, hint: { type: "string" } },
          required: ["name", "hint"],
        },
      },
      tip: { type: "string" },
      bring: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
      why: { type: "string" },
    },
    required: ["title", "steps", "spot", "tip", "bring", "why"],
  };
}

// Small models are bad at arithmetic, so the code splits the time and the model just uses the numbers.
export function timeBudget(minutes) {
  const t = Math.max(10, Number(minutes) || 30);
  const travel = Math.max(3, Math.round(t * 0.2));
  return { out: travel, main: t - 2 * travel, back: travel };
}

export function buildPrompt(input, date = new Date(), weather = null) {
  const f = localFacts(input, date);
  const b = timeBudget(input.minutes);
  const interests = f.interests.map((i) => INTERESTS[i]).join(", ");
  const lines = [
    "You are Touch Grass, a tiny planner whose only job is to get someone off their phone and outside right now.",
    "",
    `City: ${input.city || "Chennai"}`,
    `Time they have: ${input.minutes} minutes, door to door`,
    `Time budget (use these numbers in the steps): about ${b.out} min to get there, ${b.main} min for the main thing, ${b.back} min back.`,
    `It is ${f.when} in ${date.toLocaleString("en", { month: "long" })}. Conditions: ${CONDITIONS[input.conditions]}.`,
    weather ? `Live weather: ${weather.summary}.` : null,
    `They like: ${interests}.`,
    input.note ? `Extra note from them: ${input.note}` : null,
    "",
  ];
  if (f.chennai) {
    lines.push(
      "Local facts (use ONLY these for birds, plants and places; do not invent others):",
      `- Season: ${f.season.name}. ${f.season.weather} ${f.season.note}`,
      `- Good to plant now: ${f.season.plant.join(", ")}`,
      `- Garden job this week: ${f.season.gardenTask}`,
      f.places.length
        ? `- Places they could go: ${f.places.join("; ")}`
        : "- There is no time to travel: keep the plan within a five-minute walk of where they are (street, park, terrace, balcony).",
      ""
    );
  } else {
    lines.push(
      "You have no verified local data for this city. Do NOT name specific bird species, plants, places or seasons. Give general advice instead, and make the tip about noticing nature, not about planting.",
      ""
    );
  }
  lines.push("Things they could spot (choose 3 or 4 from this list only, the ones that best fit the plan):");
  for (const s of f.spotOptions) lines.push(`- ${s}: ${noteFor(s)}`);
  lines.push(
    "",
    "Rules:",
    "- The plan must fit inside the time they have, including getting there and back.",
    "- If it is heavy rain or a storm, keep them safe: suggest a doorstep or balcony version, or waiting for a break.",
    "- If it is very hot or midday, suggest shade, water, and a shorter outing.",
    "- Never suggest swimming in the sea.",
    "- Step 1 gets them there, step 2 is the main thing (most of the time), step 3 brings them back with one small task.",
    "- Each step is one short, concrete sentence with a number in it (minutes or things to find). Be warm and brief.",
    '- Example of good steps for a 15-minute walk (do not copy it): ["Walk to the end of your street: about 5 minutes.", "Stand still for 3 minutes and count every bird you can hear.", "On the way back, find one tree you have never looked at properly."]',
    "",
    "Answer with JSON only, with these keys:",
    '- "title": a 2 to 5 word name for this outing',
    '- "steps": exactly 3 short steps',
    '- "spot": 3 or 4 objects {"name", "hint"}: name copied exactly from the list above, hint = where or how to look, under 12 words',
    '- "tip": one seasonal tip (what to plant this week, or what is special about this season)',
    '- "bring": 2 or 3 short items',
    '- "why": one sentence on why this plan fits their time and the weather'
  );
  return lines.filter((l) => l !== null).join("\n");
}

const clean = (s, max = 160) => String(s || "").replace(/\s+/g, " ").replace(/\*\*/g, "").trim().slice(0, max);

// Turn the model's JSON (constrained or not) into a safe plan. Anything outside the allowlist is dropped.
export function validatePlan(raw, facts) {
  let obj = raw;
  if (typeof raw === "string") {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { obj = JSON.parse(m[0]); } catch { return null; }
  }
  if (!obj || typeof obj !== "object") return null;
  const steps = (Array.isArray(obj.steps) ? obj.steps : []).map((s) => clean(s, 200)).filter(Boolean).slice(0, 4);
  if (steps.length < 2) return null;
  const allowed = new Map(facts.spotOptions.map((s) => [s.toLowerCase(), s]));
  const seen = new Set();
  const spot = [];
  for (const it of Array.isArray(obj.spot) ? obj.spot : []) {
    const name = allowed.get(clean(it && it.name, 80).toLowerCase());
    if (!name || seen.has(name)) continue; // invented or duplicate: drop it
    seen.add(name);
    spot.push({ name, hint: clean(it.hint, 100) || noteFor(name) });
  }
  return {
    title: clean(obj.title, 48),
    steps,
    spot: spot.slice(0, 4),
    tip: clean(obj.tip, 220),
    bring: (Array.isArray(obj.bring) ? obj.bring : []).map((s) => clean(s, 40)).filter(Boolean).slice(0, 3),
    why: clean(obj.why, 200),
  };
}

// ---------- Non-AI fallback planner (same output shape) ----------

function pick(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}

function pickN(arr, n, seed) {
  const out = [];
  for (let i = 0; out.length < Math.min(n, arr.length) && i < arr.length * 3; i++) {
    const v = pick(arr, seed + i);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function planWithoutAI(input, date = new Date()) {
  const f = localFacts(input, date);
  const t = Number(input.minutes) || 30;
  const interest = f.interests[0];
  const seed = date.getDate() + t;
  const place = f.chennai ? pick(CHENNAI_PLACES[interest] || CHENNAI_PLACES.walking, seed) : "somewhere green near you";
  const near = t <= 30 ? "somewhere you can walk to in five minutes" : place;
  const birds = f.spotOptions.filter((s) => BIRD_NOTES[s]);
  const generic = f.spotOptions.filter((s) => NOTICE[s]);
  let steps, bring, title;

  if (input.conditions === "storm") {
    title = "Doorstep rain watch";
    steps = [
      "Not a day for a long outing. Stand at your door, window or balcony for ten minutes instead.",
      "Watch the rain, listen to it, and count how many birds you can hear sheltering nearby.",
      "When the rain eases, step out for a short walk around the block. Avoid waterlogged roads.",
    ];
    bring = ["umbrella", "slippers you don't mind getting wet"];
  } else {
    switch (interest) {
      case "birding":
        title = "A slow bird walk";
        steps = [
          `Head to ${near}. Trees, water or open ground are best.`,
          `Stand still for ${Math.max(5, Math.round(t / 3))} minutes. Find birds by sound first, then by sight.`,
          "Walk back slowly and see if you can add one more bird on the way.",
        ];
        bring = ["water", "a small notebook"];
        break;
      case "gardening":
        title = "Ten minutes with the soil";
        steps = [
          "Step out to your balcony, terrace or the nearest bit of soil.",
          f.season ? `This week's job: ${f.season.gardenTask}` : "Pull a few weeds, water at the roots, and check under leaves for pests.",
          "Spend the last few minutes doing nothing but looking at what is growing.",
        ];
        bring = ["water can", "old cloth for your hands"];
        break;
      case "beach":
        title = "Waterline wander";
        steps = [
          `Go to ${f.chennai ? place : "the nearest beach or waterfront"}.`,
          `Walk the wet sand along the waterline for ${Math.max(10, t - 15)} minutes. Look for crabs, shells and shorebirds.`,
          "Stay out of the water. The currents on these beaches are dangerous.",
        ];
        bring = ["water", "cap", "slippers"];
        break;
      case "cycling":
        title = "Out-and-back ride";
        steps = [
          `Ride out for ${Math.max(5, Math.round((t - 10) / 2))} minutes on quiet roads, then turn back.`,
          "At the turnaround, get off the cycle for two minutes and look up.",
          "Helmet on. If it is getting dark, use lights or stick to lit roads.",
        ];
        bring = ["helmet", "water", "lights"];
        break;
      default:
        title = "A noticing walk";
        steps = [
          `Walk out for ${Math.max(5, Math.round(t / 2))} minutes towards ${near}, then turn around.`,
          "Every five minutes, stop and notice one thing: a smell, a sound, a tree you have never looked at.",
          "Walk the last stretch without your phone in your hand.",
        ];
        bring = ["water", "comfortable footwear"];
    }
  }

  if (input.conditions === "hot" || f.when === "midday") steps.push("It's hot: stay in the shade, carry water, and keep it short.");
  if (input.conditions === "drizzle") bring = ["umbrella", ...bring];

  const wantBirds = interest === "birding" || interest === "beach" ? 3 : 2;
  const spotNames = [...pickN(birds, wantBirds, seed), ...pickN(generic, 4, seed + 3)].slice(0, 4);
  const spot = spotNames.map((name) => ({ name, hint: noteFor(name) }));

  let tip;
  if (f.season) {
    tip = interest === "gardening" ? `Good to plant now: ${f.season.plant.slice(0, 3).join(", ")}.` : f.season.note;
  } else {
    tip = interest === "gardening"
      ? "Ask a local nursery what people near you are sowing this week, and start one pot of it."
      : "Pick the three birds you see most on your street and learn their calls this week.";
  }
  const why = `Sized for ${t} minutes door to door${input.conditions === "storm" ? ", and kept close to home because of the storm" : input.conditions === "hot" ? ", with shade and water because of the heat" : ""}.`;
  return { title, steps, spot, tip, bring: bring.slice(0, 3), why };
}

// Safety rules are asked for in the prompt, but enforced here, in code, whatever the model wrote.
export function applyGuardrails(plan, input, date = new Date()) {
  const f = localFacts(input, date);
  const text = plan.steps.join(" ").toLowerCase();
  const steps = [...plan.steps];
  if ((input.conditions === "hot" || f.when === "midday") && !/shade/.test(text)) steps.push("It's hot: stay in the shade, carry water, and keep it short.");
  if (input.conditions === "storm" && !/(balcony|doorstep|door|window|indoors|shelter)/.test(text)) steps.unshift("Heavy rain: stay at your door or balcony until it eases. Avoid waterlogged roads.");
  if (f.interests.includes("beach") && !/(stay out of the water|don't swim|do not swim|no swimming)/.test(text)) steps.push("Stay out of the water: the currents on these beaches are dangerous.");
  if (f.when === "night" && !/(lit|light|torch)/.test(text)) steps.push("It's dark: stick to lit, familiar roads.");
  const bring = [...plan.bring];
  if ((input.conditions === "drizzle" || input.conditions === "storm") && !bring.some((b) => /umbrella|rain/i.test(b))) bring.unshift("umbrella");
  if (!bring.some((b) => /water/i.test(b)) && input.conditions !== "storm") bring.push("water");
  return { ...plan, steps, bring: bring.slice(0, 4) };
}
