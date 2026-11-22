/**
 * The made-up data of the sample windows (api.samples): characters with outfits, a stage with portraits and a few
 * backdrops. Pure functions, nothing here touches Foundry, so the tests run in Node. The pictures come from Foundry's
 * own icons folder.
 */

import {sampleCast, sampleText} from "./samples.mjs";
import {normalizeBackdrops} from "./backdrop-logic.mjs";
import {normalizeOutfits} from "./outfits.mjs";
import {normalizeStage} from "./stage-logic.mjs";

const PEOPLE = "icons/environment/people";
const PLACES = "icons/environment/settlement";

/** The pictures of the samples. */
export const SAMPLE_IMAGES = {
  commoner: `${PEOPLE}/commoner.webp`,
  armored: `${PEOPLE}/infantry-armored.webp`,
  infantry: `${PEOPLE}/infantry.webp`,
  cleric: `${PEOPLE}/cleric-orange.webp`,
  clericGrey: `${PEOPLE}/cleric-grey.webp`,
  archer: `${PEOPLE}/archer.webp`,
  spear: `${PEOPLE}/spearfighter.webp`,
  cavalry: `${PEOPLE}/cavalry.webp`,
  church: `${PLACES}/church.webp`,
  gate: `${PLACES}/city-gate.webp`,
  cave: "icons/environment/wilderness/cave-entrance.webp"
};

/** An id that stays the same in every sample, so a window keeps its selection when it is drawn again. */
const id = name => `stw-sample-${name}`;

/**
 * The outfits of the sample characters. `text(key)` gives a text of the module (names of outfits and disguises).
 * @param {(key: string) => string} text
 * @returns {Record<string, {outfits: object[], current: string|null, variety?: object}>}
 */
export function sampleOutfitSets(text) {
  const I = SAMPLE_IMAGES;
  const set = (outfits, current, variety) => ({outfits: normalizeOutfits(outfits, () => "x"), current, variety});
  return {
    ari: set([
      {id: id("ari-street"), label: text("STW.Quick.street"), portrait: I.commoner, token: I.commoner, variety: true},
      {id: id("ari-battle"), label: text("STW.Quick.battle"), portrait: I.armored, token: I.armored, scale: 1.1,
        auto: {combat: true, armor: ["heavy"], gear: [{name: sampleText("longsword"), uuid: ""}]}},
      {id: id("ari-fine"), label: text("STW.Quick.fine"), portrait: I.clericGrey, token: I.clericGrey, mirror: true, variety: true,
        expression: "friendly"},
      {id: id("ari-wounded"), label: text("STW.Sample.outfit.wounded"), portrait: I.infantry, token: I.infantry, expression: "hurt",
        auto: {combat: true, hp: 25, status: ["prone"], armor: ["light"], gear: [{name: sampleText("shortbow"), uuid: ""}]}},
      {id: id("ari-merchant"), label: text("STW.Sample.outfit.merchant"), portrait: I.cavalry, token: I.cavalry,
        disguise: text("STW.Sample.disguise.merchant"), expression: "mocking"}
    ], id("ari-merchant"), {mode: "marked", mirror: true}),
    tovin: set([
      {id: id("tovin-priest"), label: text("STW.Sample.outfit.priest"), portrait: I.clericGrey, token: I.clericGrey, expression: "neutral"},
      {id: id("tovin-traveler"), label: text("STW.Sample.outfit.traveler"), portrait: I.commoner, token: I.commoner, expression: "happy"},
      {id: id("tovin-hooded"), label: text("STW.Sample.outfit.hooded"), portrait: I.cleric, token: I.cleric, expression: "worried",
        disguise: text("STW.Sample.disguise.stranger")}
    ], id("tovin-priest")),
    sela: set([
      {id: id("sela-ranger"), label: text("STW.Quick.street"), portrait: I.archer, token: I.archer},
      {id: id("sela-fine"), label: text("STW.Quick.fine"), portrait: I.clericGrey, token: I.clericGrey, expression: "surprised"}
    ], id("sela-ranger")),
    bandit1: set([
      {id: id("bandit-a"), label: `${text("STW.Sample.outfit.guard")} 1`, portrait: I.spear, token: I.spear, variety: true},
      {id: id("bandit-b"), label: `${text("STW.Sample.outfit.guard")} 2`, portrait: I.commoner, token: I.commoner, variety: true, mirror: true},
      {id: id("bandit-c"), label: `${text("STW.Sample.outfit.guard")} 3`, portrait: I.infantry, token: I.infantry, variety: true}
    ], null, {mode: "marked", mirror: false}),
    mira: set([], null),
    wolf: set([], null)
  };
}

/**
 * The characters of the samples: the shared cast with what each of them has in the wardrobe.
 * @param {(key: string) => string} text
 * @returns {{id: string, key: string, name: string, img: string, outfits: object[], current: string|null, variety: object|null}[]}
 */
export function sampleCharacters(text) {
  const sets = sampleOutfitSets(text);
  return sampleCast().filter(member => member.id in sets).map(member => {
    const set = sets[member.id];
    return {id: id(`actor-${member.id}`), key: member.id, name: member.name, img: member.img, outfits: set.outfits,
      current: set.current, variety: set.variety ?? null};
  });
}

/**
 * The backdrop library of the stage samples: one with ambient sound, one with a time of day and panning.
 * @param {(key: string) => string} text
 * @returns {object[]}
 */
export function sampleBackdropList(text) {
  return normalizeBackdrops([
    {id: id("back-church"), name: text("STW.Sample.backdrop.church"), img: SAMPLE_IMAGES.church, sound: "sounds/ambience/church.ogg", tint: "dusk", pan: true},
    {id: id("back-gate"), name: text("STW.Sample.backdrop.gate"), img: SAMPLE_IMAGES.gate},
    {id: id("back-cave"), name: text("STW.Sample.backdrop.cave"), img: SAMPLE_IMAGES.cave, tint: "night"}
  ], () => "x");
}

/**
 * The stage of the samples: three portraits, one behind a disguise, one without outfits, a speaker, a backdrop in the
 * evening light.
 * @param {ReturnType<typeof sampleCharacters>} characters
 * @param {(key: string) => string} text
 * @returns {import("./stage-logic.mjs").StageState}
 */
export function sampleStageState(characters, text) {
  const byKey = new Map(characters.map(c => [c.key, c]));
  const slot = (key, outfitId, side, depth = 0) => {
    const who = byKey.get(key);
    const outfit = who.outfits.find(o => o.id === outfitId) ?? null;
    return {id: id(`slot-${key}`), actorId: who.id, tokenUuid: "", name: outfit?.disguise || who.name,
      img: outfit ? (outfit.portrait || outfit.token) : who.img, outfitId: outfit?.id ?? null, expression: outfit?.expression ?? "",
      side, depth};
  };
  return normalizeStage({
    active: true,
    backdrop: "soft",
    backdropId: id("back-church"),
    tint: "dusk",
    pan: true,
    speaker: id("slot-tovin"),
    slots: [
      slot("ari", id("ari-battle"), "left"),
      slot("tovin", id("tovin-hooded"), "center", 1),
      slot("mira", null, "right", 2)
    ]
  }, () => "x");
}

export const __test__ = {id};
