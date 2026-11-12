import {MODULE_ID, TESTED_VERSIONS, setting, t} from "./config.mjs";
import {registerAutomation} from "./automation.mjs";
import {registerDebug} from "./debug.mjs";
import {saveDebugFile} from "./debug-file.mjs";
import {onCloseTokenHUD, onRenderTokenHUD, refreshTokenHUD} from "./hud.mjs";
import {registerHubModule} from "./hub.mjs";
import {onRenderSceneConfig, registerBehavior, registerPlaces} from "./places.mjs";
import {applyModuleLanguage} from "./language.mjs";
import {baseOf, getOutfits, currentOutfitId, defaultTarget, resolveTarget, wearableOutfits} from "./store.mjs";
import {closePopup} from "./palette.mjs";
import {startRelay, syncPending} from "./relay.mjs";
import {noticeNewVersions, runSelfTest} from "./selftest.mjs";
import {changeLanguage, registerSettings} from "./settings.mjs";
import {onActorContextOptions, onRenderActorSheet, onSheetHeaderButtons, onSheetHeaderControls} from "./sheet.mjs";
import {openStageControls} from "./stage-app.mjs";
import {addToStage, flipSide, getStage, hideStage, removeFromStage, renderStage, setBackdrop,
  setExpression, setSpeaker, showStage, startStage} from "./stage.mjs";
import {registerUsage} from "./usage.mjs";
import {openWardrobe, refreshWardrobes} from "./wardrobe-app.mjs";
import {step, stepSelected, syncLinkedTokens, wear} from "./wear.mjs";

/** The keys. */
const KEYS = {next: "nextOutfit", previous: "previousOutfit"};

/** Redraw what the module shows after a language, look or rights change. */
function redraw() {
  closePopup();
  refreshWardrobes();
  refreshTokenHUD();
  renderStage();
  for ( const app of foundry.applications.instances.values() ) {
    if ( app.document?.documentName === "Actor" && app.rendered ) app.render();
  }
}

/** Open the wardrobe of the selected token or of the character of the user. */
function openForSelection() {
  const target = defaultTarget();
  if ( !target ) {
    ui.notifications.info(t("STW.Notify.select"));
    return;
  }
  openWardrobe(target.token ?? target.actor);
}

Hooks.once("init", () => {
  registerHubModule({moduleId: MODULE_ID, tested: TESTED_VERSIONS});
  registerSettings({
    language: value => changeLanguage(value, redraw),
    redraw,
    openWardrobe: openForSelection,
    openStage: () => openStageControls(),
    stage: () => renderStage()
  });
  registerBehavior();
  // Counted only on the active GM's client, like every Sephral module
  registerUsage(MODULE_ID, {
    features: ["worn", "hudWear", "sheetPalette", "windowOpened", "outfitsAdded", "uploaded", "copied", "folderImport",
      "suggest", "wildcard", "quickStart", "autoSet", "autoWorn", "keyStep", "stageShown", "stageExpression", "placeWorn"],
    settings: ["theme", "sheetButton", "hudButton", "playersWear", "playersEdit", "allScenes", "transition", "automation",
      "stageBackdrop", "stageWear", "stageShow", "stageScale"]
  });
  registerKeys();
  registerDebug();
  Hooks.on("renderActorSheet", onRenderActorSheet);
  Hooks.on("renderActorSheetV2", onRenderActorSheet);
  Hooks.on("getHeaderControlsActorSheetV2", onSheetHeaderControls);
  Hooks.on("getActorSheetHeaderButtons", onSheetHeaderButtons);
  Hooks.on("getActorContextOptions", onActorContextOptions);
  Hooks.on("renderSceneConfig", onRenderSceneConfig);
  Hooks.on("refreshToken", onRefreshToken);
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  Hooks.on("closeTokenHUD", onCloseTokenHUD);
  for ( const event of ["updateActor", "updateToken", "createToken", "deleteToken"] ) {
    Hooks.on(event, doc => {
      const actor = (doc.documentName === "Actor") ? doc : doc.actor;
      if ( actor ) refreshWardrobes(baseOf(actor));
    });
  }
  game.modules.get(MODULE_ID).api = {
    /**
     * Put an outfit on an actor, a token or a UUID. The outfit is an id, a name or a position (from 1). Returns
     * {actor, token, outfit} or null.
     */
    wear,
    /** Put on the next outfit (target, options). */
    next: (target, options) => step(target, 1, options),
    /** Put on the previous outfit (target, options). */
    previous: (target, options) => step(target, -1, options),
    /** Open the wardrobe window of an actor or token. */
    open: openWardrobe,
    /** The outfits of an actor or token: [{id, label, portrait, token, scale, mirror, auto}]. */
    outfits: target => {
      const resolved = resolveTarget(target);
      return resolved ? foundry.utils.deepClone(getOutfits(resolved.base)) : [];
    },
    /** The outfit an actor or token has on, or null. */
    current: target => {
      const resolved = resolveTarget(target);
      if ( !resolved ) return null;
      const id = currentOutfitId(resolved.token ?? resolved.actor);
      return wearableOutfits(resolved.base).find(o => o.id === id) ?? null;
    },
    /**
     * The conversation stage (GM): portraits big on every screen.
     * `show(actors, options)` brings characters on (options: replace, speaker, backdrop, open), `add(actor, options)`
     * adds one (options: outfit, side, speaking), `remove(actor)`, `hide()` closes the stage for all,
     * `setExpression(actor, outfit)` shows an outfit by id, name, position or mood such as "angry",
     * `speak(actor)` marks the speaker (null for nobody), `open()` opens the controls, `state()` is a copy of the stage.
     */
    stage: {
      show: showStage,
      add: addToStage,
      remove: removeFromStage,
      hide: hideStage,
      setExpression,
      speak: target => setSpeaker(target ?? null),
      flip: flipSide,
      backdrop: setBackdrop,
      open: openStageControls,
      state: () => foundry.utils.deepClone(getStage())
    },
    /** Check the module (GM). */
    runSelfTest,
    /** Save the debug file of Sephral's modules (GM). */
    saveDebugFile: messageId => saveDebugFile(messageId ?? null, {moduleId: MODULE_ID})
  };
});

