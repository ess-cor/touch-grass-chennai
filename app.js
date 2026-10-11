// app.js: UI, on-device model (WebLLM + Gemma 2), structured plans, the "go outside" timer and the walk card.
import { buildPrompt, planSchema, validatePlan, applyGuardrails, planWithoutAI, localFacts, INTERESTS } from "./planner.js";
import { liveWeather } from "./weather.js";
import { drawWalkCard, shareCard } from "./card.js";
import { SAMPLE } from "./samples.js";

// WebLLM is pinned and loaded from a CDN; the service worker caches it for offline use.
const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/lib/index.js";

const MODELS = {
  gemma: { f16: "gemma-2-2b-it-q4f16_1-MLC", f32: "gemma-2-2b-it-q4f32_1-MLC", label: "Gemma 2 2B" },
  lite: { f16: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC", label: "Qwen2.5 0.5B" },
};

const $ = (id) => document.getElementById(id);
const state = { webllm: null, engine: null, modelKey: null, gpu: null, busy: false, plan: null, planner: "", weather: null };

// ---------- Device check & model loading ----------

async function checkGPU() {
  if (!("gpu" in navigator)) return { ok: false, why: "This browser doesn't support WebGPU." };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, why: "No WebGPU adapter was found on this device." };
    return { ok: true, f16: adapter.features.has("shader-f16") };
  } catch (e) {
    return { ok: false, why: "WebGPU is switched off or unavailable." };
  }
}

function modelId(key) {
  const m = MODELS[key];
  return state.gpu && state.gpu.f16 ? m.f16 : m.f32;
}

function setStatus(html, mode = "idle") {
  $("ai-status").innerHTML = html;
  $("ai-dot").className = `dot ${mode}`;
}

async function loadModel(key) {
  if (state.busy) return;
  state.busy = true;
  $("ai-actions").hidden = true;
  const bar = $("ai-progress");
  bar.hidden = false;
  setStatus(`Loading ${MODELS[key].label}… the first time downloads it to this device.`, "busy");
  try {
    state.webllm = state.webllm || (await import(WEBLLM_URL));
    state.engine = await state.webllm.CreateMLCEngine(modelId(key), {
      initProgressCallback: (p) => {
        bar.value = p.progress || 0;
        setStatus(`Loading ${MODELS[key].label}: ${Math.round((p.progress || 0) * 100)}%`, "busy");
      },
    });
    state.modelKey = key;
    localStorage.setItem("tg-model", key);
    setStatus(`<b>${MODELS[key].label}</b> is running on this device. Nothing you type leaves your phone.`, "on");
    $("sample-wrap").hidden = true;
  } catch (e) {
    console.error(e);
    state.engine = null;
    setStatus(`Couldn't load the model (${escapeHTML(String(e.message || e)).slice(0, 140)}). You can still plan with the built-in planner.`, "off");
    $("ai-actions").hidden = false;
  } finally {
    bar.hidden = true;
    state.busy = false;
  }
}

async function initAI() {
  state.gpu = await checkGPU();
  if (!state.gpu.ok) {
    setStatus(`${state.gpu.why} No problem: you'll get a plan from the built-in planner instead (no AI, still offline).`, "off");
    return;
  }
  // If a model was loaded before and is cached, start it automatically: no download, works offline.
  const saved = localStorage.getItem("tg-model");
  if (saved && MODELS[saved]) {
    try {
      state.webllm = await import(WEBLLM_URL);
      if (await state.webllm.hasModelInCache(modelId(saved))) {
        await loadModel(saved);
        return;
      }
    } catch (e) {
      console.warn("Cache check failed", e);
    }
  }
  setStatus("This device can run Gemma locally. Load it once and it stays on your phone, or just plan without it.", "idle");
  $("ai-actions").hidden = false;
}

// ---------- Live weather (optional, Open-Meteo) ----------

