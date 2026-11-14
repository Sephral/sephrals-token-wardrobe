/**
 * Pure helpers of "Every figure looks different": the setting of a character and the random pick of a look. Nothing
 * here touches Foundry globals, so the helpers also run in Node tests.
 */

import {usableOutfits} from "./outfits.mjs";

/** Which outfits take part: none, the ones marked for it, or all of them. */
export const VARIETY_MODES = ["off", "marked", "all"];

/**
 * @typedef VarietyConfig
 * @property {("off"|"marked"|"all")} mode
 * @property {boolean} mirror       Mirror the token image at random as well
 */

/**
 * Bring the stored setting of a character into a known shape.
 * @param {object} [data]
 * @returns {VarietyConfig}
 */
export function normalizeVariety(data) {
  return {mode: VARIETY_MODES.includes(data?.mode) ? data.mode : "off", mirror: !!data?.mirror};
}

/**
 * The outfits a random look is picked from.
 * @param {import("./outfits.mjs").Outfit[]} outfits
 * @param {VarietyConfig} config
 * @returns {import("./outfits.mjs").Outfit[]}
 */
export function varietyPool(outfits, config) {
  if ( config.mode === "off" ) return [];
  const usable = usableOutfits(outfits);
  return (config.mode === "all") ? usable : usable.filter(o => o.variety);
}

/**
 * Pick a look. Looks which are used the least so far win, so five tokens placed one after the other show every
 * outfit before one repeats. A new roll for a token leaves out the look it has now, as long as there is another.
 * @param {object} options
 * @param {import("./outfits.mjs").Outfit[]} options.pool
 * @param {Map<string, number>|Record<string, number>} [options.used]    How often each outfit is used, by id
 * @param {string|null} [options.current]      The outfit the token has now (left out when another one exists)
 * @param {VarietyConfig} options.config
 * @param {() => number} [options.random]      A number from 0 up to but not including 1
 * @returns {{outfit: import("./outfits.mjs").Outfit, flip: boolean}|null}   `flip` turns the mirror of the outfit around
 */
export function pickVariant({pool, used = new Map(), current = null, config, random = Math.random}) {
  if ( !pool.length ) return null;
  const count = id => ((used instanceof Map) ? used.get(id) : used?.[id]) ?? 0;
  let options = pool;
  if ( current && (pool.length > 1) ) options = pool.filter(o => o.id !== current);
  const least = Math.min(...options.map(o => count(o.id)));
  const fresh = options.filter(o => count(o.id) === least);
  const outfit = fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))];
  return {outfit, flip: config.mirror ? (random() < 0.5) : false};
}
