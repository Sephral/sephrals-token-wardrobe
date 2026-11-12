import assert from "node:assert/strict";
import test from "node:test";
import {MAX_SLOTS, changeSlot, emptyStage, layoutStage, normalizeStage, planEnter, planLeave, resolveExpression,
  sameSubject, sceneOutfitName, stageMetrics, startOutfit, withSlot, withSpeaker, withoutSlot} from "../scripts/stage-logic.mjs";
import {normalizeOutfit} from "../scripts/outfits.mjs";

let counter = 0;
const makeId = () => `id${++counter}`;
const slot = (actorId, extra = {}) => ({id: `s-${actorId}`, actorId, tokenUuid: "", name: actorId, img: `${actorId}.webp`,
  outfitId: null, expression: "", side: null, ...extra});
const outfit = (label, extra = {}) => normalizeOutfit({id: label, label, portrait: `${label}.webp`, ...extra}, makeId);

test("normalizeStage keeps what is valid and drops the rest", () => {
  const state = normalizeStage({active: true, backdrop: "neon", speaker: "nobody", slots: [
    {id: "a", actorId: "x", img: "x.webp", side: "up", expression: "angry"},
    {id: "a", actorId: "y", img: "y.webp"},
    {actorId: "z"},
    null
  ]}, makeId);
  assert.equal(state.backdrop, "soft");
  assert.equal(state.speaker, null);
  assert.equal(state.slots.length, 2);
  assert.notEqual(state.slots[0].id, state.slots[1].id);
  assert.equal(state.slots[0].side, null);
  assert.equal(state.slots[0].expression, "angry");
  assert.equal(state.active, true);
  assert.equal(normalizeStage({active: true, slots: []}, makeId).active, false);
  assert.deepEqual(normalizeStage(undefined, makeId), emptyStage());
  assert.equal(normalizeStage({slots: Array.from({length: 12}, (_, i) => slot(`a${i}`))}, makeId).slots.length, MAX_SLOTS);
});

test("slots are added once per character, changed and removed", () => {
  let state = withSlot(emptyStage(), slot("a"));
  assert.equal(state.active, true);
  state = withSlot(state, slot("b", {tokenUuid: "Scene.1.Token.2"}));
  state = withSlot(state, {...slot("a"), img: "a2.webp", id: "other"});
  assert.equal(state.slots.length, 2);
  assert.equal(state.slots[0].img, "a2.webp");
  assert.equal(state.slots[0].id, "s-a");
  assert.ok(sameSubject(state.slots[1], "b", "Scene.1.Token.2"));
  assert.ok(!sameSubject(state.slots[1], "b", ""));
  state = withSpeaker(state, "s-a");
  assert.equal(state.speaker, "s-a");
  assert.equal(withSpeaker(state, "s-a", true).speaker, null);
  assert.equal(withSpeaker(state, "missing").speaker, "s-a");
  state = changeSlot(state, "s-a", {img: "a3.webp", id: "hacked"});
  assert.equal(state.slots[0].img, "a3.webp");
  assert.equal(state.slots[0].id, "s-a");
  state = withoutSlot(state, "s-a");
  assert.equal(state.speaker, null);
  assert.equal(state.active, true);
  state = withoutSlot(state, "s-b");
  assert.equal(state.active, false);
});

test("a full stage takes no more portraits", () => {
  let state = emptyStage();
  for ( let i = 0; i < MAX_SLOTS + 2; i++ ) state = withSlot(state, slot(`a${i}`));
  assert.equal(state.slots.length, MAX_SLOTS);
});

