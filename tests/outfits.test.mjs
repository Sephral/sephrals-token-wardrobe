import assert from "node:assert/strict";
import test from "node:test";
import {ARMOR_TYPES, EXPRESSIONS, armorState, nameChange, normalizeExpression, stageName, alternateFiles, autoMatches, barPercent, cycleOutfit, findOutfit, hasAuto, isVideo, labelFromStem,
  normalizeAuto, normalizeOutfit, normalizeOutfits, outfitsFromFiles, planAuto, quickStartOutfits, sharesStem,
  splitKind, textureScale, uniqueNames, usableOutfits} from "../scripts/outfits.mjs";

let counter = 0;
const makeId = () => `id${++counter}`;
const outfit = (label, extra={}) => normalizeOutfit({id: label, label, portrait: `${label}.webp`, ...extra}, makeId);

test("normalizeOutfit fills the defaults and keeps videos out of the portrait", () => {
  const o = normalizeOutfit({label: " Battle ", portrait: "a/b.webm", token: "a/b.webm", scale: "1.5", mirror: 1}, makeId);
  assert.equal(o.label, "Battle");
  assert.equal(o.portrait, "");
  assert.equal(o.token, "a/b.webm");
  assert.equal(o.scale, 1.5);
  assert.equal(o.mirror, true);
  assert.deepEqual(o.auto, {combat: false, hp: null, status: [], armor: [], gear: []});
  assert.ok(o.id);
});

test("normalizeOutfit takes the label from the file name", () => {
  assert.equal(normalizeOutfit({token: "x/fine-clothes.png"}, makeId).label, "Fine clothes");
});

test("normalizeOutfits drops empty entries, replaces duplicate ids and accepts index keyed objects", () => {
  const list = normalizeOutfits({0: {id: "a", portrait: "a.png"}, 1: {id: "a", portrait: "b.png"}, 2: {}}, makeId);
  assert.equal(list.length, 2);
  assert.notEqual(list[0].id, list[1].id);
  assert.deepEqual(normalizeOutfits(null, makeId), []);
});

test("outfits without images are not usable and cannot be found", () => {
  const list = [normalizeOutfit({id: "a", label: "Empty"}, makeId), outfit("B")];
  assert.deepEqual(usableOutfits(list).map(o => o.id), ["B"]);
  assert.equal(findOutfit(list, "Empty"), null);
  assert.equal(findOutfit(list, "b").id, "B");
  assert.equal(findOutfit(list, 1).id, "B");
  assert.equal(findOutfit(list, 2), null);
  assert.equal(findOutfit(list, ""), null);
});

test("cycleOutfit wraps and starts at the ends", () => {
  const list = [outfit("A"), normalizeOutfit({id: "x", label: "none"}, makeId), outfit("B"), outfit("C")];
  assert.equal(cycleOutfit(list, "A", 1), "B");
  assert.equal(cycleOutfit(list, "C", 1), "A");
  assert.equal(cycleOutfit(list, "A", -1), "C");
  assert.equal(cycleOutfit(list, null, 1), "A");
  assert.equal(cycleOutfit(list, "gone", -1), "C");
  assert.equal(cycleOutfit([], "A", 1), null);
});

test("splitKind finds the kind as suffix or prefix", () => {
  const pick = ({base, kind}) => ({base, kind});
  assert.deepEqual(pick(splitKind("battle-token")), {base: "battle", kind: "token"});
  assert.deepEqual(pick(splitKind("battle_portrait")), {base: "battle", kind: "portrait"});
  assert.deepEqual(pick(splitKind("Token Fine Clothes")), {base: "Fine Clothes", kind: "token"});
  assert.deepEqual(pick(splitKind("dark-art")), {base: "dark-art", kind: null});
  assert.deepEqual(pick(splitKind("tokenizer")), {base: "tokenizer", kind: null});
  assert.equal(splitKind("battle-token").after, "-token");
  assert.equal(splitKind("token-battle").before, "token-");
});

