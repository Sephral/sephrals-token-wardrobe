/**
 * Token Wardrobe' part of the debug file of Sephral's modules. Fill describeState with what helps a bug report, without
 * personal texts.
 */

import {MODULE_ID, setting, t} from "./config.mjs";
import {DebugTrace, registerDebugMenu, registerDebugProvider} from "./debug-file.mjs";
import {hasAuto, isVideo} from "./outfits.mjs";
import {getOutfits} from "./store.mjs";

/** The recent decisions of the module. */
export const trace = new DebugTrace();

/**
 * Run one part and keep its error instead, so one broken reading does not cost the rest.
 * @param {Function} fn
 * @returns {*}
 */
function attempt(fn) {
  try {
    return fn();
  } catch(err) {
    return {error: String(err?.message ?? err)};
  }
}

/**
 * What the module knows right now.
 * @returns {object}
 */
export function describeState() {
  const settings = Object.fromEntries(["theme", "sheetButton", "hudButton", "playersWear", "playersEdit", "allScenes",
    "transition", "automation"].map(key => [key, attempt(() => setting(key))]));
  return {
    settings,
    activeGM: attempt(() => game.users.activeGM?.id === game.user.id),
    wardrobes: attempt(() => {
      const list = game.actors.map(actor => getOutfits(actor)).filter(outfits => outfits.length);
      return {
        actors: list.length,
        outfits: list.reduce((n, outfits) => n + outfits.length, 0),
        unusable: list.reduce((n, outfits) => n + outfits.filter(o => !o.portrait && !o.token).length, 0),
        videoTokens: list.reduce((n, outfits) => n + outfits.filter(o => isVideo(o.token)).length, 0),
        automatic: list.reduce((n, outfits) => n + outfits.filter(hasAuto).length, 0)
      };
    }),
    files: attempt(() => ({browse: game.user.can("FILES_BROWSE"), upload: game.user.can("FILES_UPLOAD")}))
  };
}

/**
 * The button in the settings and the module's part of the file. Call in "init".
 */
export function registerDebug() {
  registerDebugMenu(MODULE_ID, {name: "STW.DEBUG.Title", label: "STW.DEBUG.Save", hint: "STW.DEBUG.Hint"});
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => t("STW.DEBUG.Entry"),
    notice: file => t("STW.DEBUG.Saved", {file}),
    recent: () => ({details: describeState()}),
    trace
  });
}
