/**
 * Where the outfits live (flags of the actor) and who may do what.
 */

import {MODULE_ID, makeId, setting} from "./config.mjs";
import {normalizeOutfits, usableOutfits} from "./outfits.mjs";

/**
 * Who and what a call is about.
 * @typedef WardrobeTarget
 * @property {Actor} base         The world actor, which holds the outfits
 * @property {Actor} actor        The actor the call is about: the synthetic actor of an unlinked token, else the base
 * @property {TokenDocument|null} token   The token the call is about, if any
 */

/**
 * The world actor behind an actor: the actor itself, or the actor an unlinked token was made from.
 * @param {Actor|null|undefined} actor
 * @returns {Actor|null}
 */
export function baseOf(actor) {
  if ( !actor ) return null;
  if ( !actor.isToken ) return actor;
  return actor.token?.baseActor ?? game.actors.get(actor.id) ?? null;
}

/**
 * Work out the actor and token of a call. Takes an actor, a token document, a token placeable or a UUID.
 * @param {Actor|TokenDocument|Token|string|null|undefined} target
 * @returns {WardrobeTarget|null}
 */
export function resolveTarget(target) {
  if ( typeof target === "string" ) target = fromUuidSync(target, {strict: false});
  if ( target?.document && (target.document.documentName === "Token") ) target = target.document;
  let actor = null;
  let token = null;
  if ( target?.documentName === "Token" ) {
    token = target;
    actor = token.actor;
  } else if ( target?.documentName === "Actor" ) {
    actor = target;
    if ( actor.isToken ) token = actor.token;
  }
  if ( !actor ) return null;
  const base = baseOf(actor);
  if ( !base ) return null;
  return {base, actor, token};
}

/**
 * The target of the current user: the first controlled token, else the assigned character.
 * @returns {WardrobeTarget|null}
 */
export function defaultTarget() {
  const controlled = canvas?.tokens?.controlled?.find(t => t.actor);
  if ( controlled ) return resolveTarget(controlled);
  return resolveTarget(game.user.character);
}

/* -------------------------------------------- */

/**
 * The outfits of a character.
 * @param {Actor} actor
 * @returns {import("./outfits.mjs").Outfit[]}
 */
export function getOutfits(actor) {
  const base = baseOf(actor);
  return normalizeOutfits(base?.getFlag(MODULE_ID, "outfits"), makeId);
}

/**
 * The outfits which can be worn.
 * @param {Actor} actor
 * @returns {import("./outfits.mjs").Outfit[]}
 */
export function wearableOutfits(actor) {
  return usableOutfits(getOutfits(actor));
}

/**
 * Save the outfits of a character.
 * @param {Actor} actor
 * @param {import("./outfits.mjs").Outfit[]} outfits
 * @param {object} [extra]     More data for the same update (flags of the module and so on)
 * @returns {Promise<Actor>}
 */
export function saveOutfits(actor, outfits, extra={}) {
  const base = baseOf(actor);
  return base.update({...extra, [`flags.${MODULE_ID}.outfits`]: outfits});
}

/**
 * The id of the outfit a character has on, as far as the module put it on.
 * @param {Actor|TokenDocument} target
 * @returns {string|null}
 */
export function currentOutfitId(target) {
  const {actor} = resolveTarget(target) ?? {};
  return actor?.getFlag(MODULE_ID, "current") ?? null;
}

/* -------------------------------------------- */
/*  Rights                                      */
/* -------------------------------------------- */

/**
 * May the current user (or another user) put outfits on this character?
 * @param {Actor} actor
 * @param {User} [user]
 * @returns {boolean}
 */
export function canWear(actor, user=game.user) {
  if ( !actor ) return false;
  if ( user.isGM ) return true;
  return setting("playersWear") && actor.testUserPermission(user, "OWNER");
}

/**
 * May the current user (or another user) change the wardrobe of this character?
 * @param {Actor} actor
 * @param {User} [user]
 * @returns {boolean}
 */
export function canEdit(actor, user=game.user) {
  if ( !actor ) return false;
  if ( user.isGM ) return true;
  return setting("playersEdit") && actor.testUserPermission(user, "OWNER");
}

/**
 * The file rights of the current user, for the messages of the window.
 * @returns {{browse: boolean, upload: boolean}}
 */
export function fileRights() {
  return {browse: game.user.can("FILES_BROWSE"), upload: game.user.can("FILES_UPLOAD")};
}

/**
 * Is this client the one which runs the rules of the automation and the requests of players?
 * @returns {boolean}
 */
export function isActiveGM() {
  return !!game.user.isGM && (game.users.activeGM?.id === game.user.id);
}