async function fetchWeather() {
  const btn = $("wx-btn");
  btn.disabled = true;
  $("wx").textContent = "Checking the sky…";
  try {
    const w = await liveWeather($("city").value);
    state.weather = w;
    const radio = document.querySelector(`input[name="conditions"][value="${w.condition}"]`);
    if (radio) radio.checked = true;
    $("wx").textContent = `${w.place}: ${w.summary}. Set to “${radio ? radio.nextElementSibling.textContent.trim() : w.condition}”.`;
  } catch (e) {
    state.weather = null;
    $("wx").textContent = navigator.onLine ? `No weather right now (${String(e.message || e).slice(0, 60)}). Pick it yourself.` : "You're offline. Just pick what it looks like outside.";
  } finally {
    btn.disabled = false;
  }
}

// ---------- Planning ----------

function readForm() {
  const fd = new FormData($("form"));
  const interests = fd.getAll("interests").map(String);
  return {
    city: (fd.get("city") || "").toString().trim() || "Chennai",
    minutes: Number(fd.get("minutes") || 30),
    interests: interests.length ? interests : ["walking"],
    conditions: (fd.get("conditions") || "cloudy").toString(),
    note: (fd.get("note") || "").toString().trim(),
  };
}

function render(plan, source, raw = "") {
  state.plan = plan;
  state.planner = source;
  $("source").textContent = source;
  $("plan-title").textContent = plan.title || "Your time outside";
  $("why").textContent = plan.why || "";
  $("why").hidden = !plan.why;
  $("steps").innerHTML = plan.steps.map((s) => `<li>${escapeHTML(s)}</li>`).join("");
  $("spot").innerHTML = plan.spot.map((s) => `<li><b>${escapeHTML(cap(s.name))}</b><span>${escapeHTML(s.hint)}</span></li>`).join("");
  $("spot-wrap").hidden = !plan.spot.length;
  $("spot-note").textContent = /built-in/i.test(source) ? "(from this season's list)" : "(chosen by the model from a verified list)";
  $("tip").innerHTML = plan.tip ? `<b>This season:</b> ${escapeHTML(plan.tip)}` : "";
  $("bring").innerHTML = plan.bring.length ? `<b>Bring</b> ${plan.bring.map((b) => `<span>${escapeHTML(b)}</span>`).join("")}` : "";
  $("stream-wrap").hidden = true;
  $("raw").textContent = raw;
  $("raw-wrap").hidden = !raw;
  for (const id of ["plan-title", "why", "steps", "spot-wrap", "tip", "bring", "start"]) $(id).classList.remove("pending");
  $("result").hidden = false;
}

function showPending(label) {
  $("result").hidden = false;
  $("source").textContent = label;
  $("plan-title").textContent = "";
  for (const id of ["plan-title", "why", "steps", "spot-wrap", "tip", "bring", "start"]) $(id).classList.add("pending");
  $("raw-wrap").hidden = true;
  $("stream-wrap").hidden = false;
  $("stream").textContent = "";
}

async function runModel(input, structured) {
  const facts = localFacts(input);
  const req = {
    // Instructions go in the user turn: Gemma's chat template has no system role.
    messages: [{ role: "user", content: buildPrompt(input, new Date(), state.weather) }],
    temperature: 0.6,
    max_tokens: 420,
    stream: true,
  };
  // Grammar-constrained decoding (XGrammar inside WebLLM): the output must match the schema,
  // and the "spot" names are an enum, so the model can't invent a species.
  if (structured) req.response_format = { type: "json_object", schema: JSON.stringify(planSchema(facts)) };
  let text = "";
  const chunks = await state.engine.chat.completions.create(req);
  for await (const c of chunks) {
    text += c.choices[0]?.delta?.content || "";
    $("stream").textContent = text;
    $("stream").scrollTop = $("stream").scrollHeight;
  }
  return { text, plan: validatePlan(text, facts) };
}