test("outfitsFromFiles pairs token and portrait files", () => {
  const list = outfitsFromFiles(["d/kampf-token.webp", "d/kampf-portrait.webp", "d/strasse-portrait.webp",
    "d/strasse-token.png"], {makeId});
  assert.equal(list.length, 2);
  const kampf = list.find(o => o.label === "Kampf");
  assert.equal(kampf.token, "d/kampf-token.webp");
  assert.equal(kampf.portrait, "d/kampf-portrait.webp");
});

test("outfitsFromFiles gives a single image to both slots and a video to the token", () => {
  const list = outfitsFromFiles(["d/one.webp", "d/two.webm"], {makeId});
  const one = list.find(o => o.label === "One");
  const two = list.find(o => o.label === "Two");
  assert.equal(one.portrait, "d/one.webp");
  assert.equal(one.token, "d/one.webp");
  assert.equal(two.portrait, "");
  assert.equal(two.token, "d/two.webm");
});

test("outfitsFromFiles can fill the token only, skips known files and drops the common beginning", () => {
  const known = [outfit("Known", {portrait: "d/hero-known.webp", token: "d/hero-known.webp"})];
  const list = outfitsFromFiles(["d/hero-known.webp", "d/hero-a.webp", "d/hero-b.webp"], {existing: known, makeId,
    single: "token"});
  assert.deepEqual(list.map(o => o.label), ["A", "B"]);
  assert.ok(list.every(o => !o.portrait && o.token));
});

test("outfitsFromFiles lets a plain file complete a pair", () => {
  const list = outfitsFromFiles(["d/gala.webp", "d/gala-token.webp"], {makeId});
  assert.equal(list.length, 1);
  assert.equal(list[0].portrait, "d/gala.webp");
  assert.equal(list[0].token, "d/gala-token.webp");
});

test("sharesStem and alternateFiles find variants next to a portrait", () => {
  assert.ok(sharesStem("merchant-angry", "merchant"));
  assert.ok(!sharesStem("merchants", "merchant"));
  assert.ok(!sharesStem("guard-12", "guard-1"));
  const files = ["a/hero.webp", "a/hero-battle.webp", "a/hero-token.webp", "a/heroine.webp", "a/other.webp"];
  assert.deepEqual(alternateFiles(files, ["a/hero.webp"]), ["a/hero-battle.webp", "a/hero-token.webp"]);
  const existing = [outfit("B", {portrait: "a/hero-battle.webp"})];
  assert.deepEqual(alternateFiles(files, ["a/hero.webp"], {existing}), ["a/hero-token.webp"]);
});

test("quickStartOutfits puts the current look first", () => {
  const list = quickStartOutfits(["Street", "Battle", "Fine"], {portrait: "p.webp", token: "t.webp"}, makeId);
  assert.equal(list.length, 3);
  assert.equal(list[0].portrait, "p.webp");
  assert.equal(list[0].token, "t.webp");
  assert.deepEqual(usableOutfits(list).map(o => o.label), ["Street"]);
  assert.equal(list[1].portrait, "");
});

test("textureScale applies scale and mirror and restores the old scale", () => {
  const current = {scaleX: 1.2, scaleY: 1.2};
  const first = textureScale({scale: 2, mirror: false}, current, null);
  assert.deepEqual(first, {scaleX: 2, scaleY: 2, base: {scaleX: 1.2, scaleY: 1.2}});
  const second = textureScale({scale: null, mirror: true}, {scaleX: 2, scaleY: 2}, first.base);
  assert.deepEqual(second, {scaleX: -1.2, scaleY: 1.2, base: {scaleX: 1.2, scaleY: 1.2}});
  const back = textureScale({scale: null, mirror: false}, {scaleX: -1.2, scaleY: 1.2}, second.base);
  assert.deepEqual(back, {scaleX: 1.2, scaleY: 1.2, base: null});
  const plain = textureScale({scale: null, mirror: false}, {scaleX: 3, scaleY: 3}, null);
  assert.deepEqual(plain, {scaleX: 3, scaleY: 3, base: null});
});

test("barPercent reads value and maximum", () => {
  assert.equal(barPercent({value: 5, max: 10}), 50);
  assert.equal(barPercent({value: 5, max: 10, effectiveMax: 20}), 25);
  assert.equal(barPercent({value: -3, max: 10}), 0);
  assert.equal(barPercent({value: 5, max: 0}), null);
  assert.equal(barPercent(null), null);
  assert.equal(barPercent(7), null);
});

