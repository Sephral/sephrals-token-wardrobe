// Sample windows (api.samples, contract in samples.mjs): the wardrobe, the stage controls, the palettes and the questions
// of the module filled with made-up characters, so translators and testers see every text in its place without
// building a wardrobe first. Nothing here writes: the characters are never saved (their update does nothing but say so),
// the windows block drops, keys and changes, every button that would change something only says that it does nothing,
// no usage counter counts and the canvas and the scene stay as they are.

import {MODULE_ID, esc, setting, t} from "./config.mjs";
import {markSample, openSampleDialog, openSampleHtml, sampleActions, sampleBlocked, sampleCast, sampleId} from "./samples.mjs";
import {SAMPLE_IMAGES, sampleBackdropList, sampleCharacters, sampleStageState} from "./sample-data.mjs";
import {emptyStage} from "./stage-logic.mjs";
import {usableOutfits} from "./outfits.mjs";
import {getOutfits} from "./store.mjs";
import {createPalette} from "./palette.mjs";
import {sceneOutfitGroup} from "./places.mjs";
import {StageApp, backdropFormContent} from "./stage-app.mjs";
import {WardrobeApp, autoFormContent, suggestContent, varietyFormContent} from "./wardrobe-app.mjs";

/** Stand ins for the user the palettes are drawn for. */
const GM_VIEWER = {isGM: true};
const PLAYER_VIEWER = {isGM: false, id: "stw-sample-player"};

/* -------------------------------------------- */
/*  The made-up characters                      */
/* -------------------------------------------- */

/** The type of actor the samples use: one the game system knows. */
function actorType() {
  const types = CONFIG.Actor.documentClass.TYPES ?? [];
  return types.includes("character") ? "character" : (types.find(type => type !== CONST.BASE_DOCUMENT_TYPE) ?? CONST.BASE_DOCUMENT_TYPE);
}

/**
 * An actor that exists in memory only: its update says that it does nothing.
 * @param {ReturnType<typeof sampleCharacters>[number]} character
 * @param {object} [data]
 * @returns {Actor}
 */
function makeActor(character, data = {}) {
  const flags = {outfits: character.outfits};
  if ( character.current ) flags.current = character.current;
  if ( character.variety ) flags.variety = character.variety;
  const actor = new CONFIG.Actor.documentClass({
    _id: foundry.utils.randomID(), name: character.name, type: actorType(), img: character.img, flags: {[MODULE_ID]: flags}, ...data
  });
  actor.update = async () => {
    sampleBlocked();
    return actor;
  };
  return actor;
}

/**
 * The characters of the samples as unsaved actors, and the stage and backdrops made of them.
 * @returns {{actors: Map<string, Actor>, list: Actor[], characters: object[]}}
 */
function sampleWorld() {
  const characters = sampleCharacters(t);
  const actors = new Map();
  for ( const character of characters ) actors.set(character.key, makeActor(character));
  // The wolf has a picture and no outfits: it shows up in the list of characters to add to the stage
  const wolf = sampleCast().find(member => member.id === "wolf");
  actors.set("wolf", makeActor({key: "wolf", name: wolf.name, img: wolf.img, outfits: [], current: null, variety: null}));
  const bound = characters.map(character => ({...character, id: actors.get(character.key).id}));
  return {actors, list: [...actors.values()], characters: bound};
}

/** An element that stops an event of a sample window and says that nothing happens. */
function stopEvent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  sampleBlocked();
}

/* -------------------------------------------- */
/*  The wardrobe                                */
/* -------------------------------------------- */

/**
 * The wardrobe window over an unsaved character. `mode` says who looks: the GM (also for an empty wardrobe and a single
 * token), a player who may only put outfits on, or a player who may change outfits but not use files.
 */
class SampleWardrobe extends WardrobeApp {
  constructor(base, {mode, key}) {
    super({base, id: sampleId(MODULE_ID, key), actions: sampleActions(WardrobeApp, [])});
    this.mode = mode;
    markSample(this);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const {mode} = this;
    const asGM = ["gm", "empty", "token"].includes(mode);
    const worn = context.outfits.find(outfit => outfit.current);
    const notices = [];
    if ( mode === "nofiles" ) notices.push(t("STW.Window.noFiles"));
    else if ( mode === "noupload" ) notices.push(t("STW.Window.noUpload"));
    else if ( mode === "nobrowse" ) notices.push(t("STW.Window.noBrowse"));
    if ( asGM && worn?.disguise ) notices.push(t("STW.Window.disguised", {name: worn.disguise, real: this.base.name}));
    return {
      ...context,
      editable: mode !== "player",
      wearable: true,
      rights: {browse: !["nofiles", "nobrowse"].includes(mode), upload: !["nofiles", "noupload"].includes(mode)},
      notices,
      canStage: asGM && (usableOutfits(getOutfits(this.base)).length > 0),
      wildcard: mode === "token",
      subtitle: (mode === "token") ? t("STW.Window.unlinked") : context.subtitle
    };
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    // Files dropped in would be uploaded: nothing is taken in here
    this.element.addEventListener("drop", stopEvent);
  }
}

