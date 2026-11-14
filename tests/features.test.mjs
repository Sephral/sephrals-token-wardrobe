import assert from "node:assert/strict";
import test from "node:test";
import {TINTS, backdropsFromFiles, cycleBackdrop, findBackdrop, normalizeBackdrops, withBackdrop} from "../scripts/backdrop-logic.mjs";
import {FEELINGS, FEELING_KEYS, feelingDuration, feelingKey, outfitForFeeling, parseFeelingMessage, planFeeling} from "../scripts/feelings-logic.mjs";
import {armorKind, equippedValue, gearKeys, gearMatches, gearNames, isEquippedItem, namesFromText, normalizeGear} from "../scripts/gear-logic.mjs";
import {autoMatches, hasAuto, normalizeAuto, normalizeOutfit, planAuto} from "../scripts/outfits.mjs";
import {DEPTH_SCALES, emptyStage, layoutStage, normalizeDepth, normalizeStage, withoutSlot} from "../scripts/stage-logic.mjs";
import {normalizeVariety, pickVariant, varietyPool} from "../scripts/variety-logic.mjs";

let counter = 0;
const makeId = () => `id${++counter}`;
const outfit = (label, extra = {}) => normalizeOutfit({id: label, label, portrait: `${label}.webp`, ...extra}, makeId);

/* ---- every figure looks different ---- */

test("the variety setting is normalized and picks its pool by mode", () => {
  assert.deepEqual(normalizeVariety(undefined), {mode: "off", mirror: false});
  assert.deepEqual(normalizeVariety({mode: "all", mirror: 1}), {mode: "all", mirror: true});
  assert.equal(normalizeVariety({mode: "sideways"}).mode, "off");
  const list = [outfit("A", {variety: true}), outfit("B"), normalizeOutfit({id: "C", label: "C"}, makeId), outfit("D", {variety: true})];
  assert.deepEqual(varietyPool(list, normalizeVariety({mode: "off"})), []);
  assert.deepEqual(varietyPool(list, normalizeVariety({mode: "marked"})).map(o => o.id), ["A", "D"]);
  // An outfit without an image cannot be worn, so it is never picked
  assert.deepEqual(varietyPool(list, normalizeVariety({mode: "all"})).map(o => o.id), ["A", "B", "D"]);
});

test("five tokens placed one after the other show every look before one repeats", () => {
  const pool = ["A", "B", "C"].map(l => outfit(l));
  const used = new Map();
  const seen = [];
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for ( let i = 0; i < 6; i++ ) {
    const pick = pickVariant({pool, used, config: normalizeVariety({mode: "all"}), random});
    used.set(pick.outfit.id, (used.get(pick.outfit.id) ?? 0) + 1);
    seen.push(pick.outfit.id);
  }
  assert.equal(new Set(seen.slice(0, 3)).size, 3);
  assert.equal(new Set(seen.slice(3, 6)).size, 3);
});

test("a new roll leaves out the look the token has, mirror is random only when asked", () => {
  const pool = [outfit("A"), outfit("B")];
  for ( const roll of [0, 0.4, 0.99] ) {
    assert.equal(pickVariant({pool, current: "A", config: normalizeVariety({mode: "all"}), random: () => roll}).outfit.id, "B");
  }
  // With one look only, it stays the one
  assert.equal(pickVariant({pool: [outfit("A")], current: "A", config: normalizeVariety({mode: "all"})}).outfit.id, "A");
  assert.equal(pickVariant({pool: [], config: normalizeVariety({mode: "all"})}), null);
  assert.equal(pickVariant({pool, config: normalizeVariety({mode: "all", mirror: false}), random: () => 0.1}).flip, false);
  assert.equal(pickVariant({pool, config: normalizeVariety({mode: "all", mirror: true}), random: () => 0.1}).flip, true);
  assert.equal(pickVariant({pool, config: normalizeVariety({mode: "all", mirror: true}), random: () => 0.9}).flip, false);
  // Counts can come as a plain object as well
  assert.equal(pickVariant({pool, used: {A: 2, B: 1}, config: normalizeVariety({mode: "all"}), random: () => 0}).outfit.id, "B");
});

