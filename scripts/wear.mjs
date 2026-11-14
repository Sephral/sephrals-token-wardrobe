/**
 * Putting an outfit on: portrait, prototype token and tokens change together. One queue per character keeps fast
 * clicks in order, and a write happens only where something differs.
 */

import {MODULE_ID, flagDeletion, isDeletion, setting, t} from "./config.mjs";
import {trace} from "./debug.mjs";
import {countFeature} from "./usage.mjs";
import {cycleOutfit, findOutfit, isVideo, nameChange, textureScale, usableOutfits} from "./outfits.mjs";
import {requestSync} from "./relay.mjs";
import {canWear, currentOutfitId, getOutfits, resolveTarget} from "./store.mjs";

/** The event after an outfit was put on: `sephrals-token-wardrobe.worn`, with {actor, token, outfit, source}. */
export const WORN_HOOK = `${MODULE_ID}.worn`;

/** Running writes by character. */
const queues = new Map();

/**
 * Run a job after the earlier jobs of the same key.
 * @param {string} key
 * @param {() => Promise<*>} job
 * @returns {Promise<*>}
 */
function enqueue(key, job) {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(job);
  queues.set(key, next);
  next.catch(() => {}).finally(() => {
    if ( queues.get(key) === next ) queues.delete(key);
  });
  return next;
}

/* -------------------------------------------- */
/*  The changes                                 */
/* -------------------------------------------- */

/**
 * The scale of a source: the numbers of a texture.
 * @param {object} texture
 * @returns {{scaleX: number, scaleY: number}}
 */
function scaleOf(texture) {
  return {scaleX: texture?.scaleX ?? 1, scaleY: texture?.scaleY ?? 1};
}

/**
 * The data which texture, ring and remembered scale need, with paths relative to the token data (a token or the
 * prototype token).
 * @param {object} source                         The token data as stored
 * @param {import("./outfits.mjs").Outfit} outfit
 * @returns {Record<string, *>}
 */
export function lookData(source, outfit) {
  const data = {};
  if ( outfit.token ) {
    data["texture.src"] = outfit.token;
    if ( source.ring?.enabled && source.ring?.subject?.texture && !isVideo(outfit.token) ) {
      data["ring.subject.texture"] = outfit.token;
    }
  }
  const stored = source.flags?.[MODULE_ID]?.base ?? null;
  const scale = textureScale(outfit, scaleOf(source.texture), stored);
  data["texture.scaleX"] = scale.scaleX;
  data["texture.scaleY"] = scale.scaleY;
  if ( scale.base ) data[`flags.${MODULE_ID}.base`] = scale.base;
  else if ( stored ) Object.assign(data, flagDeletion("base"));
  // A disguise puts its name on the token and keeps the real one aside, the next outfit gives it back
  const real = source.flags?.[MODULE_ID]?.realName ?? null;
  const named = nameChange(source.name ?? "", real, outfit.disguise);
  data.name = named.name;
  if ( named.real ) data[`flags.${MODULE_ID}.realName`] = named.real;
  else if ( real ) Object.assign(data, flagDeletion("realName"));
  return data;
}

/**
 * Keep only what differs from the stored data.
 * @param {object} source                  The document data as stored
 * @param {Record<string, *>} data         Flat paths and new values
 * @returns {Record<string, *>}
 */
function onlyChanges(source, data) {
  // Foundry 14 renamed objectsEqual to equals and warns on the old name, Foundry 13 only has the old one
  const same = foundry.utils.equals ?? foundry.utils.objectsEqual;
  const changes = {};
  for ( const [path, value] of Object.entries(data) ) {
    if ( path.includes("-=") || isDeletion(value) ) {
      changes[path] = value;
      continue;
    }
    const old = foundry.utils.getProperty(source, path);
    if ( (old !== value) && !same(old, value) ) changes[path] = value;
  }
  return changes;
}

/**
 * Prefix the paths of a flat object.
 * @param {string} prefix
 * @param {Record<string, *>} data
 * @returns {Record<string, *>}
 */
function prefixed(prefix, data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [`${prefix}${key}`, value]));
}

/**
 * The flags a wearing sets on the character: what it has on, and for the automation what was chosen by hand.
 * @param {import("./outfits.mjs").Outfit} outfit
 * @param {object} options
 * @param {string} options.source                  "user", "place" (a Region or scene asked for it), "variety" (a
 *   random look), "feeling" (a mood for a while, the chosen look comes back) or "auto"
 * @param {{manual?: (string|null), autoId?: (string|null)}} [options.memory]
 * @returns {Record<string, *>}   Paths relative to the actor
 */
function flagData(outfit, {source, memory}) {
  const data = {[`flags.${MODULE_ID}.current`]: outfit?.id ?? null};
  if ( (source === "user") || (source === "place") || (source === "variety") ) data[`flags.${MODULE_ID}.manual`] = outfit.id;
  else if ( memory ) {
    if ( "manual" in memory ) data[`flags.${MODULE_ID}.manual`] = memory.manual;
    if ( "autoId" in memory ) data[`flags.${MODULE_ID}.autoId`] = memory.autoId;
  }
  return data;
}