const state = (extra={}) => ({inCombat: false, hpPercent: 100, statuses: [], ...extra});

test("normalizeAuto and hasAuto", () => {
  assert.deepEqual(normalizeAuto({combat: 1, hp: "40", status: ["prone", "prone", "", 5]}),
    {combat: true, hp: 40, status: ["prone"], armor: [], gear: []});
  assert.equal(normalizeAuto({hp: 0}).hp, null);
  assert.equal(normalizeAuto({hp: 250}).hp, 100);
  assert.equal(hasAuto(outfit("A")), false);
  assert.equal(hasAuto(outfit("A", {auto: {hp: 30}})), true);
});

test("autoMatches covers combat, hit points and status", () => {
  const o = outfit("A", {auto: {combat: true, hp: 50, status: ["poisoned"]}});
  assert.equal(autoMatches(o, state()), false);
  assert.equal(autoMatches(o, state({inCombat: true})), true);
  assert.equal(autoMatches(o, state({hpPercent: 49.9})), true);
  assert.equal(autoMatches(o, state({hpPercent: 50})), false);
  assert.equal(autoMatches(o, state({hpPercent: null})), false);
  assert.equal(autoMatches(o, state({statuses: new Set(["poisoned"])})), true);
  assert.equal(autoMatches(outfit("B"), state({inCombat: true})), false);
});

test("planAuto puts on the first matching outfit and goes back to the manual one", () => {
  const list = [outfit("Street"), outfit("Battle", {auto: {combat: true}}), outfit("Hurt", {auto: {hp: 30}})];
  const idle = {manual: "Street", current: "Street", autoId: null};
  assert.deepEqual(planAuto(list, state(), idle), {change: false});
  const fight = planAuto(list, state({inCombat: true, hpPercent: 10}), idle);
  assert.deepEqual(fight, {change: true, wear: "Battle", autoId: "Battle", manual: "Street"});
  const over = planAuto(list, state(), {manual: "Street", current: "Battle", autoId: "Battle"});
  assert.deepEqual(over, {change: true, wear: "Street", autoId: null, manual: "Street"});
});

test("planAuto leaves a manual choice alone while the situation stays the same", () => {
  const list = [outfit("Street"), outfit("Battle", {auto: {combat: true}}), outfit("Fine")];
  const memory = {manual: "Fine", current: "Fine", autoId: "Battle"};
  assert.deepEqual(planAuto(list, state({inCombat: true}), memory), {change: false});
});

test("planAuto remembers the current outfit as the manual one when nothing was chosen yet", () => {
  const list = [outfit("Street"), outfit("Battle", {auto: {combat: true}})];
  const start = planAuto(list, state({inCombat: true}), {manual: null, current: "Street", autoId: null});
  assert.equal(start.manual, "Street");
  const end = planAuto(list, state(), {manual: "Street", current: "Battle", autoId: "Battle"});
  assert.equal(end.wear, "Street");
});

test("planAuto changes from one automatic outfit to the next in list order", () => {
  const list = [outfit("Hurt", {auto: {hp: 30}}), outfit("Battle", {auto: {combat: true}})];
  const memory = {manual: "X", current: "Battle", autoId: "Battle"};
  const plan = planAuto(list, state({inCombat: true, hpPercent: 20}), memory);
  assert.deepEqual(plan, {change: true, wear: "Hurt", autoId: "Hurt", manual: "X"});
});

test("helpers for file names", () => {
  assert.ok(isVideo("a/b.WEBM?x=1"));
  assert.ok(!isVideo("a/b.webp"));
  assert.equal(labelFromStem("hero-battle-gear", "hero-"), "Battle gear");
});

test("uniqueNames keeps free names and counts up taken ones", () => {
  const free = uniqueNames(["a.webp", "b.png"], new Set(["c.webp"]));
  assert.equal(free.get("a.webp"), "a.webp");
  const taken = uniqueNames(["a.webp"], new Set(["a.webp", "a-2.webp"]));
  assert.equal(taken.get("a.webp"), "a-3.webp");
});

