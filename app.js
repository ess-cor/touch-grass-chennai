// app.js: UI, on-device model (WebLLM), and the "go outside" timer.
import { buildPrompt, parseReply, planWithoutAI } from "./planner.js";

// WebLLM is pinned and loaded from a CDN; the service worker caches it for offline use.
const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/lib/index.js";

const MODELS = {
  gemma: { f16: "gemma-2-2b-it-q4f16_1-MLC", f32: "gemma-2-2b-it-q4f32_1-MLC", label: "Gemma 2 2B" },
  lite: { f16: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC", label: "Qwen2.5 0.5B" },
};

const $ = (id) => document.getElementById(id);
const state = { webllm: null, engine: null, modelKey: null, gpu: null, busy: false, plan: null };

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

function setStatus(html) {
  $("ai-status").innerHTML = html;
}

async function loadModel(key) {
  if (state.busy) return;
  state.busy = true;
  $("ai-actions").hidden = true;
  const bar = $("ai-progress");
  bar.hidden = false;
  setStatus(`Loading ${MODELS[key].label}… the first time downloads it to this device.`);
  try {
    state.webllm = state.webllm || (await import(WEBLLM_URL));
    state.engine = await state.webllm.CreateMLCEngine(modelId(key), {
      initProgressCallback: (p) => {
        bar.value = p.progress || 0;
        setStatus(`Loading ${MODELS[key].label}: ${Math.round((p.progress || 0) * 100)}%`);
      },
    });
    state.modelKey = key;
    localStorage.setItem("tg-model", key);
    setStatus(`✅ <b>${MODELS[key].label}</b> is running on this device. Nothing you type leaves your phone.`);
  } catch (e) {
    console.error(e);
    state.engine = null;
    setStatus(`Couldn't load the model (${escapeHTML(String(e.message || e)).slice(0, 140)}). You can still plan with the built-in planner.`);
    $("ai-actions").hidden = false;
  } finally {
    bar.hidden = true;
    state.busy = false;
  }
}

async function initAI() {
  state.gpu = await checkGPU();
  if (!state.gpu.ok) {
    setStatus(`${state.gpu.why} No problem: you'll get a plan from the built-in planner instead (no AI, still offline).`);
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
  setStatus("This device can run an AI model locally. Load it once and it stays on your phone. Or just plan without it.");
  $("ai-actions").hidden = false;
}

// ---------- Planning ----------

function readForm() {
  const fd = new FormData($("form"));
  return {
    city: (fd.get("city") || "").toString().trim() || "Chennai",
    minutes: Number(fd.get("minutes") || 30),
    interests: fd.getAll("interests").map(String),
    conditions: (fd.get("conditions") || "cloudy").toString(),
    note: (fd.get("note") || "").toString().trim(),
  };
}

function render(plan, source) {
  state.plan = plan;
  $("source").textContent = source;
  $("steps").innerHTML = plan.steps.map((s) => `<li>${escapeHTML(s)}</li>`).join("");
  $("tip").innerHTML = plan.tip ? `<b>This week:</b> ${escapeHTML(plan.tip)}` : "";
  $("stream").hidden = true;
  $("steps").hidden = false;
  $("result").hidden = false;
}

async function makePlan(e) {
  e.preventDefault();
  if (state.busy) return;
  const input = readForm();
  if (input.interests.length === 0) input.interests = ["walking"];
  const fallback = planWithoutAI(input);

  if (!state.engine) {
    render(fallback, "Built-in planner (no AI)");
    $("result").scrollIntoView({ behavior: "smooth" });
    return;
  }

  state.busy = true;
  $("go").disabled = true;
  $("result").hidden = false;
  $("steps").hidden = true;
  $("tip").textContent = "";
  $("source").textContent = `${MODELS[state.modelKey].label} is thinking, on your device…`;
  const out = $("stream");
  out.hidden = false;
  out.textContent = "";
  let text = "";
  try {
    // Instructions go in the user turn: Gemma's chat template has no system role.
    const chunks = await state.engine.chat.completions.create({
      messages: [{ role: "user", content: buildPrompt(input) }],
      temperature: 0.6,
      max_tokens: 260,
      stream: true,
    });
    for await (const c of chunks) {
      text += c.choices[0]?.delta?.content || "";
      out.textContent = text;
    }
    const parsed = parseReply(text);
    if (parsed) {
      if (!parsed.bring.length) parsed.bring = fallback.bring;
      if (!parsed.tip) parsed.tip = fallback.tip;
      render(parsed, `Planned by ${MODELS[state.modelKey].label}, on this device`);
    } else {
      render(fallback, "The model's answer was messy, so here's the built-in plan");
    }
  } catch (err) {
    console.error(err);
    render(fallback, "The model hit a snag, so here's the built-in plan");
  } finally {
    state.busy = false;
    $("go").disabled = false;
    $("result").scrollIntoView({ behavior: "smooth" });
  }
}

// ---------- Outside mode: timer + checklist ----------

let tick = null;

function startOutside() {
  const input = readForm();
  const session = {
    endAt: Date.now() + input.minutes * 60000,
    minutes: input.minutes,
    activity: (input.interests[0] || "walking"),
    bring: state.plan?.bring || [],
    steps: state.plan?.steps || [],
  };
  localStorage.setItem("tg-session", JSON.stringify(session));
  showOutside(session);
}

function showOutside(session) {
  $("plan-view").hidden = true;
  $("outside-view").hidden = false;
  $("checklist").innerHTML = ["Water", ...session.bring]
    .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i)
    .map((b) => `<li><label><input type="checkbox" /> ${escapeHTML(b)}</label></li>`)
    .join("");
  $("mini-steps").innerHTML = session.steps.map((s) => `<li>${escapeHTML(s)}</li>`).join("");
  $("back-note").value = "";
  let buzzed = false;
  const update = () => {
    const left = Math.max(0, session.endAt - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
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
  if (saveIt && session) {
    const started = session.endAt - session.minutes * 60000;
    const minutesOut = Math.max(1, Math.round((Date.now() - started) / 60000));
    const log = JSON.parse(localStorage.getItem("tg-log") || "[]");
    log.push({ at: Date.now(), minutes: minutesOut, activity: session.activity, note: $("back-note").value.trim() });
    localStorage.setItem("tg-log", JSON.stringify(log.slice(-200)));
  }
  document.title = "Touch Grass · a pocket outdoor planner";
  $("timer").classList.remove("done");
  $("outside-view").hidden = true;
  $("plan-view").hidden = false;
  renderLog();
}

function renderLog() {
  const log = JSON.parse(localStorage.getItem("tg-log") || "[]");
  if (!log.length) return;
  const weekAgo = Date.now() - 7 * 864e5;
  const week = log.filter((l) => l.at > weekAgo);
  const mins = week.reduce((a, l) => a + l.minutes, 0);
  const last = log[log.length - 1];
  $("log").innerHTML =
    `<b>This week:</b> ${week.length} time${week.length === 1 ? "" : "s"} outside, ${mins} min.` +
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

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Wire up ----------

$("form").addEventListener("submit", makePlan);
$("load-gemma").addEventListener("click", () => loadModel("gemma"));
$("load-lite").addEventListener("click", () => loadModel("lite"));
$("start").addEventListener("click", startOutside);
$("back").addEventListener("click", () => endOutside(true));
$("cancel").addEventListener("click", () => endOutside(false));

const pending = JSON.parse(localStorage.getItem("tg-session") || "null");
if (pending) showOutside(pending); // resume a timer after a reload
renderLog();
initAI();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
}
