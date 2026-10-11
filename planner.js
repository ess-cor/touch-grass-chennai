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

// The facts the model is allowed to use. Returned as text for the prompt and as an object for the fallback.
export function localFacts(input, date = new Date()) {
  const chennai = isChennai(input.city);
  const season = chennai ? seasonFor(date) : null;
  return {
    chennai,
    season,
    places: chennai ? input.interests.flatMap((i) => CHENNAI_PLACES[i] || []) : [],
    when: partOfDay(date),
  };
}

export function buildPrompt(input, date = new Date()) {
  const f = localFacts(input, date);
  const interests = input.interests.map((i) => INTERESTS[i]).join(", ") || "anything";
  const lines = [
    "You are Touch Grass, a tiny planner whose only job is to get someone off their phone and outside right now.",
    "",
    `City: ${input.city || "Chennai"}`,
    `Time they have: ${input.minutes} minutes`,
    `It is ${f.when}. Conditions: ${CONDITIONS[input.conditions]}.`,
    `They like: ${interests}.`,
    input.note ? `Extra note from them: ${input.note}` : null,
    "",
  ];
  if (f.chennai) {
    lines.push(
      "Local facts (use ONLY these for birds, plants and places; do not invent others):",
      `- Season: ${f.season.name}. ${f.season.weather} ${f.season.note}`,
      `- Birds around now: ${f.season.birds.join(", ")}`,
      `- Good to plant now: ${f.season.plant.join(", ")}`,
      `- Places they could go: ${f.places.join("; ")}`,
      ""
    );
  } else {
    lines.push(
      "You have no verified local data for this city. Do NOT name specific bird species, plants or places. Give general advice instead.",
      ""
    );
  }
  lines.push(
    "Rules:",
    "- The plan must fit inside the time they have, including getting there and back.",
    "- If it is heavy rain or a storm, keep them safe: suggest a doorstep or balcony version, or waiting for a break.",
    "- If it is very hot or midday, suggest shade, water, and a shorter outing.",
    "- Never suggest swimming in the sea.",
    "- Be warm and brief. No more than 90 words in total.",
    "",
    "Reply in exactly this format and nothing else:",
    "PLAN:",
    "1. <first step>",
    "2. <second step>",
    "3. <third step>",
    "TIP: <one seasonal tip: what to plant this week or which bird to look for>",
    "BRING: <two or three short items, comma separated>"
  );
  return lines.filter((l) => l !== null).join("\n");
}

// Parse the model's reply into {steps, tip, bring}. Returns null if it is unusable.
export function parseReply(text) {
  if (!text) return null;
  const steps = [];
  let tip = "";
  let bring = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\*\*/g, "").trim();
    const step = line.match(/^(?:\d+[.)]|[-•*])\s+(.*)$/);
    if (/^TIP\s*:/i.test(line)) tip = line.replace(/^TIP\s*:\s*/i, "");
    else if (/^BRING\s*:/i.test(line)) bring = line.replace(/^BRING\s*:\s*/i, "").split(/,|;/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
    else if (step && steps.length < 4) steps.push(step[1]);
  }
  if (steps.length === 0) return null;
  return { steps, tip, bring };
}

// ---------- Non-AI fallback planner ----------

function pick(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}

export function planWithoutAI(input, date = new Date()) {
  const f = localFacts(input, date);
  const t = Number(input.minutes) || 30;
  const interest = input.interests[0] || "walking";
  const seed = date.getDate() + t;
  const place = f.places.length ? pick(CHENNAI_PLACES[interest] || f.places, seed) : "somewhere green near you";
  const near = t <= 30 ? "somewhere you can walk to in five minutes" : place;
  const birds = f.season ? f.season.birds : [];
  let steps;

  if (input.conditions === "storm") {
    steps = [
      "Not a day for a long outing. Stand at your door, window or balcony for ten minutes instead.",
      "Watch the rain, listen to it, and count how many birds you can hear sheltering nearby.",
      "When the rain eases, step out for a short walk around the block. Avoid waterlogged roads.",
    ];
    return finish(steps, f, ["umbrella", "slippers you don't mind getting wet"]);
  }

  switch (interest) {
    case "birding":
      steps = [
        `Head to ${near}. Trees, water or open ground are best.`,
        `Stand still for ${Math.max(5, Math.round(t / 3))} minutes. Find birds by sound first, then by sight.`,
        birds.length ? `Look for: ${pick(birds, seed)}, ${pick(birds, seed + 1)} and ${pick(birds, seed + 2)}.` : "Try to spot three different birds, and notice what makes each one different.",
      ];
      return finish(steps, f, ["water", "a small notebook"]);
    case "gardening":
      steps = [
        "Step out to your balcony, terrace or the nearest bit of soil.",
        f.season ? `This week's job: ${f.season.gardenTask}` : "Pull a few weeds, water at the roots, and check under leaves for pests.",
        "Spend the last few minutes doing nothing but looking at what is growing.",
      ];
      return finish(steps, f, ["water can", "old cloth for your hands"]);
    case "beach":
      steps = [
        `Go to ${f.chennai ? place : "the nearest beach or waterfront"}.`,
        `Walk the wet sand along the waterline for ${Math.max(10, t - 15)} minutes. Look for crabs, shells and shorebirds.`,
        "Stay out of the water. The currents on these beaches are dangerous.",
      ];
      return finish(steps, f, ["water", "cap", "slippers"]);
    case "cycling":
      steps = [
        `Ride out for ${Math.max(5, Math.round((t - 10) / 2))} minutes on quiet roads, then turn back.`,
        "At the turnaround, get off the cycle for two minutes and look up.",
        "Helmet on. If it is getting dark, use lights or stick to lit roads.",
      ];
      return finish(steps, f, ["helmet", "water", "lights"]);
    default:
      steps = [
        `Walk out for ${Math.max(5, Math.round(t / 2))} minutes towards ${near}, then turn around.`,
        "Every five minutes, stop and notice one thing: a smell, a sound, a tree you have never looked at.",
        "Walk the last stretch without your phone in your hand.",
      ];
      return finish(steps, f, ["water", "comfortable footwear"]);
  }

  function finish(steps, f, bring) {
    if (input.conditions === "hot" || f.when === "midday") steps.push("It's hot: stay in the shade, carry water, and keep it short.");
    if (input.conditions === "drizzle") bring = ["umbrella", ...bring];
    let tip;
    if (f.season) {
      tip = interest === "gardening"
        ? `Good to plant now: ${f.season.plant.slice(0, 3).join(", ")}.`
        : `${f.season.note} Look out for the ${pick(f.season.birds, seed + 3)}.`;
    } else {
      tip = interest === "gardening"
        ? "Ask a local nursery what people near you are sowing this week, and start one pot of it."
        : "Pick the three birds you see most on your street and learn their calls this week.";
    }
    return { steps, tip, bring: bring.slice(0, 4) };
  }
}
