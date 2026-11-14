/**
 * "Every figure looks different": unlinked tokens of a character get a random outfit (and, if wanted, a random
 * mirror) when they are placed, so five bandits do not look alike. The look is written into the new token before it
 * is created (hook "preCreateToken" on the client which creates it), so there is no second update. A token HUD action
 * rolls a new look.
 */

import {MODULE_ID, t} from "./config.mjs";
import {trace} from "./debug.mjs";
import {normalizeVariety, pickVariant, varietyPool} from "./variety-logic.mjs";
import {baseOf, canWear, currentOutfitId, getOutfits} from "./store.mjs";
import {countFeature} from "./usage.mjs";
import {lookData, wear} from "./wear.mjs";

/** Looks given in the last moments to tokens which are not in the scene yet, by scene and character. */
const pending = new Map();

/** How long a given look is remembered for tokens which are placed in the same batch, in milliseconds. */
const PENDING_MS = 3000;

/**
 * The setting of a character.
 * @param {Actor} actor
 * @returns {import("./variety-logic.mjs").VarietyConfig}
 */
export function getVariety(actor) {
  return normalizeVariety(baseOf(actor)?.getFlag(MODULE_ID, "variety"));
}

/**
 * Save the setting of a character.
 * @param {Actor} actor
 * @param {import("./variety-logic.mjs").VarietyConfig} config
 * @returns {Promise<Actor>}
 */
export function saveVariety(actor, config) {
  const clean = normalizeVariety(config);
  if ( clean.mode !== "off" ) countFeature(MODULE_ID, "varietySet");
  return baseOf(actor).setFlag(MODULE_ID, "variety", clean);
}

/**
 * How often each outfit is on the unlinked tokens of a character in a scene.
 * @param {Scene|null} scene
 * @param {Actor} base
 * @param {TokenDocument|null} [except]     A token which is not counted (the one being rolled)
 * @returns {Map<string, number>}
 */
function usedLooks(scene, base, except = null) {
  const used = new Map();
  for ( const token of scene?.tokens ?? [] ) {
    if ( (token.actorId !== base.id) || token.actorLink || (token === except) ) continue;
    const id = token.delta?.flags?.[MODULE_ID]?.current ?? token._source?.delta?.flags?.[MODULE_ID]?.current;
    if ( id ) used.set(id, (used.get(id) ?? 0) + 1);
  }
  return used;
}

/**
 * Merge the looks the scene shows with the ones just given to tokens on their way into it. Per outfit the larger
 * number counts, so a token which is both in the scene and in the list is not counted twice.
 * @param {Map<string, number>} fromScene
 * @param {string} key
 * @returns {Map<string, number>}
 */
function mergedLooks(fromScene, key) {
  const now = Date.now();
  const list = (pending.get(key) ?? []).filter(entry => now - entry.at < PENDING_MS);
  pending.set(key, list);
  const counts = new Map();
  for ( const entry of list ) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  const merged = new Map(fromScene);
  for ( const [id, count] of counts ) merged.set(id, Math.max(count, merged.get(id) ?? 0));
  return merged;
}

/**
 * The data a token gets for a look: the changes against the token as it is, as paths relative to the token.
 * @param {object} source                            The token data
 * @param {import("./outfits.mjs").Outfit} outfit
 * @param {boolean} mirror
 * @returns {object}                                 Expanded token data
 */
export function variantData(source, outfit, mirror) {
  const data = lookData(source, {...outfit, mirror});
  if ( outfit.portrait ) data["delta.img"] = outfit.portrait;
  data[`delta.flags.${MODULE_ID}.current`] = outfit.id;
  data[`delta.flags.${MODULE_ID}.manual`] = outfit.id;
  return foundry.utils.expandObject(data);
}

/**
 * Hook "preCreateToken": a new unlinked token gets a random look.
 * @param {TokenDocument} token
 * @param {object} data
 * @param {object} options
 * @param {string} userId
 */
export function onPreCreateToken(token, data, options, userId) {
  try {
    if ( (userId !== game.user.id) || token.actorLink || options?.stwNoVariety ) return;
    const base = game.actors.get(token.actorId);
    if ( !base ) return;
    const config = getVariety(base);
    const pool = varietyPool(getOutfits(base), config);
    if ( !pool.length ) return;
    // A token which comes with a look of its own (copied from another token) keeps it
    if ( token.delta?.flags?.[MODULE_ID]?.current || data?.delta?.flags?.[MODULE_ID]?.current ) return;
    const scene = token.parent;
    const key = `${scene?.id}|${base.id}`;
    const pick = pickVariant({pool, used: mergedLooks(usedLooks(scene, base), key), config});
    if ( !pick ) return;
    const mirror = pick.outfit.mirror !== pick.flip;
    token.updateSource(variantData(token._source, pick.outfit, mirror));
    pending.get(key).push({id: pick.outfit.id, at: Date.now()});
    countFeature(MODULE_ID, "varietyPlaced");
    trace.add("variety: placed", {actor: base.name, outfit: pick.outfit.label, mirror});
  } catch(err) {
    console.error(`${MODULE_ID} | The random look failed`, err);
  }
}

/**
 * May a token roll a new look? Unlinked tokens of a character with more than one outfit in the pool.
 * @param {TokenDocument|null} token
 * @returns {boolean}
 */
export function canReroll(token) {
  const actor = token?.actor;
  if ( !token || token.actorLink || !actor || !canWear(actor) ) return false;
  const base = baseOf(actor);
  return varietyPool(getOutfits(base), getVariety(base)).length > 0;
}

/**
 * Roll a new look for an unlinked token.
 * @param {TokenDocument} token
 * @param {object} [options]
 * @param {boolean} [options.notify=true]
 * @returns {Promise<object|null>}    The result of the wearing, null when nothing could be done
 */
export async function rerollLook(token, {notify = true} = {}) {
  if ( !canReroll(token) ) {
    if ( notify ) ui.notifications.info(t("STW.Variety.noReroll"));
    return null;
  }
  const base = baseOf(token.actor);
  const config = getVariety(base);
  const pool = varietyPool(getOutfits(base), config);
  const pick = pickVariant({pool, used: usedLooks(token.parent, base, token), current: currentOutfitId(token), config});
  if ( !pick ) return null;
  countFeature(MODULE_ID, "varietyReroll");
  return wear(token, pick.outfit.id, {source: "variety", notify, mirror: pick.outfit.mirror !== pick.flip});
}