/**
 * The animation options of a token update, from the setting.
 * @returns {object}
 */
function animationOptions() {
  const transition = setting("transition");
  return (transition === "none") ? {animation: {duration: 0}} : {animation: {transition}};
}

/* -------------------------------------------- */
/*  Tokens                                      */
/* -------------------------------------------- */

/**
 * The linked tokens of an actor.
 * @param {Actor} base
 * @param {object} options
 * @param {boolean} options.everywhere        Look on all scenes, not only the viewed one
 * @param {TokenDocument|null} [options.token]  A token to include in any case
 * @returns {TokenDocument[]}
 */
function linkedTokens(base, {everywhere, token=null}) {
  const scenes = new Set(everywhere ? game.scenes.contents : [canvas.scene].filter(Boolean));
  if ( token?.parent ) scenes.add(token.parent);
  const tokens = [];
  for ( const scene of scenes ) {
    for ( const doc of scene.tokens ) if ( (doc.actorId === base.id) && doc.actorLink ) tokens.push(doc);
  }
  return tokens;
}

/**
 * Put an outfit on linked tokens, scene by scene, in one update per scene.
 * @param {TokenDocument[]} tokens
 * @param {import("./outfits.mjs").Outfit} outfit
 * @returns {Promise<number>}   How many tokens changed
 */
async function updateTokens(tokens, outfit) {
  const byScene = new Map();
  for ( const token of tokens ) {
    if ( !token.canUserModify(game.user, "update") ) continue;
    const changes = onlyChanges(token._source, lookData(token._source, outfit));
    if ( !Object.keys(changes).length ) continue;
    const list = byScene.get(token.parent) ?? [];
    list.push(foundry.utils.expandObject({...changes, _id: token.id}));
    byScene.set(token.parent, list);
  }
  let count = 0;
  await Promise.all([...byScene].map(async ([scene, updates]) => {
    await scene.updateEmbeddedDocuments("Token", updates, animationOptions());
    count += updates.length;
  }));
  return count;
}

/**
 * The active GM's part of a request: the outfit goes on every linked token of the actor, on every scene.
 * @param {Actor} base
 * @param {string} outfitId
 * @returns {Promise<number>}
 */
export function syncLinkedTokens(base, outfitId) {
  const outfit = findOutfit(getOutfits(base), outfitId);
  if ( !outfit ) return Promise.resolve(0);
  return enqueue(base.uuid, () => updateTokens(linkedTokens(base, {everywhere: true}), outfit));
}

/* -------------------------------------------- */
/*  Wearing                                     */
/* -------------------------------------------- */

/**
 * Put an outfit on a character.
 * @param {Actor|TokenDocument|Token|string} target   An actor, a token or a UUID
 * @param {string|number} ref                         Id, name or position (from 1) of the outfit
 * @param {object} [options]
 * @param {"user"|"place"|"auto"|"variety"|"feeling"} [options.source="user"]   "auto" comes from the automation,
 *   "place" from a Region or scene, "variety" from a random look, "feeling" from a mood of the player
 * @param {{manual?: (string|null), autoId?: (string|null)}} [options.memory]   Automation bookkeeping, stored along
 * @param {boolean} [options.notify=true]             Tell the user when it cannot be done
 * @param {boolean|null} [options.mirror=null]        Mirror the token image of an unlinked token (null = as the outfit says)
 * @param {string|null} [options.back]                A feeling remembers the outfit to come back to (null = forget it)
 * @returns {Promise<{actor: Actor, token: (TokenDocument|null), outfit: object}|null>}
 */
export async function wear(target, ref, {source="user", memory, notify=true, mirror=null, back}={}) {
  const resolved = resolveTarget(target);
  if ( !resolved ) {
    if ( notify ) ui.notifications.warn(t("STW.Notify.noTarget"));
    return null;
  }
  const {base, actor, token} = resolved;
  if ( !canWear(actor) ) {
    if ( notify ) ui.notifications.warn(t("STW.Notify.noRight", {name: actor.name}));
    return null;
  }
  const outfit = (ref && (typeof ref === "object")) ? findOutfit(getOutfits(base), ref.id) : findOutfit(getOutfits(base), ref);
  if ( !outfit ) {
    if ( notify ) ui.notifications.warn(t("STW.Notify.noOutfit", {name: actor.name, outfit: String(ref ?? "")}));
    return null;
  }
  const result = await enqueue(actor.uuid, () => apply(resolved, outfit, {source, memory, mirror, back}));
  if ( source === "user" ) countFeature(MODULE_ID, "worn");
  Hooks.callAll(WORN_HOOK, {actor: base, token, outfit, source});
  return result;
}

/**
 * Write the changes of one wearing.
 * @param {import("./store.mjs").WardrobeTarget} resolved
 * @param {import("./outfits.mjs").Outfit} outfit
 * @param {object} options
 * @returns {Promise<{actor: Actor, token: (TokenDocument|null), outfit: object}>}
 */