/* ---- equipment as trigger ---- */

test("equipped is read per game system", () => {
  assert.equal(isEquippedItem({system: {equipped: true}}, "dnd5e"), true);
  assert.equal(isEquippedItem({system: {equipped: false}}, "dnd5e"), false);
  assert.equal(isEquippedItem({system: {equipped: true}}, "crucible"), true);
  assert.equal(isEquippedItem({system: {equipStatus: 0}}, "swade"), false);
  assert.equal(isEquippedItem({system: {equipStatus: 1}}, "swade"), false);
  assert.equal(isEquippedItem({system: {equipStatus: 2}}, "swade"), true);
  assert.equal(isEquippedItem({system: {equipStatus: 4}}, "swade"), true);
  assert.equal(isEquippedItem({system: {equipped: {carryType: "worn", inSlot: true}}}, "pf2e"), true);
  assert.equal(isEquippedItem({system: {equipped: {carryType: "worn", inSlot: false}}}, "pf2e"), false);
  assert.equal(isEquippedItem({system: {equipped: {carryType: "held", handsHeld: 1}}}, "pf2e"), true);
  assert.equal(isEquippedItem({system: {equipped: {carryType: "stowed"}}}, "pf2e"), false);
  assert.equal(isEquippedItem({system: {equipped: {carryType: "dropped"}}}, "pf2e"), false);
  // A live PF2e item answers for itself
  assert.equal(isEquippedItem({isEquipped: true, system: {}}, "pf2e"), true);
});

test("an unknown system is read through the common data paths", () => {
  assert.equal(isEquippedItem({system: {equipped: true}}, "other"), true);
  assert.equal(isEquippedItem({system: {isEquipped: false}}, "other"), false);
  assert.equal(isEquippedItem({system: {equipStatus: 3}}, "other"), true);
  assert.equal(isEquippedItem({system: {worn: true}}, "other"), true);
  assert.equal(isEquippedItem({system: {equipment: {equipped: true}}}, "other"), true);
  assert.equal(isEquippedItem({system: {equipped: "worn"}}, "other"), true);
  assert.equal(isEquippedItem({system: {equipped: "stowed"}}, "other"), false);
  assert.equal(isEquippedItem({system: {equipped: {carryType: "held"}}}, ""), true);
  assert.equal(isEquippedItem({system: {weight: 3}}, "other"), false);
  assert.equal(isEquippedItem({}, "other"), false);
  assert.equal(isEquippedItem(null, "other"), false);
  assert.equal(equippedValue(NaN), null);
  assert.equal(equippedValue("maybe"), null);
});

test("armor kinds for dnd5e and PF2e", () => {
  assert.equal(armorKind({type: "equipment", system: {type: {value: "heavy"}}}, "dnd5e"), "heavy");
  assert.equal(armorKind({type: "equipment", system: {type: {value: "trinket"}}}, "dnd5e"), null);
  assert.equal(armorKind({type: "weapon", system: {type: {value: "heavy"}}}, "dnd5e"), null);
  assert.equal(armorKind({type: "armor", system: {category: "medium"}}, "pf2e"), "medium");
  assert.equal(armorKind({type: "armor", system: {category: "unarmored"}}, "pf2e"), null);
  assert.equal(armorKind({type: "shield", system: {}}, "pf2e"), "shield");
  assert.equal(armorKind({type: "armor", system: {category: "heavy"}}, "swade"), null);
});

