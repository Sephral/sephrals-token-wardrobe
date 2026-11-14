/**
 * The library of backdrops of the conversation stage: a world setting the GM writes (name, wide picture, optional
 * ambient sound or playlist, the time of day and panning it starts with), and the sound that goes with a backdrop.
 *
 * The sound file plays on every screen while the backdrop is up, started by each client on its own from the stage
 * state (no socket message, and every player can switch it off for the own screen). A playlist is started by the
 * GM who switches the backdrop, like any playlist.
 */

import {MODULE_ID, makeId, setting} from "./config.mjs";
import {trace} from "./debug.mjs";
import {backdropsFromFiles, findBackdrop, normalizeBackdrop, normalizeBackdrops} from "./backdrop-logic.mjs";

/** The hidden world setting which holds the library. */
export const BACKDROP_SETTING = "backdrops";

/* -------------------------------------------- */
/*  The library                                 */
/* -------------------------------------------- */

/**
 * The backdrops of the world.
 * @returns {import("./backdrop-logic.mjs").Backdrop[]}
 */
export function getBackdrops() {
  return normalizeBackdrops(game.settings.get(MODULE_ID, BACKDROP_SETTING), makeId);
}

/**
 * Find a backdrop by id, name or position from 1.
 * @param {string|number|null} ref
 * @returns {import("./backdrop-logic.mjs").Backdrop|null}
 */
export function backdropByRef(ref) {
  return findBackdrop(getBackdrops(), ref);
}

/**
 * Save the library (GM).
 * @param {import("./backdrop-logic.mjs").Backdrop[]} list
 * @returns {Promise<void>}
 */
async function saveBackdrops(list) {
  await game.settings.set(MODULE_ID, BACKDROP_SETTING, {items: normalizeBackdrops(list, makeId)});
}

/**
 * Add backdrops from picture files (GM). Files which are in the library already are skipped.
 * @param {string[]} paths
 * @returns {Promise<import("./backdrop-logic.mjs").Backdrop[]>}   The new backdrops
 */
export async function addBackdrops(paths) {
  const list = getBackdrops();
  const added = backdropsFromFiles(paths, list, makeId);
  if ( added.length ) await saveBackdrops(list.concat(added));
  return added;
}

/**
 * Change a backdrop (GM).
 * @param {string} id
 * @param {Partial<import("./backdrop-logic.mjs").Backdrop>} changes
 * @returns {Promise<import("./backdrop-logic.mjs").Backdrop|null>}
 */
export async function updateBackdrop(id, changes) {
  const list = getBackdrops();
  const index = list.findIndex(b => b.id === id);
  if ( index < 0 ) return null;
  list[index] = normalizeBackdrop({...list[index], ...changes, id}, makeId);
  if ( !list[index].img ) return null;
  await saveBackdrops(list);
  return list[index];
}

/**
 * Take a backdrop out of the library (GM).
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function removeBackdrop(id) {
  const list = getBackdrops();
  if ( !list.some(b => b.id === id) ) return false;
  await saveBackdrops(list.filter(b => b.id !== id));
  return true;
}

/* -------------------------------------------- */
/*  Sound                                       */
/* -------------------------------------------- */

/** The sound playing on this client: {src, sound}. */
let playing = null;

/**
 * Play the ambient sound of a backdrop on this client, or stop it. Playing the same file again does nothing.
 * @param {string} src      The sound file ("" stops)
 * @returns {Promise<void>}
 */
export async function playBackdropSound(src) {
  const wanted = (src && setting("stageSound")) ? src : "";
  if ( (playing?.src ?? "") === wanted ) return;
  const old = playing;
  playing = wanted ? {src: wanted, sound: null} : null;
  try {
    await old?.sound?.stop?.();
  } catch(err) {
    console.warn(`${MODULE_ID} | Could not stop the backdrop sound`, err);
  }
  if ( !wanted ) return;
  const entry = playing;
  try {
    // The browser starts audio after the first click or key of the user, the sound waits for it
    if ( game.audio.locked ) await game.audio.unlock;
    if ( playing !== entry ) return;
    // The ambient channel of the user decides the volume
    const context = game.audio.environment ?? game.audio.interface;
    const sound = await game.audio.play(wanted, {volume: 1, loop: true, context});
    // The backdrop may have changed while the file loaded
    if ( playing !== entry ) await sound?.stop?.();
    else entry.sound = sound;
  } catch(err) {
    console.warn(`${MODULE_ID} | Could not play the backdrop sound ${wanted}`, err);
  }
}

/**
 * The file which plays on this client right now.
 * @returns {string}
 */
export function playingSound() {
  return playing?.src ?? "";
}

/* -------------------------------------------- */
/*  Playlists                                   */
/* -------------------------------------------- */

/**
 * Start the playlist of a backdrop and stop the one of the backdrop before it (GM who switches).
 * @param {import("./backdrop-logic.mjs").Backdrop|null} before
 * @param {import("./backdrop-logic.mjs").Backdrop|null} after
 */
export async function switchPlaylists(before, after) {
  if ( !game.user.isGM ) return;
  try {
    const old = before?.playlist ? await fromUuid(before.playlist) : null;
    const next = after?.playlist ? await fromUuid(after.playlist) : null;
    if ( old && (old !== next) && old.playing ) await old.stopAll();
    if ( next && !next.playing ) await next.playAll();
  } catch(err) {
    trace.add("playlist failed", {message: err?.message});
    console.warn(`${MODULE_ID} | Could not switch the playlists of the backdrops`, err);
  }
}