async function apply({base, actor, token}, outfit, {source, memory, mirror, back}) {
  const flags = flagData(outfit, {source, memory});
  // A feeling remembers where to come back to, any other change of look ends the feeling
  const backPath = `flags.${MODULE_ID}.feelBack`;
  if ( source === "feeling" ) {
    if ( back !== undefined ) flags[backPath] = back;
  } else if ( actor.getFlag(MODULE_ID, "feelBack") ) flags[backPath] = null;

  // An unlinked token is dressed on its own: image and portrait in one update
  if ( token && !token.actorLink ) {
    const data = lookData(token._source, (mirror === null) ? outfit : {...outfit, mirror});
    if ( outfit.portrait ) data["delta.img"] = outfit.portrait;
    Object.assign(data, prefixed("delta.", flags));
    const changes = onlyChanges(token._source, data);
    if ( outfit.portrait && (token.actor?.img === outfit.portrait) ) delete changes["delta.img"];
    for ( const [path, value] of Object.entries(prefixed("delta.", flags)) ) {
      if ( token.actor?.getFlag(MODULE_ID, path.split(`flags.${MODULE_ID}.`)[1]) === value ) delete changes[path];
    }
    if ( Object.keys(changes).length ) {
      await token.update(foundry.utils.expandObject(changes), animationOptions());
      refreshSheets(actor);
    }
    trace.add("worn", {actor: actor.name, outfit: outfit.label, token: token.id, linked: false});
    return {actor, token, outfit};
  }

  // A world actor: portrait, prototype token and flags in one update, linked tokens beside it
  const stored = base._source;
  const data = prefixed("prototypeToken.", lookData(stored.prototypeToken, outfit));
  if ( outfit.portrait ) data.img = outfit.portrait;
  Object.assign(data, flags);
  // A player without a GM at the table leaves a note: the GM puts the outfit on the other scenes on connecting
  const wantsSync = !game.user.isGM && setting("allScenes");
  if ( wantsSync && !game.users.activeGM ) data[`flags.${MODULE_ID}.sync`] = outfit.id;
  const actorChanges = onlyChanges(stored, data);
  const jobs = [];
  if ( Object.keys(actorChanges).length ) jobs.push(base.update(foundry.utils.expandObject(actorChanges)));
  // Tokens linked to the actor follow, even when the prototype token itself is not linked
  const everywhere = game.user.isGM ? setting("allScenes") : false;
  jobs.push(updateTokens(linkedTokens(base, {everywhere, token}), outfit));
  await Promise.all(jobs);
  if ( wantsSync && game.users.activeGM ) requestSync(base, outfit.id);
  trace.add("worn", {actor: base.name, outfit: outfit.label, linked: true});
  return {actor: base, token, outfit};
}

/**
 * Redraw the open sheets of an actor, when the update of an unlinked token did not.
 * @param {Actor} actor
 */
function refreshSheets(actor) {
  for ( const app of Object.values(actor.apps ?? {}) ) if ( app.rendered ) app.render();
}

/* -------------------------------------------- */
/*  Next and previous                           */
/* -------------------------------------------- */

/**
 * Put on the next or the previous outfit.
 * @param {Actor|TokenDocument|Token|string} target
 * @param {number} step                     1 for the next, -1 for the previous outfit
 * @param {object} [options]                The options of `wear`
 * @returns {Promise<object|null>}
 */
export function step(target, step, options={}) {
  const resolved = resolveTarget(target);
  if ( !resolved ) return Promise.resolve(null);
  const outfits = getOutfits(resolved.base);
  const next = cycleOutfit(outfits, currentOutfitId(resolved.token ?? resolved.actor), step);
  if ( !next ) {
    if ( options.notify !== false ) ui.notifications.info(t("STW.Notify.noOutfits", {name: resolved.actor.name}));
    return Promise.resolve(null);
  }
  return wear(target, next, options);
}

/**
 * Put on the next outfit on the controlled tokens, or on the character of the user.
 * @param {number} direction
 */
export async function stepSelected(direction) {
  const tokens = canvas?.tokens?.controlled ?? [];
  const seen = new Set();
  const targets = [];
  for ( const token of tokens ) {
    const resolved = resolveTarget(token);
    if ( !resolved ) continue;
    const key = token.document.actorLink ? resolved.base.uuid : token.document.uuid;
    if ( seen.has(key) ) continue;
    seen.add(key);
    targets.push(token.document);
  }
  if ( !targets.length && game.user.character ) targets.push(game.user.character);
  if ( !targets.length ) {
    ui.notifications.info(t("STW.Notify.select"));
    return;
  }
  countFeature(MODULE_ID, "keyStep");
  for ( const target of targets ) await step(target, direction, {notify: targets.length === 1});
}

/** How many outfits of an actor can be worn. */
export function outfitCount(actor) {
  return usableOutfits(getOutfits(actor)).length;
}
