/**
 * Pure helpers of the conversation stage and of the outfits by place: the stored stage, its layout and metrics, and
 * the rules for putting an outfit on when a token enters a place and taking it off when it leaves. Nothing here
 * touches Foundry globals, so the helpers also run in Node tests.
 */

import {findOutfit, normalizeExpression, usableOutfits} from "./outfits.mjs";

/**
 * @typedef StageSlot
 * @property {string} id                 Id of the portrait on the stage
 * @property {string} actorId            The world actor
 * @property {string} tokenUuid          The unlinked token it was made from ("" for characters)
 * @property {string} name               The name players see (the disguise when there is one)
 * @property {string} img                Image or video shown
 * @property {string|null} outfitId      The outfit shown
 * @property {string} expression         Mood tag of that outfit
 * @property {("left"|"right"|null)} side   Fixed side, null = chosen by the layout
 */

/**
 * @typedef StageState
 * @property {boolean} active            Is the stage on the screens?
 * @property {("soft"|"dark"|"none")} backdrop
 * @property {string|null} speaker       The id of the speaking portrait
 * @property {StageSlot[]} slots
 */

/** The looks of the backdrop behind the portraits. */
export const BACKDROPS = ["soft", "dark", "none"];

/** The most portraits on one stage. */
export const MAX_SLOTS = 6;

/** A stage with nobody on it. */
export function emptyStage(backdrop = "soft") {
  return {active: false, backdrop: BACKDROPS.includes(backdrop) ? backdrop : "soft", speaker: null, slots: []};
}

/**
 * Bring a stored stage into a known shape.
 * @param {object} [data]
 * @param {() => string} makeId
 * @returns {StageState}
 */
export function normalizeStage(data, makeId) {
  const raw = Array.isArray(data?.slots) ? data.slots : Object.values(data?.slots ?? {});
  const text = value => ((typeof value === "string") ? value : "");
  const seen = new Set();
  const slots = [];
  for ( const entry of raw ) {
    if ( !entry || (typeof entry !== "object") || !text(entry.img) ) continue;
    let id = text(entry.id);
    if ( !id || seen.has(id) ) id = makeId();
    seen.add(id);
    slots.push({
      id,
      actorId: text(entry.actorId),
      tokenUuid: text(entry.tokenUuid),
      name: text(entry.name),
      img: text(entry.img),
      outfitId: text(entry.outfitId) || null,
      expression: normalizeExpression(entry.expression),
      side: ["left", "right"].includes(entry.side) ? entry.side : null
    });
    if ( slots.length >= MAX_SLOTS ) break;
  }
  const speaker = slots.some(s => s.id === data?.speaker) ? data.speaker : null;
  return {active: !!data?.active && slots.length > 0, backdrop: BACKDROPS.includes(data?.backdrop) ? data.backdrop : "soft",
    speaker, slots};
}

/* -------------------------------------------- */
/*  Changing a stage                            */
/* -------------------------------------------- */

/**
 * Is this slot the one for an actor (and an unlinked token)?
 * @param {StageSlot} slot
 * @param {string} actorId
 * @param {string} [tokenUuid]
 * @returns {boolean}
 */
export function sameSubject(slot, actorId, tokenUuid = "") {
  return (slot.actorId === actorId) && ((slot.tokenUuid || "") === (tokenUuid || ""));
}

/**
 * Put a portrait on the stage, or update the one which is already there.
 * @param {StageState} state
 * @param {StageSlot} slot
 * @returns {StageState}
 */
export function withSlot(state, slot) {
  const slots = state.slots.slice();
  const index = slots.findIndex(s => sameSubject(s, slot.actorId, slot.tokenUuid));
  if ( index >= 0 ) slots[index] = {...slots[index], ...slot, id: slots[index].id, side: slot.side ?? slots[index].side};
  else if ( slots.length < MAX_SLOTS ) slots.push(slot);
  return {...state, active: slots.length > 0, slots};
}

/**
 * Take a portrait off the stage. The stage closes with the last portrait.
 * @param {StageState} state
 * @param {string} id
 * @returns {StageState}
 */
export function withoutSlot(state, id) {
  const slots = state.slots.filter(s => s.id !== id);
  return {...state, active: slots.length > 0 && state.active, speaker: (state.speaker === id) ? null : state.speaker, slots};
}

/**
 * Change one portrait.
 * @param {StageState} state
 * @param {string} id
 * @param {Partial<StageSlot>} changes
 * @returns {StageState}
 */
export function changeSlot(state, id, changes) {
  return {...state, slots: state.slots.map(s => ((s.id === id) ? {...s, ...changes, id} : s))};
}

/**
 * Mark who is speaking. Marking the speaker again takes the mark off.
 * @param {StageState} state
 * @param {string|null} id
 * @param {boolean} [toggle=false]
 * @returns {StageState}
 */
export function withSpeaker(state, id, toggle = false) {
  if ( id && !state.slots.some(s => s.id === id) ) return state;
  const speaker = (toggle && (state.speaker === id)) ? null : (id ?? null);
  return {...state, speaker};
}