test("uniqueNames keeps token and portrait files of one set together", () => {
  const names = uniqueNames(["battle-token.webp", "battle-portrait.webp", "other.webp"], new Set(["battle-token.webp"]));
  assert.equal(names.get("battle-token.webp"), "battle-2-token.webp");
  assert.equal(names.get("battle-portrait.webp"), "battle-2-portrait.webp");
  assert.equal(names.get("other.webp"), "other.webp");
  const list = outfitsFromFiles([...names.values()], {makeId});
  assert.equal(list.length, 2);
  const pair = list.find(o => o.portrait && o.token !== o.portrait);
  assert.ok(pair.token.includes("-2-token") && pair.portrait.includes("-2-portrait"));
});

test("uniqueNames handles a kind word in front", () => {
  const names = uniqueNames(["token-hero.webp"], new Set(["token-hero.webp"]));
  assert.equal(names.get("token-hero.webp"), "token-hero-2.webp");
});

test("outfits carry a mood and a disguise", () => {
  const o = normalizeOutfit({label: "Angry", token: "a.webp", expression: " Angry ", disguise: "  Old Merchant "}, makeId);
  assert.equal(o.expression, "angry");
  assert.equal(o.disguise, "Old Merchant");
  assert.equal(normalizeOutfit({token: "a.webp", expression: "bored"}, makeId).expression, "");
  assert.equal(normalizeOutfit({token: "a.webp"}, makeId).disguise, "");
  assert.equal(normalizeExpression(null), "");
  assert.ok(EXPRESSIONS.includes("hurt"));
});

test("a disguise keeps the real name aside and gives it back", () => {
  assert.deepEqual(nameChange("Gruk", null, "Baron"), {name: "Baron", real: "Gruk"});
  assert.deepEqual(nameChange("Baron", "Gruk", "Monk"), {name: "Monk", real: "Gruk"});
  assert.deepEqual(nameChange("Baron", "Gruk", ""), {name: "Gruk", real: null});
  assert.deepEqual(nameChange("Gruk", null, ""), {name: "Gruk", real: null});
  assert.deepEqual(nameChange("Baron", null, "Baron"), {name: "Baron", real: null});
});

test("the stage shows the disguise of the outfit shown, else of the outfit worn", () => {
  const baron = {disguise: "Baron"};
  const plain = {disguise: ""};
  assert.equal(stageName("Gruk", baron, null), "Baron");
  assert.equal(stageName("Gruk", plain, baron), "Baron");
  assert.equal(stageName("Gruk", plain, plain), "Gruk");
  assert.equal(stageName("Gruk", null, null), "Gruk");
});

test("armor rules follow the equipped armor", () => {
  assert.deepEqual(normalizeAuto({armor: ["heavy", "bogus", "heavy", "none"]}).armor, ["none", "heavy"]);
  assert.equal(hasAuto(outfit("A", {auto: {armor: ["light"]}})), true);
  const plate = armorState([{type: "equipment", equipped: true, kind: "heavy"}, {type: "equipment", equipped: false, kind: "light"}]);
  assert.ok(plate.has("heavy") && !plate.has("light") && !plate.has("none"));
  const robes = armorState([{type: "equipment", equipped: true, kind: "shield"}, {type: "weapon", equipped: true, kind: "heavy"}]);
  assert.ok(robes.has("none") && robes.has("shield") && !robes.has("heavy"));
  const heavy = outfit("Plate", {auto: {armor: ["heavy"]}});
  const none = outfit("Street", {auto: {armor: ["none"]}});
  assert.equal(autoMatches(heavy, state({armor: plate})), true);
  assert.equal(autoMatches(none, state({armor: plate})), false);
  assert.equal(autoMatches(none, state({armor: robes})), true);
  assert.equal(autoMatches(heavy, state({armor: null})), false);
  assert.equal(autoMatches(heavy, state()), false);
  const plan = planAuto([none, heavy], state({armor: plate}), {manual: null, current: "x", autoId: null});
  assert.equal(plan.wear, "Plate");
  assert.ok(ARMOR_TYPES.includes("shield"));
});
