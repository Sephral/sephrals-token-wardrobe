/**
 * Outfits by place. A Region behavior "Put on outfit" dresses the tokens which enter a Region, a scene can ask for an
 * outfit for the tokens on it (set in the scene configuration, works on every Foundry version). Both can take the
 * outfit off again when the token leaves. Only the active GM writes.
 */

import {MODULE_ID, esc, flagDeletion, t} from "./config.mjs";
import {trace} from "./debug.mjs";
import {findOutfit} from "./outfits.mjs";
import {planEnter, planLeave, sceneOutfitName} from "./stage-logic.mjs";
import {baseOf, currentOutfitId, getOutfits, isActiveGM} from "./store.mjs";
import {countFeature} from "./usage.mjs";
import {wear} from "./wear.mjs";

/** The type of the Region behavior (Foundry puts the module id in front of the key of `documentTypes`). */
export const BEHAVIOR_TYPE = `${MODULE_ID}.putOn`;

/** The key under which the previous outfit of a token is remembered for a scene. */
const SCENE_KEY = "scene";

/* -------------------------------------------- */
/*  Putting on and taking off                   */
/* -------------------------------------------- */

/**
 * A token enters a place which asks for an outfit.
 * @param {TokenDocument} token
 * @param {object} place
 * @param {string} place.key           Where it happens: the id of the behavior or "scene"
 * @param {string} place.outfit        Name or id of the outfit
 * @param {boolean} place.restore      Take it off again when the token leaves
 * @returns {Promise<boolean>}         Was an outfit put on?
 */
export async function enterPlace(token, {key, outfit, restore}) {
  const actor = token?.actor;
  if ( !actor || !outfit ) return false;
  const found = findOutfit(getOutfits(baseOf(actor)), outfit);
  const back = token.getFlag(MODULE_ID, "placeBack") ?? {};
  const plan = planEnter({current: currentOutfitId(token), wanted: found?.id ?? null, restore, stored: key in back});
  if ( !found ) trace.add("place: no such outfit", {token: token.uuid, outfit});
  if ( plan.remember ) await token.update({[`flags.${MODULE_ID}.placeBack.${key}`]: plan.previous});
  if ( !plan.wear ) return false;
  countFeature(MODULE_ID, "placeWorn");
  trace.add("place: enter", {token: token.uuid, key, outfit: found.label});
  return !!(await wear(token, plan.wear, {source: "place", notify: false}));
}

/**
 * A token leaves a place: the outfit it had before comes back, when the place was set to do that.
 * @param {TokenDocument} token
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function leavePlace(token, key) {
  const actor = token?.actor;
  if ( !actor ) return false;
  const back = token.getFlag(MODULE_ID, "placeBack") ?? {};
  const stored = (key in back) ? String(back[key] ?? "") : undefined;
  const outfits = getOutfits(baseOf(actor));
  const plan = planLeave({stored, current: currentOutfitId(token), known: findOutfit(outfits, stored || null)?.id ?? null});
  if ( stored === undefined ) return false;
  await token.update(flagDeletion(`placeBack.${key}`));
  if ( !plan.wear ) return false;
  trace.add("place: leave", {token: token.uuid, key});
  return !!(await wear(token, plan.wear, {source: "place", notify: false}));
}

/* -------------------------------------------- */
/*  The Region behavior                         */
/* -------------------------------------------- */

/**
 * Register the behavior type. Call in "init".
 */
export function registerBehavior() {
  const config = CONFIG.RegionBehavior;
  if ( !config || !foundry.data?.regionBehaviors?.RegionBehaviorType ) return;
  config.dataModels[BEHAVIOR_TYPE] = createBehaviorClass();
  config.typeIcons[BEHAVIOR_TYPE] = "fa-solid fa-shirt";
  // Foundry fills in "TYPES.RegionBehavior.<type>" only where nothing is set
  (config.typeLabels ??= {})[BEHAVIOR_TYPE] = "STW.BEHAVIOR.label";
  (config.typeHints ??= {})[BEHAVIOR_TYPE] = "STW.BEHAVIOR.hint";
}

/**
 * The behavior class. It extends a Foundry class, so it is built when Foundry is there.
 * @returns {typeof foundry.data.regionBehaviors.RegionBehaviorType}
 */