test("links between items and outfits match by name or by source", () => {
  const links = normalizeGear([{name: "Plate Armor", uuid: "Compendium.dnd5e.items.Item.abc"}, " Cloak ", {name: "plate armor"}, {name: ""}, null]);
  assert.deepEqual(links, [{name: "Plate Armor", uuid: "Compendium.dnd5e.items.Item.abc"}, {name: "Cloak", uuid: ""}]);
  const keys = gearKeys([
    {name: "Breastplate of Bob", equipped: true, uuids: ["Actor.1.Item.9", "Compendium.dnd5e.items.Item.abc"]},
    {name: "Cloak", equipped: false},
    {name: "Ring", equipped: true}
  ]);
  assert.equal(gearMatches(links, keys), true);
  assert.equal(gearMatches([{name: "cloak", uuid: ""}], keys), false);
  assert.equal(gearMatches([{name: "  RING ", uuid: ""}], keys), true);
  assert.equal(gearMatches([], keys), false);
  assert.equal(gearMatches(links, null), false);
  assert.equal(gearNames(links), "Plate Armor, Cloak");
  assert.deepEqual(namesFromText("Sword, Shield\n Helmet ,,"), ["Sword", "Shield", "Helmet"]);
});

test("an outfit with gear is automatic and goes on with the equipped item", () => {
  const knight = outfit("Knight", {auto: {gear: [{name: "Plate Armor"}]}});
  const street = outfit("Street");
  assert.equal(hasAuto(knight), true);
  assert.deepEqual(normalizeAuto({gear: ["Sword", {name: "Sword"}]}).gear, [{name: "Sword", uuid: ""}]);
  const worn = gearKeys([{name: "plate armor", equipped: true}]);
  const bare = gearKeys([{name: "plate armor", equipped: false}]);
  assert.equal(autoMatches(knight, {inCombat: false, hpPercent: 100, statuses: [], gear: worn}), true);
  assert.equal(autoMatches(knight, {inCombat: false, hpPercent: 100, statuses: [], gear: bare}), false);
  assert.equal(autoMatches(knight, {inCombat: false, hpPercent: 100, statuses: []}), false);
  // Equipping puts the outfit on, unequipping brings the chosen look back
  const outfits = [street, knight];
  let plan = planAuto(outfits, {inCombat: false, hpPercent: 100, statuses: [], gear: worn}, {manual: null, current: "Street", autoId: null});
  assert.deepEqual(plan, {change: true, wear: "Knight", autoId: "Knight", manual: "Street"});
  plan = planAuto(outfits, {inCombat: false, hpPercent: 100, statuses: [], gear: bare}, {manual: "Street", current: "Knight", autoId: "Knight"});
  assert.deepEqual(plan, {change: true, wear: "Street", autoId: null, manual: "Street"});
});

/* ---- feelings ---- */

test("feelings have a symbol, a mood and are found by name or number", () => {
  assert.deepEqual(FEELING_KEYS, ["happy", "angry", "worried", "sad", "surprised", "thoughtful"]);
  for ( const key of FEELING_KEYS ) assert.ok(FEELINGS[key].symbol.length > 0 && FEELINGS[key].moods.length > 0);
  assert.equal(feelingKey("Sad"), "sad");
  assert.equal(feelingKey(3), "worried");
  assert.equal(feelingKey("3"), "worried");
  assert.equal(feelingKey(7), null);
  assert.equal(feelingKey("furious"), null);
  assert.equal(feelingKey(""), null);
  assert.equal(feelingKey(null), null);
});

test("the outfit for a feeling comes from the moods in order", () => {
  const list = [outfit("Calm", {expression: "neutral"}), outfit("Grin", {expression: "friendly"}), outfit("Joy", {expression: "happy"}),
    outfit("Fear", {expression: "afraid"}), outfit("Plain"), normalizeOutfit({id: "x", label: "x", expression: "angry"}, makeId)];
  assert.equal(outfitForFeeling(list, "happy").id, "Joy");
  assert.equal(outfitForFeeling(list.filter(o => o.id !== "Joy"), "happy").id, "Grin");
  assert.equal(outfitForFeeling(list, "worried").id, "Fear");
  assert.equal(outfitForFeeling(list, "thoughtful").id, "Calm");
  // The angry outfit has no image, so it cannot be worn
  assert.equal(outfitForFeeling(list, "angry"), null);
  assert.equal(outfitForFeeling(list, "sad"), null);
  assert.equal(outfitForFeeling(list, "nonsense"), null);
});

