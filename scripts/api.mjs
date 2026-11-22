/**
 * The calls other modules use to add an outfit and put one on. They take the same ways as the window and the HUD:
 * the rights are checked first, the outfits are saved with the same function, wearing goes through `wear`.
 */

import {MODULE_ID, makeId, t} from "./config.mjs";
import {outfitFromRequest} from "./outfits.mjs";
import {canEdit, getOutfits, resolveTarget, saveOutfits} from "./store.mjs";
import {countFeature} from "./usage.mjs";
import {enqueue, wear} from "./wear.mjs";

/** The event after an outfit was added through the api: `sephrals-token-wardrobe.added`, with {actor, outfit}. */
export const ADDED_HOOK = `${MODULE_ID}.added`;

/**
 * Add an outfit to the wardrobe of a character. Only a GM or an owner of the character may do it (and only while the
 * setting lets players change wardrobes).
 * @param {Actor|TokenDocument|Token|string} target
 * @param {object} data                       {name, portrait, token, scale, mirror}
 * @param {object} [options]
 * @param {boolean} [options.notify=true]     Tell the user when it cannot be done
 * @returns {Promise<object|null>}            A copy of the new outfit, or null
 */
export async function addOutfit(target, data, {notify=true}={}) {
  const resolved = resolveTarget(target);
  if ( !resolved ) {
    if ( notify ) ui.notifications.warn(t("STW.Notify.noTarget"));
    return null;
  }
  const {base} = resolved;
  if ( !canEdit(base) ) {
    if ( notify ) ui.notifications.warn(t("STW.Notify.noRight", {name: base.name}));
    return null;
  }
  // One queue per character: parallel calls would otherwise read the same list and overwrite each other
  const outfit = await enqueue(`add:${base.uuid}`, async () => {
    const existing = getOutfits(base);
    const fresh = outfitFromRequest(data, existing, makeId);
    if ( !fresh ) return null;
    await saveOutfits(base, existing.concat(fresh));
    return fresh;
  });
  if ( !outfit ) return null;
  countFeature(MODULE_ID, "outfitsAdded");
  Hooks.callAll(ADDED_HOOK, {actor: base, outfit});
  return foundry.utils.deepClone(outfit);
}

/**
 * Put an outfit on a character or token.
 * @param {Actor|TokenDocument|Token|string} target
 * @param {string|number} ref                 Id, name or position (from 1) of the outfit
 * @param {object} [options]
 * @param {"target"|"actor"} [options.scope="target"]   "actor" dresses the character and its linked tokens even when a
 *   token was given, "target" dresses what was given (an unlinked token on its own)
 * @param {boolean} [options.notify=true]
 * @returns {Promise<boolean>}                True when the outfit is on
 */
export async function wearOutfit(target, ref, {scope="target", notify=true}={}) {
  const resolved = resolveTarget(target);
  if ( !resolved ) {
    if ( notify ) ui.notifications.warn(t("STW.Notify.noTarget"));
    return false;
  }
  const result = await wear((scope === "actor") ? resolved.base : target, ref, {notify});
  return Boolean(result);
}

/**
 * The outfits of a character as copies.
 * @param {Actor|TokenDocument|Token|string} target
 * @returns {object[]}
 */
export function listOutfits(target) {
  const resolved = resolveTarget(target);
  return resolved ? foundry.utils.deepClone(getOutfits(resolved.base)) : [];
}