async function makePlan(e) {
  e.preventDefault();
  if (state.busy) return;
  const input = readForm();
  const fallback = planWithoutAI(input);

  if (!state.engine) {
    render(applyGuardrails(fallback, input), "Built-in planner (no AI on this device)");
    $("result").scrollIntoView({ behavior: "smooth" });
    return;
  }

  state.busy = true;
  $("go").disabled = true;
  const label = MODELS[state.modelKey].label;
  showPending(`${label} is planning, on your device…`);
  $("result").scrollIntoView({ behavior: "smooth" });
  let result = null;
  let how = "";
  try {
    result = await runModel(input, true);
    how = "schema-constrained JSON";
  } catch (err) {
    console.warn("Constrained decoding failed, retrying without a grammar", err);
  }
  try {
    if (!result || !result.plan) {
      $("stream-label").textContent = "Trying again without the grammar…";
      result = await runModel(input, false);
      how = "JSON, validated";
    }
    if (result.plan) {
      const p = result.plan;
      if (!p.spot.length) p.spot = fallback.spot;
      if (!p.bring.length) p.bring = fallback.bring;
      if (!p.tip) p.tip = fallback.tip;
      if (!p.title) p.title = fallback.title;
      render(applyGuardrails(p, input), `✨ Planned by ${label} on this device · ${how}`, result.text);
    } else {
      render(applyGuardrails(fallback, input), "The model's answer was messy, so here's the built-in plan", result.text);
    }
  } catch (err) {
    console.error(err);
    render(applyGuardrails(fallback, input), "The model hit a snag, so here's the built-in plan");
  } finally {
    state.busy = false;
    $("go").disabled = false;
    $("stream-label").textContent = "Writing JSON, token by token…";
  }
}

// A real, recorded Gemma 2 answer for people whose browser can't run the model.
function showSample(ev) {
  ev && ev.preventDefault();
  const s = SAMPLE.input;
  $("city").value = s.city;
  document.querySelector(`input[name="minutes"][value="${s.minutes}"]`).checked = true;
  document.querySelectorAll('input[name="interests"]').forEach((el) => (el.checked = s.interests.includes(el.value)));
  document.querySelector(`input[name="conditions"][value="${s.conditions}"]`).checked = true;
  const date = new Date(SAMPLE.date);
  const plan = validatePlan(SAMPLE.raw, localFacts(s, date));
  render(applyGuardrails(plan, s, date), "Recorded example: a real, unedited Gemma 2 2B answer to this prompt (run with llama.cpp, same weights). Load the model to get your own.", SAMPLE.raw);
  $("raw-wrap").open = false;
  $("result").scrollIntoView({ behavior: "smooth" });
}

// ---------- Outside mode: timer + checklists ----------

let tick = null;
const RING = 2 * Math.PI * 52;

function startOutside() {
  const input = readForm();
  const plan = state.plan || planWithoutAI(input);
  const session = {
    endAt: Date.now() + input.minutes * 60000,
    minutes: input.minutes,
    city: input.city,
    activity: input.interests[0] || "walking",
    title: plan.title,
    bring: plan.bring || [],
    steps: plan.steps || [],
    spot: plan.spot || [],
    planner: state.planner,
    ticked: [],
  };
  localStorage.setItem("tg-session", JSON.stringify(session));
  showOutside(session);
}

function saveSession(session) {
  localStorage.setItem("tg-session", JSON.stringify(session));
}

function showOutside(session) {
  $("plan-view").hidden = true;
  $("card-view").hidden = true;
  $("outside-view").hidden = false;
  window.scrollTo(0, 0);
  $("out-title").textContent = session.title || "";
  $("spot-check").innerHTML = session.spot
    .map((s, i) => `<li><label><input type="checkbox" data-i="${i}" ${session.ticked.includes(i) ? "checked" : ""}/> <span>${escapeHTML(cap(s.name))}</span></label></li>`)
    .join("");
  $("spot-check").onchange = (ev) => {
    const i = Number(ev.target.dataset.i);
    session.ticked = ev.target.checked ? [...new Set([...session.ticked, i])] : session.ticked.filter((x) => x !== i);
    saveSession(session);
  };
  $("checklist").innerHTML = session.bring
    .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i)
    .map((b) => `<li><label><input type="checkbox" /> <span>${escapeHTML(cap(b))}</span></label></li>`)
    .join("");
  $("mini-steps").innerHTML = session.steps.map((s) => `<li>${escapeHTML(s)}</li>`).join("");
  $("back-note").value = "";
  const ring = $("ring-fg");
  ring.style.strokeDasharray = RING;
  let buzzed = false;
  const total = session.minutes * 60000;
  const update = () => {
    const left = Math.max(0, session.endAt - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    ring.style.strokeDashoffset = RING * (1 - left / total);
    $("timer").textContent = `${m}:${String(s).padStart(2, "0")}`;
    document.title = left ? `${m}:${String(s).padStart(2, "0")} outside · Touch Grass` : "Time's up · Touch Grass";
    if (!left && !buzzed) {
      buzzed = true;
      $("timer").classList.add("done");
      $("timer").textContent = "Time's up 🌿";
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      chime();
    }
  };
  update();
  clearInterval(tick);
  tick = setInterval(update, 1000);
}