/**
 * Open the wardrobe of a sample character.
 * @param {string} character      Key of the character
 * @param {{mode: string, key: string}} options
 * @returns {Promise<Application>}
 */
async function openWardrobeSample(character, {mode, key}) {
  const appId = sampleId(MODULE_ID, key);
  await foundry.applications.instances.get(appId)?.close({animate: false});
  const {actors} = sampleWorld();
  const app = new SampleWardrobe(actors.get(character), {mode, key});
  await app.render({force: true});
  return app;
}

/* -------------------------------------------- */
/*  The stage controls                          */
/* -------------------------------------------- */

/** The stage controls over a made-up stage: choosing a portrait is allowed, everything else says that it does nothing. */
class SampleStage extends StageApp {
  constructor({world, state, backdrops, key}) {
    super({id: sampleId(MODULE_ID, key), actions: sampleActions(StageApp, ["select"])});
    this.world = world;
    this.sampleState = state;
    this.sampleBackdrops = backdrops;
    markSample(this);
  }

  /** @override */
  get source() {
    const {actors, list} = this.world;
    const byId = new Map(list.map(actor => [actor.id, actor]));
    return {
      state: () => foundry.utils.deepClone(this.sampleState),
      target: slot => {
        const base = byId.get(slot.actorId);
        return base ? {base, actor: base, token: null} : null;
      },
      outfits: slot => {
        const base = byId.get(slot.actorId);
        return base ? usableOutfits(getOutfits(base)) : [];
      },
      actors: () => [...actors.values()],
      backdrops: () => this.sampleBackdrops,
      hasTokens: () => false
    };
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    const element = this.element;
    // Keys, drops and the fields of the window would change the stage: only arrows and Tab look around
    element.addEventListener("keydown", event => {
      if ( ["ArrowLeft", "ArrowRight", "Tab"].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey ) return;
      if ( event.target.closest?.("select, input, textarea") ) return;
      stopEvent(event);
    }, true);
    element.addEventListener("drop", stopEvent, true);
    element.addEventListener("change", event => {
      if ( event.target.name === "addActor" ) return;
      event.stopPropagation();
      sampleBlocked();
      this.render();
    }, true);
  }
}

/**
 * Open the stage controls over made-up data.
 * @param {{filled: boolean, key: string}} options
 * @returns {Promise<Application>}
 */
async function openStageSample({filled, key}) {
  const appId = sampleId(MODULE_ID, key);
  await foundry.applications.instances.get(appId)?.close({animate: false});
  const world = sampleWorld();
  const app = new SampleStage({
    world,
    state: filled ? sampleStageState(world.characters, t) : emptyStage(),
    backdrops: filled ? sampleBackdropList(t) : [],
    key
  });
  await app.render({force: true});
  return app;
}

/* -------------------------------------------- */
/*  Palettes, scene, questions                  */
/* -------------------------------------------- */

/**
 * A palette as the token HUD or the popup at a sheet shows it.
 * @param {{id: string, character: string, viewer: object, hud?: boolean, feelings: boolean}} options
 * @returns {Promise<Application>}
 */
async function openPaletteSample({id, title, character, viewer, hud = false, feelings}) {
  const body = () => {
    const {actors} = sampleWorld();
    const palette = createPalette(actors.get(character), "", hud ? "foundry" : setting("theme"),
      {viewer, feelings, reroll: hud ? "sample" : false, prefer: hud ? "token" : "portrait"});
    const frame = document.createElement("div");
    frame.className = "stw-sample-palette";
    frame.style.cssText = "display:flex;justify-content:center;padding:6px 0;";
    palette.style.position = "static";
    frame.append(palette);
    return frame;
  };
  return openSampleHtml({moduleId: MODULE_ID, id, title, body, width: 380});
}

/** The field group of the scene configuration, in a form like the real one. */
async function openSceneSample(title) {
  const body = () => {
    const form = document.createElement("form");
    form.className = "standard-form";
    form.append(sceneOutfitGroup({name: t("STW.Quick.battle"), leave: "restore"}));
    return form;
  };
  return openSampleHtml({moduleId: MODULE_ID, id: "scene", title, body, width: 520});
}

/** Common settings of the questions: the look and the classes of the real dialogs. */
function dialogLook(classes) {
  return (event, dialog) => {
    dialog.element.dataset.stwTheme = setting("theme");
    dialog.element.classList.add("stw-app", ...classes);
  };
}

/**
 * The sample windows of the module (api.samples).
 * @returns {{id: string, label: string, group: string, open: () => Promise<object>}[]}
 */