test("a feeling remembers the look to come back to only once", () => {
  assert.deepEqual(planFeeling({current: "a", back: null, wanted: "m"}), {wear: "m", back: "a"});
  assert.deepEqual(planFeeling({current: "m", back: "a", wanted: "n"}), {wear: "n", back: "a"});
  assert.deepEqual(planFeeling({current: "m", back: "a", wanted: "m"}), {wear: null, back: "a"});
  assert.deepEqual(planFeeling({current: "a", back: null, wanted: null}), {wear: null, back: null});
  assert.deepEqual(planFeeling({current: null, back: null, wanted: "m"}), {wear: "m", back: null});
});

test("durations and messages of feelings are cleaned", () => {
  assert.equal(feelingDuration(0), null);
  assert.equal(feelingDuration("x"), null);
  assert.equal(feelingDuration(30), 30000);
  assert.equal(feelingDuration(100000), 600000);
  assert.deepEqual(parseFeelingMessage({type: "feel", actorId: "a", tokenUuid: "T", feeling: "happy", seconds: 12}),
    {actorId: "a", tokenUuid: "T", feeling: "happy", seconds: 12});
  assert.deepEqual(parseFeelingMessage({type: "feel", actorId: "a", feeling: null}), {actorId: "a", tokenUuid: "", feeling: null, seconds: 0});
  assert.equal(parseFeelingMessage({type: "feel", actorId: "a", feeling: "furious"}), null);
  assert.equal(parseFeelingMessage({type: "sync", actorId: "a", feeling: "happy"}), null);
  assert.equal(parseFeelingMessage({type: "feel", feeling: "happy"}), null);
  assert.equal(parseFeelingMessage(null), null);
  assert.equal(parseFeelingMessage({type: "feel", actorId: "a", feeling: "sad", seconds: 9999}).seconds, 600);
});

/* ---- backdrops ---- */

test("the library of backdrops keeps entries with a picture and unique ids", () => {
  const list = normalizeBackdrops([
    {id: "a", img: "worlds/x/tavern-night.webp", tint: "night", pan: 1},
    {id: "a", img: "forest.webp", tint: "purple"},
    {id: "c"},
    {name: "Throne", img: "throne.webp", sound: " amb.ogg ", playlist: "Playlist.1"}
  ], makeId);
  assert.equal(list.length, 3);
  assert.equal(list[0].name, "Tavern night");
  assert.equal(list[0].tint, "night");
  assert.equal(list[0].pan, true);
  assert.notEqual(list[1].id, "a");
  assert.equal(list[1].tint, "none");
  assert.equal(list[2].sound, "amb.ogg");
  assert.equal(normalizeBackdrops({items: [{img: "a.webp"}]}, makeId).length, 1);
  assert.deepEqual(normalizeBackdrops(undefined, makeId), []);
  assert.deepEqual(TINTS, ["none", "dawn", "dusk", "night"]);
});

test("backdrops are found by id, name or position and cycle around", () => {
  const list = normalizeBackdrops([{id: "a", name: "Tavern", img: "a.webp"}, {id: "b", name: "Throne room", img: "b.webp"}, {id: "c", name: "Road", img: "c.webp"}], makeId);
  assert.equal(findBackdrop(list, "b").name, "Throne room");
  assert.equal(findBackdrop(list, "ROAD").id, "c");
  assert.equal(findBackdrop(list, 1).id, "a");
  assert.equal(findBackdrop(list, 9), null);
  assert.equal(findBackdrop(list, ""), null);
  assert.equal(cycleBackdrop(list, null, 1).id, "a");
  assert.equal(cycleBackdrop(list, null, -1).id, "c");
  assert.equal(cycleBackdrop(list, "c", 1).id, "a");
  assert.equal(cycleBackdrop(list, "a", -1).id, "c");
  assert.equal(cycleBackdrop([], "a", 1), null);
});

