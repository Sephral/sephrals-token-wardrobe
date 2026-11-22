/**
 * Sephral's Translator shows texts live. The conversation stage is built by hand (an overlay, not a window), so a
 * render does not reach its texts. The translator calls the hook "sephrals-translator.refresh" with the changed keys
 * and this module writes only the texts they touch. Without the translator the hook is never called.
 * Nothing on the token canvas is drawn from a language key: the feeling bubbles show symbols and the nameplate shows
 * names.
 */

import {MODULE_ID} from "./config.mjs";
import {REFRESH_HOOK, touched} from "./refresh-logic.mjs";
import {refreshStageTexts} from "./stage.mjs";

/**
 * Write the stage texts that the changed keys touch.
 * @param {{moduleId?: string, keys?: string[]|null}} payload
 * @returns {{title: boolean, hints: number}}
 */
export function onTranslatorRefresh(payload) {
  const what = touched(payload, MODULE_ID);
  if ( !what.title && !what.hints ) return {title: false, hints: 0};
  return refreshStageTexts(what);
}

/** Listen to the hook. Call once in "init". */
export function startTranslatorRefresh() {
  Hooks.on(REFRESH_HOOK, onTranslatorRefresh);
}