function createBehaviorClass() {
  return class PutOnBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
    /** @override */
    static LOCALIZATION_PREFIXES = ["STW.BEHAVIOR", "BEHAVIOR.TYPES.base"];

    /** @override */
    static defineSchema() {
      const fields = foundry.data.fields;
      const E = CONST.REGION_EVENTS;
      return {
        events: this._createEventsField({events: [E.TOKEN_ENTER, E.TOKEN_EXIT], initial: [E.TOKEN_ENTER, E.TOKEN_EXIT]}),
        outfit: new fields.StringField({required: true, blank: true, initial: ""}),
        leave: new fields.StringField({required: true, blank: false, initial: "keep", choices: {
          keep: "STW.BEHAVIOR.leave.keep", restore: "STW.BEHAVIOR.leave.restore"}})
      };
    }

    /** @override */
    async _handleRegionEvent(event) {
      if ( !isActiveGM() ) return;
      const token = event.data?.token;
      if ( !token?.actor ) return;
      const key = this.behavior.id;
      try {
        if ( event.name === CONST.REGION_EVENTS.TOKEN_ENTER ) {
          await enterPlace(token, {key, outfit: this.outfit, restore: this.leave === "restore"});
        } else if ( event.name === CONST.REGION_EVENTS.TOKEN_EXIT ) await leavePlace(token, key);
      } catch(err) {
        console.error(`${MODULE_ID} | The region ${this.region?.name} could not change the outfit of ${token.name}`, err);
      }
    }
  };
}

/* -------------------------------------------- */
/*  The scene                                   */
/* -------------------------------------------- */

/**
 * The outfit a scene asks for.
 * @param {Scene|null} scene
 * @returns {{outfit: string, restore: boolean}|null}
 */
export function sceneRule(scene) {
  const outfit = sceneOutfitName(scene?.getFlag(MODULE_ID, "sceneOutfit"));
  return outfit ? {outfit, restore: scene.getFlag(MODULE_ID, "sceneLeave") === "restore"} : null;
}

/**
 * Put the outfit of a scene on all the tokens on it.
 * @param {Scene} scene
 */
async function dressScene(scene) {
  const rule = sceneRule(scene);
  if ( !rule ) return;
  for ( const token of scene.tokens ) {
    try {
      await enterPlace(token, {key: SCENE_KEY, ...rule});
    } catch(err) {
      console.error(`${MODULE_ID} | The scene ${scene.name} could not change the outfit of ${token.name}`, err);
    }
  }
}

/**
 * The scene was left: the tokens on it get their previous outfits back.
 * @param {Scene} scene
 */
async function undressScene(scene) {
  for ( const token of scene.tokens ) {
    try {
      await leavePlace(token, SCENE_KEY);
    } catch(err) {
      console.error(`${MODULE_ID} | The scene ${scene.name} could not restore the outfit of ${token.name}`, err);
    }
  }
}

/**
 * Hook "renderSceneConfig": a field for the outfit of the scene in the first tab.
 * @param {ApplicationV2} app
 * @param {HTMLElement} html
 */
export function onRenderSceneConfig(app, html) {
  const element = (html instanceof HTMLElement) ? html : html?.[0];
  const tab = element?.querySelector('.tab[data-tab="basics"]');
  if ( !tab || tab.querySelector(".stw-scene-outfit") ) return;
  const scene = app.document;
  const name = sceneOutfitName(scene.getFlag(MODULE_ID, "sceneOutfit"));
  const leave = scene.getFlag(MODULE_ID, "sceneLeave") === "restore" ? "restore" : "keep";
  const group = document.createElement("fieldset");
  group.className = "stw-scene-outfit";
  group.innerHTML = `<legend>${esc(t("STW.Scene.title"))}</legend>
    <div class="form-group">
      <label>${esc(t("STW.Scene.outfit"))}</label>
      <div class="form-fields"><input type="text" name="flags.${MODULE_ID}.sceneOutfit" value="${esc(name)}"
        placeholder="${esc(t("STW.Quick.street"))}"></div>
      <p class="hint">${esc(t("STW.Scene.outfitHint"))}</p>
    </div>
    <div class="form-group">
      <label>${esc(t("STW.Scene.leave"))}</label>
      <div class="form-fields"><select name="flags.${MODULE_ID}.sceneLeave">
        <option value="keep"${(leave === "keep") ? " selected" : ""}>${esc(t("STW.BEHAVIOR.leave.keep"))}</option>
        <option value="restore"${(leave === "restore") ? " selected" : ""}>${esc(t("STW.BEHAVIOR.leave.restore"))}</option>
      </select></div>
      <p class="hint">${esc(t("STW.Scene.leaveHint"))}</p>
    </div>`;
  tab.append(group);
}

/**
 * Register the hooks of the scene rule. Call in "ready".
 */
export function registerPlaces() {
  Hooks.on("updateScene", (scene, changes) => {
    if ( !isActiveGM() ) return;
    if ( changes.active === true ) dressScene(scene);
    else if ( (changes.active === false) && (sceneRule(scene)?.restore) ) undressScene(scene);
  });
  Hooks.on("createToken", token => {
    if ( !isActiveGM() || !token.parent?.active ) return;
    const rule = sceneRule(token.parent);
    if ( rule ) enterPlace(token, {key: SCENE_KEY, ...rule}).catch(err => console.error(`${MODULE_ID} |`, err));
  });
}
