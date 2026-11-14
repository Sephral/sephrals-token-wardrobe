/**
 * Pure helpers of the backdrops of the conversation stage: the library of the world, switching and the times of
 * day. Nothing here touches Foundry globals, so the helpers also run in Node tests.
 */

import {fileStem, labelFromStem, withoutQuery} from "./outfits.mjs";

/**
 * @typedef Backdrop
 * @property {string} id          Stable id
 * @property {string} name        Name shown in the library and as the title of the place
 * @property {string} img         A wide picture or a looping video
 * @property {string} sound       An ambient sound file played on every screen while the backdrop is up ("" = none)
 * @property {string} playlist    UUID of a playlist the GM starts with the backdrop ("" = none)
 * @property {string} tint        The time of day it starts with (TINTS)
 * @property {boolean} pan        Pan the picture slowly
 */

/** The lights of the time of day over a backdrop. */
export const TINTS = ["none", "dawn", "dusk", "night"];

/** The most backdrops in the library. */
export const MAX_BACKDROPS = 60;

/**
 * Bring one backdrop into a known shape.
 * @param {object} data
 * @param {() => string} makeId
 * @returns {Backdrop}
 */
export function normalizeBackdrop(data, makeId) {
  const text = value => ((typeof value === "string") ? value.trim() : "");
  const img = text(data?.img);
  const stem = fileStem(img);
  return {
    id: text(data?.id) || makeId(),
    name: text(data?.name) || (stem ? labelFromStem(stem) : ""),
    img,
    sound: text(data?.sound),
    playlist: text(data?.playlist),
    tint: TINTS.includes(data?.tint) ? data.tint : "none",
    pan: !!data?.pan
  };
}

/**
 * Normalize the library: entries without a picture are dropped, ids stay unique.
 * @param {object[]|object|undefined} list     The stored array, an index-keyed object or {items: [...]}
 * @param {() => string} makeId
 * @returns {Backdrop[]}
 */
export function normalizeBackdrops(list, makeId) {
  if ( list && !Array.isArray(list) && Array.isArray(list.items) ) list = list.items;
  const entries = Array.isArray(list) ? list : Object.values(list ?? {});
  const seen = new Set();
  const result = [];
  for ( const entry of entries ) {
    const backdrop = normalizeBackdrop(entry, makeId);
    if ( !backdrop.img ) continue;
    if ( seen.has(backdrop.id) ) backdrop.id = makeId();
    seen.add(backdrop.id);
    result.push(backdrop);
    if ( result.length >= MAX_BACKDROPS ) break;
  }
  return result;
}

/**
 * Find a backdrop by id, by name (ignoring case) or by position from 1.
 * @param {Backdrop[]} list
 * @param {string|number|null} ref
 * @returns {Backdrop|null}
 */
export function findBackdrop(list, ref) {
  if ( (ref === null) || (ref === undefined) || (ref === "") ) return null;
  const byId = list.find(b => b.id === ref);
  if ( byId ) return byId;
  const name = String(ref).trim().toLowerCase();
  const byName = list.find(b => b.name.toLowerCase() === name);
  if ( byName ) return byName;
  const index = Number(ref);
  return (Number.isInteger(index) && (index >= 1)) ? (list[index - 1] ?? null) : null;
}

/**
 * The next or the previous backdrop of the library, wrapping around. Without a current one, forward starts with the
 * first and backward with the last.
 * @param {Backdrop[]} list
 * @param {string|null} currentId
 * @param {number} step             1 or -1
 * @returns {Backdrop|null}
 */
export function cycleBackdrop(list, currentId, step) {
  if ( !list.length ) return null;
  const index = list.findIndex(b => b.id === currentId);
  if ( index < 0 ) return (step >= 0) ? list[0] : list.at(-1);
  const n = list.length;
  return list[(((index + step) % n) + n) % n];
}

/**
 * New backdrops from picture files. Files already in the library are skipped.
 * @param {string[]} paths
 * @param {Backdrop[]} existing
 * @param {() => string} makeId
 * @returns {Backdrop[]}
 */
export function backdropsFromFiles(paths, existing, makeId) {
  const known = new Set(existing.map(b => withoutQuery(b.img)));
  const added = [];
  for ( const path of paths ) {
    const clean = withoutQuery(path);
    if ( !clean || known.has(clean) ) continue;
    known.add(clean);
    added.push(normalizeBackdrop({img: path}, makeId));
  }
  return added;
}

/**
 * The changes of a stage when a backdrop is shown: its picture, the time of day and the panning it starts with.
 * Showing the backdrop that is up leaves the time of day and the panning the GM chose.
 * @param {{backdropId: (string|null), tint: string, pan: boolean}} state
 * @param {Backdrop|null} backdrop
 * @returns {{backdropId: (string|null), tint: string, pan: boolean}}
 */
export function withBackdrop(state, backdrop) {
  if ( !backdrop ) return {backdropId: null, tint: "none", pan: false};
  if ( state.backdropId === backdrop.id ) return {backdropId: state.backdropId, tint: state.tint, pan: state.pan};
  return {backdropId: backdrop.id, tint: backdrop.tint, pan: backdrop.pan};
}