test("expressions are found by id, name, position or mood", () => {
  const list = [outfit("Calm", {expression: "neutral"}), outfit("Furious", {expression: "angry"}), outfit("Bruised", {expression: "hurt"})];
  assert.equal(resolveExpression(list, "Furious").id, "Furious");
  assert.equal(resolveExpression(list, "furious").id, "Furious");
  assert.equal(resolveExpression(list, 3).id, "Bruised");
  assert.equal(resolveExpression(list, "angry").id, "Furious");
  assert.equal(resolveExpression(list, "hurt").id, "Bruised");
  assert.equal(resolveExpression(list, "afraid"), null);
  assert.equal(resolveExpression(list, ""), null);
  assert.equal(startOutfit(list, null, "Bruised").id, "Bruised");
  assert.equal(startOutfit(list, "angry", "Bruised").id, "Furious");
  assert.equal(startOutfit(list, null, "gone").id, "Calm");
  assert.equal(startOutfit([], null, null), null);
});

test("the layout alternates the sides and respects fixed sides", () => {
  const sides = layoutStage([{id: "a", side: null}, {id: "b", side: null}, {id: "c", side: null}, {id: "d", side: null}]);
  assert.deepEqual(sides.map(s => `${s.side}${s.pos}`), ["left0", "right0", "left1", "right1"]);
  const fixed = layoutStage([{id: "a", side: "right"}, {id: "b", side: null}, {id: "c", side: null}]);
  assert.deepEqual(fixed.map(s => `${s.side}${s.pos}`), ["right0", "left0", "left1"]);
  assert.deepEqual(layoutStage([]), []);
});

test("the metrics fit the screen from 1280 wide up and keep the portraits apart", () => {
  for ( const [width, height] of [[1280, 720], [1920, 1080], [900, 600], [2560, 1300]] ) {
    for ( const [left, right] of [[1, 0], [1, 1], [3, 3], [6, 0]] ) {
      const m = stageMetrics({width, height, left, right});
      assert.ok(m.w > 0 && m.h > 0 && m.h <= height, JSON.stringify([width, height, left, right, m]));
      const most = Math.max(left, right);
      // The outer portraits end before the middle of the screen, a little overlap in the middle is fine
      assert.ok(m.edge + (most - 1) * m.step + m.w <= width / 2 + m.w * 0.5, JSON.stringify([width, height, left, right, m]));
    }
  }
  const small = stageMetrics({width: 1280, height: 720, left: 1, right: 1, scale: 0.8});
  const large = stageMetrics({width: 1280, height: 720, left: 1, right: 1, scale: 1.2});
  assert.ok(large.h > small.h);
});

test("entering a place puts the outfit on and remembers the previous one only when asked", () => {
  assert.deepEqual(planEnter({current: "a", wanted: "b", restore: true, stored: false}), {wear: "b", remember: true, previous: "a"});
  assert.deepEqual(planEnter({current: "a", wanted: "b", restore: false, stored: false}), {wear: "b", remember: false, previous: "a"});
  assert.equal(planEnter({current: "b", wanted: "b", restore: true, stored: false}).wear, null);
  assert.equal(planEnter({current: "b", wanted: "b", restore: true, stored: false}).remember, false);
  // entering again without leaving keeps the first memory
  assert.equal(planEnter({current: "b", wanted: "c", restore: true, stored: true}).remember, false);
  assert.equal(planEnter({current: "a", wanted: null, restore: true, stored: false}).wear, null);
  assert.equal(planEnter({current: null, wanted: "b", restore: true, stored: false}).previous, "");
});

test("leaving a place gives the previous outfit back", () => {
  assert.deepEqual(planLeave({stored: "a", current: "b", known: "a"}), {wear: "a", forget: true});
  assert.deepEqual(planLeave({stored: "a", current: "a", known: "a"}), {wear: null, forget: true});
  assert.deepEqual(planLeave({stored: "", current: "b", known: null}), {wear: null, forget: true});
  assert.deepEqual(planLeave({stored: "gone", current: "b", known: null}), {wear: null, forget: true});
  assert.deepEqual(planLeave({stored: undefined, current: "b", known: null}), {wear: null, forget: false});
});

test("the outfit name of a scene is trimmed text", () => {
  assert.equal(sceneOutfitName("  Street clothes "), "Street clothes");
  assert.equal(sceneOutfitName(null), "");
  assert.equal(sceneOutfitName(5), "");
});
