/**
 * Settings of the module. Like in every Sephral module, all options appear in Foundry's settings dialog under this
 * module, starting with the module language.
 */

import {MODULE_ID} from "./config.mjs";
import {FOLLOW_FOUNDRY, applyModuleLanguage} from "./language.mjs";
import {runSelfTest} from "./selftest.mjs";

/**
 * The settings of the module, in the order they appear in the settings dialog.
 * @type {Record<string, object>}
 */
export const SETTINGS = {
  uiLanguage: {type: String, default: FOLLOW_FOUNDRY, scope: "client", onChange: "language", choices: {
    [FOLLOW_FOUNDRY]: "STW.LANGUAGE.default", de: "STW.LANGUAGE.de", en: "STW.LANGUAGE.en"}},
  theme: {type: String, default: "signature", scope: "client", onChange: "redraw", choices: {
    signature: "STW.SETTINGS.theme.signature", foundry: "STW.SETTINGS.theme.foundry"}},
  sheetButton: {type: Boolean, default: true, scope: "client", onChange: "redraw"},
  hudButton: {type: Boolean, default: true, scope: "client", onChange: "redraw"},
  playersWear: {type: Boolean, default: true, onChange: "redraw"},
  playersEdit: {type: Boolean, default: true, onChange: "redraw"},
  allScenes: {type: Boolean, default: true},
  transition: {type: String, default: "fade", choices: Object.fromEntries(
    ["none", "fade", "swirl", "waterDrop", "morph", "crosshatch", "wind", "waves", "whiteNoise", "hologram", "hole",
      "holeSwirl", "glitch", "dots"].map(key => [key, `STW.SETTINGS.transition.${key}`]))},
  automation: {type: Boolean, default: true},
  stageBackdrop: {type: String, default: "soft", choices: {
    soft: "STW.Stage.backdrop.soft", dark: "STW.Stage.backdrop.dark", none: "STW.Stage.backdrop.none"}},
  stageWear: {type: Boolean, default: false},
  stageShow: {type: Boolean, default: true, scope: "client", onChange: "stage"},
  stageScale: {type: String, default: "normal", scope: "client", onChange: "stage", choices: {
    small: "STW.SETTINGS.stageScale.small", normal: "STW.SETTINGS.stageScale.normal", large: "STW.SETTINGS.stageScale.large"}}
};

/**
 * Register all settings of the module and its menus.
 * @param {{language: Function, redraw: Function, openWardrobe: Function, openStage: Function, stage: Function}} handlers
 */
export function registerSettings(handlers) {
  openWardrobeMenu = handlers.openWardrobe;
  openStageMenu = handlers.openStage;
  for ( const [key, def] of Object.entries(SETTINGS) ) {
    game.settings.register(MODULE_ID, key, {
      name: `STW.SETTINGS.${key}.name`,
      hint: `STW.SETTINGS.${key}.hint`,
      scope: def.scope ?? "world",
      config: true,
      type: def.type,
      choices: def.choices,
      default: def.default,
      onChange: def.onChange ? value => handlers[def.onChange]?.(value) : undefined
    });
  }
  game.settings.register(MODULE_ID, "acknowledgedVersions", {scope: "client", config: false, type: String, default: ""});
  // The conversation stage, written by the GM, read by every client
  game.settings.register(MODULE_ID, "stage", {scope: "world", config: false, type: Object, default: {},
    onChange: () => handlers.stage?.()});
  game.settings.registerMenu(MODULE_ID, "wardrobe", {
    name: "STW.Window.menuTitle",
    label: "STW.Window.menuLabel",
    hint: "STW.Window.menuHint",
    icon: "fa-solid fa-shirt",
    type: WardrobeMenu
  });
  game.settings.registerMenu(MODULE_ID, "stageMenu", {
    name: "STW.Stage.menuTitle",
    label: "STW.Stage.menuLabel",
    hint: "STW.Stage.menuHint",
    icon: "fa-solid fa-masks-theater",
    type: StageMenu,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "selfTest", {
    name: "STW.SELFTEST.Title",
    label: "STW.SELFTEST.Run",
    hint: "STW.SELFTEST.Hint",
    icon: "fa-solid fa-stethoscope",
    type: SelfTestMenu,
    restricted: true
  });
}

/** Opens the wardrobe for the menu button. */
let openWardrobeMenu = () => {};

/** Opens the stage controls for the menu button. */
let openStageMenu = () => {};

/** The menu button which opens the wardrobe of the selected token or of the user's character. */
class WardrobeMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    await openWardrobeMenu();
    return this;
  }
}

/** The menu button which opens the controls of the conversation stage (GM). */
class StageMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    await openStageMenu();
    return this;
  }
}

/** The menu button which runs the self test. Foundry only accepts application classes as menus. */
class SelfTestMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    if ( game.user.isGM ) await runSelfTest();
    return this;
  }
}

/**
 * Switch the module strings when the user picks another module language, then redraw.
 * @param {string} value
 * @param {Function} redraw
 */
export function changeLanguage(value, redraw) {
  applyModuleLanguage(value).then(() => {
    redraw();
    if ( game.settings.sheet?.rendered ) game.settings.sheet.render();
  });
}