export function sampleWindows() {
  const entries = [];
  const wardrobe = (id, label, character, mode) => entries.push({
    id, label, group: t("STW.Sample.group.wardrobe"), open: () => openWardrobeSample(character, {mode, key: id})
  });
  wardrobe("wardrobe-gm", t("STW.Sample.wardrobeGm"), "ari", "gm");
  wardrobe("wardrobe-empty", t("STW.Sample.wardrobeEmpty"), "mira", "empty");
  wardrobe("wardrobe-token", t("STW.Sample.wardrobeToken"), "bandit1", "token");
  wardrobe("wardrobe-player", t("STW.Sample.wardrobePlayer"), "tovin", "player");
  wardrobe("wardrobe-nofiles", t("STW.Sample.wardrobeNoFiles"), "sela", "nofiles");
  wardrobe("wardrobe-noupload", t("STW.Sample.wardrobeNoUpload"), "sela", "noupload");
  wardrobe("wardrobe-nobrowse", t("STW.Sample.wardrobeNoBrowse"), "sela", "nobrowse");

  const stage = (id, label, filled) => entries.push({
    id, label, group: t("STW.Sample.group.stage"), open: () => openStageSample({filled, key: id})
  });
  stage("stage", t("STW.Sample.stage"), true);
  stage("stage-empty", t("STW.Sample.stageEmpty"), false);

  const palette = (id, label, options) => entries.push({
    id, label, group: t("STW.Sample.group.palette"), open: () => openPaletteSample({id, title: label, ...options})
  });
  palette("palette-gm", t("STW.Sample.paletteGm"), {character: "ari", viewer: GM_VIEWER, hud: true, feelings: true});
  palette("palette-empty-gm", t("STW.Sample.paletteEmptyGm"), {character: "mira", viewer: GM_VIEWER, feelings: false});
  palette("palette-empty-player", t("STW.Sample.paletteEmptyPlayer"), {character: "mira", viewer: PLAYER_VIEWER, feelings: false});
  entries.push({
    id: "scene", label: t("STW.Sample.scene"), group: t("STW.Sample.group.places"), open: () => openSceneSample(t("STW.Sample.scene"))
  });

  // Questions as the real dialogs: their buttons only say that they do nothing
  const question = (id, label, {title, content, buttons, width, classes = ["stw-auto-dialog"]}) => entries.push({
    id, label, group: t("STW.Sample.group.questions"),
    open: () => openSampleDialog({moduleId: MODULE_ID, id, title: title(), content, buttons: buttons(), width, render: dialogLook(classes)})
  });
  const sampleOutfit = () => {
    const {characters} = sampleWorld();
    return characters.find(character => character.key === "ari").outfits.find(outfit => outfit.auto.hp !== null);
  };
  const saveCancel = () => [
    {label: t("STW.Auto.save"), icon: "fa-solid fa-check", default: true},
    {label: t("STW.Auto.cancel"), icon: "fa-solid fa-xmark"}
  ];
  question("auto", t("STW.Sample.auto"), {
    title: () => t("STW.Auto.title", {name: sampleOutfit().label}),
    content: () => autoFormContent(sampleOutfit()),
    buttons: saveCancel,
    width: 460
  });
  question("variety", t("STW.Sample.variety"), {
    title: () => t("STW.Variety.title", {name: sampleCharacters(t)[0].name}),
    content: () => varietyFormContent({mode: "marked", mirror: true}),
    buttons: saveCancel,
    width: 460
  });
  question("suggest", t("STW.Sample.suggest"), {
    title: () => t("STW.Suggest.title", {name: sampleCharacters(t)[0].name}),
    content: () => suggestContent([SAMPLE_IMAGES.armored, SAMPLE_IMAGES.infantry, SAMPLE_IMAGES.cavalry]),
    buttons: () => [
      {label: t("STW.Suggest.add"), icon: "fa-solid fa-plus", default: true},
      {label: t("STW.Auto.cancel"), icon: "fa-solid fa-xmark"}
    ],
    width: 560,
    classes: ["stw-suggest"]
  });
  question("remove-outfit", t("STW.Sample.removeOutfit"), {
    title: () => t("STW.Card.removeTitle"),
    content: () => `<p>${esc(t("STW.Card.removeText", {name: sampleOutfit().label}))}</p>`,
    buttons: () => [
      {label: game.i18n.localize("Yes"), icon: "fa-solid fa-check"},
      {label: game.i18n.localize("No"), icon: "fa-solid fa-xmark", default: true}
    ],
    width: 400,
    classes: []
  });
  question("backdrop-edit", t("STW.Sample.backdropEdit"), {
    title: () => t("STW.Backdrop.editTitle", {name: sampleBackdropList(t)[0].name}),
    content: () => backdropFormContent(sampleBackdropList(t)[0]),
    buttons: saveCancel,
    width: 520
  });
  question("backdrop-remove", t("STW.Sample.backdropRemove"), {
    title: () => t("STW.Backdrop.removeTitle", {name: sampleBackdropList(t)[0].name}),
    content: () => `<p>${esc(t("STW.Backdrop.removeText", {name: sampleBackdropList(t)[0].name}))}</p>`,
    buttons: () => [
      {label: game.i18n.localize("Yes"), icon: "fa-solid fa-check"},
      {label: game.i18n.localize("No"), icon: "fa-solid fa-xmark", default: true}
    ],
    width: 400,
    classes: []
  });
  return entries;
}
