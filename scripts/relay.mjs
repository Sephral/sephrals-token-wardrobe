/**
 * Requests of players to the active GM over the module socket. A player writes what the player may write, the active
 * GM completes the rest (linked tokens on scenes the player cannot change). The server names the sender of every
 * message, so the GM checks the rights of that user, never what the message claims.
 */

import {MODULE_ID, SOCKET, setting} from "./config.mjs";
import {trace} from "./debug.mjs";
import {canWear, isActiveGM} from "./store.mjs";

/**
 * Ask the active GM to put the outfit of an actor on all its linked tokens.
 * @param {Actor} actor         The world actor
 * @param {string} outfitId
 * @returns {boolean}           False when no GM is there to do it
 */
export function requestSync(actor, outfitId) {
  if ( !game.users.activeGM ) return false;
  game.socket.emit(SOCKET, {type: "sync", actorUuid: actor.uuid, outfitId});
  return true;
}

/**
 * Listen to the socket. Call in "ready".
 * @param {(actor: Actor, outfitId: string) => Promise<*>} onSync    Puts the outfit on the linked tokens
 */
export function startRelay(onSync) {
  game.socket.on(SOCKET, async (message, senderId) => {
    if ( !isActiveGM() || (message?.type !== "sync") ) return;
    const sender = game.users.get(senderId);
    const actor = (typeof message.actorUuid === "string") ? fromUuidSync(message.actorUuid, {strict: false}) : null;
    if ( !sender || !actor || (actor.documentName !== "Actor") || actor.isToken || (typeof message.outfitId !== "string") ) {
      return;
    }
    if ( !setting("allScenes") || !canWear(actor, sender) ) {
      trace.add("relay refused", {user: sender.name, actor: actor.name});
      return;
    }
    try {
      await onSync(actor, message.outfitId);
    } catch(err) {
      console.error(`${MODULE_ID} | Could not complete the request of ${sender.name}`, err);
    }
  });
}

/**
 * Put outfits on the linked tokens of other scenes which players chose while no GM was connected. Call on the active
 * GM's client when the world starts and when a GM connects.
 * @param {(actor: Actor, outfitId: string) => Promise<*>} onSync
 */
export async function syncPending(onSync) {
  if ( !isActiveGM() || !setting("allScenes") ) return;
  for ( const actor of game.actors ) {
    const outfitId = actor.getFlag(MODULE_ID, "sync");
    if ( !outfitId ) continue;
    try {
      await onSync(actor, outfitId);
      await actor.update({[`flags.${MODULE_ID}.-=sync`]: null});
      trace.add("pending sync done", {actor: actor.name});
    } catch(err) {
      console.error(`${MODULE_ID} | Could not complete the waiting outfit of ${actor.name}`, err);
    }
  }
}
