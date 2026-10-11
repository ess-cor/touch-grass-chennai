// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, planSchema, validatePlan, applyGuardrails, planWithoutAI, localFacts, timeBudget, BIRD_NOTES } from "../planner.js";
import { SAMPLE } from "../samples.js";

const oct = new Date("2026-10-11T17:30:00");
const base = { city: "Chennai", minutes: 30, interests: ["birding"], conditions: "cloudy", note: "" };

test("spot enum only contains birds of this season plus generic things", () => {
  const f = localFacts(base, oct);
  const enumList = planSchema(f).properties.spot.items.properties.name.enum;
  assert.ok(enumList.includes("Blue-tailed Bee-eater"));
  assert.ok(!enumList.includes("Asian Koel"), "hot-season bird must not be offered in October");
  for (const n of enumList.filter((n) => /^[A-Z]/.test(n))) assert.ok(BIRD_NOTES[n], `${n} has a field note`);
});

test("other cities get no species at all", () => {
  const f = localFacts({ ...base, city: "Bengaluru" }, oct);
  assert.ok(f.spotOptions.every((s) => /^[a-z]/.test(s)));
  assert.match(buildPrompt({ ...base, city: "Bengaluru" }, oct), /Do NOT name specific bird species/);
});

test("short outings don't send you across the city", () => {
  assert.equal(localFacts(base, oct).places.length, 0);
  assert.ok(localFacts({ ...base, minutes: 60 }, oct).places.length > 0);
});

test("time budget adds up", () => {
  for (const m of [15, 30, 60, 120]) {
    const b = timeBudget(m);
    assert.equal(b.out + b.main + b.back, m);
  }
});

test("validator drops invented species and duplicates", () => {
  const f = localFacts(base, oct);
  const raw = JSON.stringify({
    title: "x", steps: ["a", "b", "c"], tip: "t", bring: ["water"], why: "w",
    spot: [{ name: "Grey Wagtail", hint: "h" }, { name: "Dodo", hint: "h" }, { name: "grey wagtail", hint: "h" }],
  });
  const p = validatePlan(raw, f);
  assert.deepEqual(p.spot.map((s) => s.name), ["Grey Wagtail"]);
});

test("validator rejects junk", () => {
  assert.equal(validatePlan("sorry, I can't", localFacts(base, oct)), null);
});

test("guardrails add shade, umbrella and sea warnings", () => {
  const p = { title: "t", steps: ["Walk."], spot: [], tip: "", bring: ["cap"], why: "" };
  const hot = applyGuardrails(p, { ...base, conditions: "hot" }, oct);
  assert.ok(hot.steps.some((s) => /shade/.test(s)));
  const beach = applyGuardrails(p, { ...base, interests: ["beach"], conditions: "drizzle" }, oct);
  assert.ok(beach.steps.some((s) => /Stay out of the water/.test(s)));
  assert.equal(beach.bring[0], "umbrella");
});

test("fallback planner always returns a full plan", () => {
  for (const interests of [["birding"], ["walking"], ["gardening"], ["beach"], ["cycling"]])
    for (const conditions of ["clear", "cloudy", "hot", "drizzle", "storm"]) {
      const p = planWithoutAI({ ...base, interests, conditions }, oct);
      assert.ok(p.steps.length >= 3 && p.spot.length >= 3 && p.title && p.tip && p.bring.length);
    }
});

test("the recorded Gemma sample passes validation untouched", () => {
  const p = validatePlan(SAMPLE.raw, localFacts(SAMPLE.input, new Date(SAMPLE.date)));
  assert.ok(p && p.spot.length >= 3 && p.steps.length === 3);
});