test("new backdrops come from files and skip the known ones", () => {
  const existing = normalizeBackdrops([{img: "worlds/x/a.webp"}], makeId);
  const added = backdropsFromFiles(["worlds/x/a.webp?1", "worlds/x/b.webp", "worlds/x/b.webp", ""], existing, makeId);
  assert.equal(added.length, 1);
  assert.equal(added[0].name, "B");
});

test("showing a backdrop takes its time of day and panning, showing it again keeps the choice", () => {
  const list = normalizeBackdrops([{id: "a", img: "a.webp", tint: "dusk", pan: true}, {id: "b", img: "b.webp"}], makeId);
  const start = {backdropId: null, tint: "none", pan: false};
  const first = withBackdrop(start, list[0]);
  assert.deepEqual(first, {backdropId: "a", tint: "dusk", pan: true});
  assert.deepEqual(withBackdrop({...first, tint: "night", pan: false}, list[0]), {backdropId: "a", tint: "night", pan: false});
  assert.deepEqual(withBackdrop(first, list[1]), {backdropId: "b", tint: "none", pan: false});
  assert.deepEqual(withBackdrop(first, null), {backdropId: null, tint: "none", pan: false});
});

test("the stage keeps its backdrop, a backdrop alone keeps it open, places and depth are checked", () => {
  const state = normalizeStage({active: true, backdropId: "a", tint: "night", pan: 1, slots: []}, makeId);
  assert.equal(state.active, true);
  assert.equal(state.backdropId, "a");
  assert.equal(state.tint, "night");
  assert.equal(state.pan, true);
  assert.equal(normalizeStage({active: true, slots: []}, makeId).active, false);
  assert.equal(normalizeStage({backdropId: "a", tint: "purple"}, makeId).tint, "none");
  assert.deepEqual(emptyStage(), {active: false, backdrop: "soft", backdropId: null, tint: "none", pan: false, speaker: null, slots: []});
  const slots = [
    {id: "a", actorId: "a", img: "a.webp", side: "center", depth: 2}, {id: "b", actorId: "b", img: "b.webp", side: "middle", depth: 7},
    {id: "c", actorId: "c", img: "c.webp", depth: "1"}
  ];
  const stage = normalizeStage({active: true, slots}, makeId);
  assert.deepEqual(stage.slots.map(s => s.side), ["center", null, null]);
  assert.deepEqual(stage.slots.map(s => s.depth), [2, 0, 1]);
  assert.equal(normalizeDepth(-1), 0);
  assert.equal(normalizeDepth(3), 0);
  assert.ok(DEPTH_SCALES[0] > DEPTH_SCALES[1] && DEPTH_SCALES[1] > DEPTH_SCALES[2]);
  // Taking the last portrait away closes a stage without a backdrop, with one it stays open
  const one = normalizeStage({active: true, slots: [slots[0]]}, makeId);
  assert.equal(withoutSlot(one, "a").active, false);
  const withPicture = normalizeStage({active: true, backdropId: "x", slots: [slots[0]]}, makeId);
  assert.equal(withoutSlot(withPicture, "a").active, true);
});

test("portraits in the center stand around the middle", () => {
  const layout = layoutStage([{id: "a", side: "center"}, {id: "b", side: "center"}, {id: "c", side: null}, {id: "d", side: "center"}, {id: "e", side: null}]);
  assert.deepEqual(layout.map(l => `${l.side}${l.pos}/${l.of}`), ["center0/3", "center1/3", "left0/1", "center2/3", "right0/1"]);
});