/* -------------------------------------------- */
/*  Expressions                                 */
/* -------------------------------------------- */

/**
 * Find the outfit a call asks for: by id, name or position, else by mood tag (the first outfit with it).
 * @param {import("./outfits.mjs").Outfit[]} outfits
 * @param {string|number|null} ref
 * @returns {import("./outfits.mjs").Outfit|null}
 */
export function resolveExpression(outfits, ref) {
  const found = findOutfit(outfits, ref);
  if ( found ) return found;
  const tag = normalizeExpression(ref);
  return tag ? (usableOutfits(outfits).find(o => o.expression === tag) ?? null) : null;
}

/**
 * The outfit a stage shows when a character joins: the one asked for, else the one it wears, else the first.
 * @param {import("./outfits.mjs").Outfit[]} outfits
 * @param {string|number|null} ref
 * @param {string|null} wornId
 * @returns {import("./outfits.mjs").Outfit|null}
 */
export function startOutfit(outfits, ref, wornId) {
  const usable = usableOutfits(outfits);
  return resolveExpression(outfits, ref) ?? usable.find(o => o.id === wornId) ?? usable[0] ?? null;
}

/* -------------------------------------------- */
/*  Layout                                      */
/* -------------------------------------------- */

/**
 * Where each portrait stands: its side and its place counted from the edge of the screen (0 = outermost). Portraits
 * without a fixed side take the side with fewer portraits, the left one first.
 * @param {Pick<StageSlot, "id"|"side">[]} slots
 * @returns {{id: string, side: ("left"|"right"), pos: number}[]}
 */
export function layoutStage(slots) {
  const count = {left: 0, right: 0};
  for ( const slot of slots ) if ( slot.side ) count[slot.side]++;
  const sides = new Map();
  for ( const slot of slots ) {
    if ( slot.side ) continue;
    const side = (count.left <= count.right) ? "left" : "right";
    count[side]++;
    sides.set(slot.id, side);
  }
  const next = {left: 0, right: 0};
  return slots.map(slot => {
    const side = slot.side ?? sides.get(slot.id);
    return {id: slot.id, side, pos: next[side]++};
  });
}

/**
 * The sizes of the stage for a screen: height and width of a portrait, the distance to the edge, the step between
 * portraits on the same side.
 * @param {object} options
 * @param {number} options.width             Width of the stage area in pixels
 * @param {number} options.height            Height of the stage area
 * @param {number} options.left              Portraits on the left
 * @param {number} options.right             Portraits on the right
 * @param {number} [options.scale=1]         The user's size factor
 * @returns {{h: number, w: number, edge: number, step: number}}
 */
export function stageMetrics({width, height, left, right, scale = 1}) {
  const edge = Math.max(8, Math.round(width * 0.012));
  const half = width / 2;
  const most = Math.max(left, right, 1);
  let h = Math.min(Math.max(height * 0.74 * scale, 200), 1100);
  // Several portraits on one side overlap, but never reach past the middle of the screen
  const room = Math.max(80, (half - edge - 8) / (1 + 0.22 * (most - 1)));
  let w = Math.min(h * 0.72, room);
  if ( w < h * 0.72 ) h = Math.max(120, w / 0.72);
  let step = 0;
  if ( most > 1 ) {
    const free = (half - edge - w) / (most - 1);
    step = Math.min(w * 0.62, Math.max(w * 0.22, free));
  }
  return {h: Math.round(h), w: Math.round(w), edge, step: Math.round(step)};
}

/* -------------------------------------------- */
/*  Outfits by place                            */
/* -------------------------------------------- */

/**
 * What happens when a token enters a place which asks for an outfit.
 * @param {object} options
 * @param {string|null} options.current      The outfit the token has on
 * @param {string|null} options.wanted       The id of the outfit the place asks for (null = the token has none)
 * @param {boolean} options.restore          Does the place take the outfit off again on leaving?
 * @param {boolean} options.stored           Is a previous outfit already remembered for this place?
 * @returns {{wear: (string|null), remember: boolean, previous: string}}
 */
export function planEnter({current, wanted, restore, stored}) {
  if ( !wanted ) return {wear: null, remember: false, previous: ""};
  const remember = restore && !stored && (current !== wanted);
  return {wear: (current === wanted) ? null : wanted, remember, previous: current ?? ""};
}

/**
 * What happens when a token leaves a place.
 * @param {object} options
 * @param {string|undefined} options.stored   The remembered previous outfit ("" = it had none), undefined = nothing
 * @param {string|null} options.current       The outfit the token has on
 * @param {string|null} options.known         The previous outfit when it still exists in the wardrobe, else null
 * @returns {{wear: (string|null), forget: boolean}}
 */
export function planLeave({stored, current, known}) {
  if ( stored === undefined ) return {wear: null, forget: false};
  return {wear: (known && (known !== current)) ? known : null, forget: true};
}

/**
 * The outfit name a scene asks for: the stored text, trimmed.
 * @param {*} value
 * @returns {string}
 */
export function sceneOutfitName(value) {
  return (typeof value === "string") ? value.trim() : "";
}