/**
 * Hook "refreshToken": the GM sees the real name behind a disguise next to the name the players see.
 * @param {Token} token
 * @param {object} flags
 */
function onRefreshToken(token, flags) {
  if ( !game.user.isGM || !token.nameplate || !(flags?.refreshNameplate || flags?.refreshState || flags?.redraw) ) return;
  const real = token.document.getFlag(MODULE_ID, "realName");
  if ( !real || (real === token.document.name) ) return;
  token.nameplate.text = `${token.document.name} (${real})`;
}

/** Applying a fixed module language loads its file; the rest of "ready" waits for it. */
let languageReady = Promise.resolve();

Hooks.once("i18nInit", () => {
  languageReady = applyModuleLanguage(setting("uiLanguage"));
});

Hooks.once("ready", async () => {
  await languageReady;
  const onSync = (actor, outfitId) => syncLinkedTokens(actor, outfitId);
  startRelay(onSync);
  syncPending(onSync);
  Hooks.on("userConnected", (user, connected) => {
    if ( connected && user.isGM ) setTimeout(() => syncPending(onSync), 1500);
  });
  // The permissions decide what the window offers
  Hooks.on("updateSetting", doc => {
    if ( doc.key === "core.permissions" ) refreshWardrobes();
  });
  registerAutomation();
  registerPlaces();
  startStage();
  noticeNewVersions();
});

/**
 * The keys for the next and the previous outfit of the selected tokens. They have no default keys, everyone chooses
 * them in Foundry's key settings.
 */
function registerKeys() {
  for ( const [name, direction] of [[KEYS.next, 1], [KEYS.previous, -1]] ) {
    game.keybindings.register(MODULE_ID, name, {
      name: `STW.Keys.${name}`,
      editable: [],
      onDown: () => {
        stepSelected(direction);
        return true;
      }
    });
  }
  game.keybindings.register(MODULE_ID, "openStage", {
    name: "STW.Keys.openStage",
    editable: [],
    restricted: true,
    onDown: () => {
      openStageControls();
      return true;
    }
  });
  game.keybindings.register(MODULE_ID, "closeStage", {
    name: "STW.Keys.closeStage",
    editable: [],
    restricted: true,
    onDown: () => {
      hideStage();
      return true;
    }
  });
  game.keybindings.register(MODULE_ID, "openWardrobe", {
    name: "STW.Keys.openWardrobe",
    editable: [],
    onDown: () => {
      openForSelection();
      return true;
    }
  });
}
