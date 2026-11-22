import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {i18n: {lang: "en"}};
const {SAMPLE_IMAGES, sampleBackdropList, sampleCharacters, sampleOutfitSets, sampleStageState} = await import("../scripts/sample-data.mjs");
const {hasAuto, usableOutfits} = await import("../scripts/outfits.mjs");

const text = key => key.split(".").pop();

test("the sample wardrobes cover every kind of outfit the window shows", () => {
  const sets = sampleOutfitSets(text);
  const ari = sets.ari.outfits;
  assert.ok(ari.length >= 5);
  assert.ok(ari.some(o => o.auto.combat) && ari.some(o => o.auto.hp !== null) && ari.some(o => o.auto.gear.length) && ari.some(o => o.auto.armor.length));
  assert.ok(ari.some(o => o.disguise) && ari.some(o => o.mirror) && ari.some(o => o.scale) && ari.some(o => o.variety));
  assert.ok(ari.some(o => o.expression) && ari.some(hasAuto));
  assert.ok(ari.every(o => o.portrait && o.token && o.id && o.label));
  assert.ok(ari.some(o => o.id === sets.ari.current), "the worn outfit exists");
  assert.equal(sets.mira.outfits.length, 0, "one wardrobe stays empty");
  assert.ok(sets.bandit1.outfits.every(o => o.variety));
});

test("pictures come from Foundry's icons folder", () => {
  for ( const src of Object.values(SAMPLE_IMAGES) ) assert.match(src, /^icons\/.+\.webp$/);
  const used = Object.values(sampleOutfitSets(text)).flatMap(set => set.outfits.flatMap(o => [o.portrait, o.token]));
  for ( const src of used ) assert.ok(Object.values(SAMPLE_IMAGES).includes(src), src);
});

test("the stage has a disguised portrait, one without outfits, a speaker and a backdrop with light and panning", () => {
  const characters = sampleCharacters(text).map(c => ({...c, id: `actor-${c.key}`}));
  const state = sampleStageState(characters, text);
  assert.equal(state.slots.length, 3);
  assert.ok(state.active && state.speaker && state.backdropId && state.pan && (state.tint !== "none"));
  const tovin = state.slots.find(s => s.actorId === "actor-tovin");
  assert.equal(tovin.name, "stranger", "the plate shows the disguise");
  const mira = state.slots.find(s => s.actorId === "actor-mira");
  assert.equal(usableOutfits(characters.find(c => c.key === "mira").outfits).length, 0);
  assert.equal(mira.outfitId, null);
  assert.deepEqual([...new Set(state.slots.map(s => s.depth))].sort(), [0, 1, 2]);
  assert.ok(state.backdropId && sampleBackdropList(text).some(b => b.id === state.backdropId));
});

test("the backdrop library has one with sound and every picture is set", () => {
  const list = sampleBackdropList(text);
  assert.equal(list.length, 3);
  assert.ok(list.some(b => b.sound));
  assert.ok(list.every(b => b.img && b.name));
});

test("ids stay the same between calls", () => {
  assert.deepEqual(sampleOutfitSets(text).ari.outfits.map(o => o.id), sampleOutfitSets(text).ari.outfits.map(o => o.id));
});