function endOutside(saveIt) {
  clearInterval(tick);
  const session = JSON.parse(localStorage.getItem("tg-session") || "null");
  localStorage.removeItem("tg-session");
  document.title = "Touch Grass · a pocket outdoor planner";
  $("timer").classList.remove("done");
  $("outside-view").hidden = true;
  if (saveIt && session) {
    const started = session.endAt - session.minutes * 60000;
    const minutesOut = Math.max(1, Math.round((Date.now() - started) / 60000));
    const note = $("back-note").value.trim();
    const spotted = session.ticked.map((i) => session.spot[i]?.name).filter(Boolean);
    const log = JSON.parse(localStorage.getItem("tg-log") || "[]");
    log.push({ at: Date.now(), minutes: minutesOut, activity: session.activity, note, spotted });
    localStorage.setItem("tg-log", JSON.stringify(log.slice(-200)));
    showCard({
      minutes: minutesOut,
      title: session.title,
      city: session.city,
      spotted: spotted.map(cap),
      total: session.spot.length,
      note,
      planner: session.planner && session.planner.includes("Planned by") ? `Planned on-device by ${session.planner.match(/by (.+?) on/)?.[1] || "an open model"}` : "Planned on-device by Touch Grass",
      date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    });
    return;
  }
  $("plan-view").hidden = false;
  renderLog();
}

function showCard(data) {
  $("card-view").hidden = false;
  window.scrollTo(0, 0);
  drawWalkCard($("walk-card"), data);
  $("share").onclick = async () => {
    try {
      const how = await shareCard($("walk-card"), `${data.minutes} min outside${data.title ? `: ${data.title}` : ""}`);
      $("share").textContent = how === "shared" ? "Shared ✓" : "Saved ✓";
    } catch (e) {
      console.warn(e);
    }
  };
}

function closeCard() {
  $("card-view").hidden = true;
  $("plan-view").hidden = false;
  $("share").textContent = "Share walk card";
  renderLog();
}

function renderLog() {
  const log = JSON.parse(localStorage.getItem("tg-log") || "[]");
  if (!log.length) return;
  const weekAgo = Date.now() - 7 * 864e5;
  const week = log.filter((l) => l.at > weekAgo);
  const mins = week.reduce((a, l) => a + l.minutes, 0);
  const spotted = new Set(week.flatMap((l) => l.spotted || []));
  const last = log[log.length - 1];
  $("log").innerHTML =
    `<b>This week:</b> ${week.length} time${week.length === 1 ? "" : "s"} outside, ${mins} min` +
    (spotted.size ? `, ${spotted.size} thing${spotted.size === 1 ? "" : "s"} spotted.` : ".") +
    (last.note ? `<br><span class="muted">Last time: “${escapeHTML(last.note)}”</span>` : "");
  $("log").hidden = false;
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.45);
    });
  } catch (_) {}
}

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Wire up ----------

$("form").addEventListener("submit", makePlan);
$("wx-btn").addEventListener("click", fetchWeather);
$("load-gemma").addEventListener("click", () => loadModel("gemma"));
$("load-lite").addEventListener("click", () => loadModel("lite"));
$("sample-link").addEventListener("click", showSample);
$("start").addEventListener("click", startOutside);
$("back").addEventListener("click", () => endOutside(true));
$("cancel").addEventListener("click", () => endOutside(false));
$("done").addEventListener("click", closeCard);

const pending = JSON.parse(localStorage.getItem("tg-session") || "null");
if (pending) showOutside({ ticked: [], spot: [], ...pending }); // resume a timer after a reload
renderLog();
initAI();
if (new URLSearchParams(location.search).has("sample")) showSample();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
}

// Exposed for screenshots and debugging only.
window.__tg = { showCard, showOutside, render, INTERESTS };
