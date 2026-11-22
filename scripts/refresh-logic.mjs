/**
 * Pure part of the answer to the translator's refresh hook: which texts of the stage a list of changed keys touches.
 * No Foundry, so node can test it.
 */

/** The hook of Sephral's Translator, called after a preview change with the changed keys. */
export const REFRESH_HOOK = "sephrals-translator.refresh";

/** The keys that are written into the stage by hand (no render rebuilds them), by kind. */
export const GROUPS = Object.freeze({
  /** Label of the stage overlay, set once when it is created. */
  title: /^STW\.Stage\.title$/,
  /** The real name behind a disguise, under a nameplate (GM). */
  hints: /^STW\.Stage\.realName$/
});

/**
 * Which groups does a refresh payload touch? A payload of another module touches none. `keys` null means every key.
 * @param {{moduleId?: string, module?: string, keys?: string[]|null}|null} payload
 * @param {string} moduleId
 * @param {Record<string, RegExp>} [groups]
 * @returns {Record<string, boolean>}
 */
export function touched(payload, moduleId, groups = GROUPS) {
  const result = {};
  const mine = !!payload && ((payload.moduleId ?? payload.module) === moduleId);
  for ( const [name, test] of Object.entries(groups) ) {
    result[name] = mine && (!Array.isArray(payload.keys) || payload.keys.some(key => test.test(String(key))));
  }
  return result;
}
