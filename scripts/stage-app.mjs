/**
 * The controls of the conversation stage for the GM: who stands on the stage, one click for another outfit or
 * expression, who is speaking, which side, the backdrop and closing the stage for all. The window is also
 * operated with the keyboard.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, esc, setting, t} from "./config.mjs";
import {addBackdrops, getBackdrops, removeBackdrop, updateBackdrop} from "./backdrops.mjs";
import {TINTS} from "./backdrop-logic.mjs";
import {countFeature} from "./usage.mjs";
import {layoutStage, BACKDROPS, MAX_SLOTS, PLACES} from "./stage-logic.mjs";
import {mediaHTML} from "./palette.mjs";
import {usableOutfits} from "./outfits.mjs";
import {getOutfits} from "./store.mjs";
import {EXPRESSION_ICONS, expressionName} from "./wardrobe-app.mjs";
import {addToStage, flipSide, getStage, hideStage, registerControls, removeFromStage, setBackdrop, setDepth, setExpression,
  setPan, setPlace, setSpeaker, setTint, showBackdrop, slotOutfits, slotTarget, stepBackdrop} from "./stage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;

/** The id of the window. */
const APP_ID = `${MODULE_ID}-stage`;

/**
 * The stage window.
 */
export class StageApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** The portrait the keys act on. */
  selected = null;

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["stw-app", "stw-stagectl"],
    tag: "section",
    window: {icon: "fa-solid fa-masks-theater", resizable: true},
    position: {width: 880, height: "auto"},
    actions: {
      express: StageApp.#onExpress,
      speak: StageApp.#onSpeak,
      flip: StageApp.#onFlip,
      remove: StageApp.#onRemove,
      select: StageApp.#onSelect,
      addActor: StageApp.#onAddActor,
      addSelected: StageApp.#onAddSelected,
      closeStage: StageApp.#onClose,
      place: StageApp.#onPlace,
      depth: StageApp.#onDepth,
      backdropShow: StageApp.#onBackdropShow,
      backdropEdit: StageApp.#onBackdropEdit,
      backdropRemove: StageApp.#onBackdropRemove,
      backdropAdd: StageApp.#onBackdropAdd,
      backdropOff: StageApp.#onBackdropOff
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/stage.hbs`, scrollable: [".stw-stage-slots"]}};

  /** @override */
  get title() {
    return t("STW.Stage.title");
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const state = getStage();
    if ( !state.slots.some(s => s.id === this.selected) ) this.selected = state.slots[0]?.id ?? null;
    const layout = new Map(layoutStage(state.slots).map(l => [l.id, l]));
    const slots = state.slots.map(slot => {
      const target = slotTarget(slot);
      const outfits = slotOutfits(slot);
      const real = target?.base.name ?? "";
      return {
        ...slot,
        selected: slot.id === this.selected,
        speaking: state.speaker === slot.id,
        side: layout.get(slot.id)?.side ?? "left",
        sideLabel: t(`STW.Stage.side.${layout.get(slot.id)?.side ?? "left"}`),
        places: PLACES.map(place => ({value: place, label: t(`STW.Stage.side.${place}`), on: (layout.get(slot.id)?.side ?? "left") === place})),
        depthLabel: t(`STW.Stage.depth.${slot.depth}`),
        depthFar: slot.depth > 0,
        imgHTML: mediaHTML(slot.img),
        real: (real && (real !== slot.name)) ? t("STW.Stage.realName", {name: real}) : "",
        exprLabel: slot.expression ? expressionName(slot.expression) : "",
        missing: !target,
        outfits: outfits.map((outfit, index) => ({
          id: outfit.id,
          label: outfit.label,
          active: outfit.id === slot.outfitId,
          key: (index < 9) ? index + 1 : "",
          thumb: mediaHTML(outfit.portrait || outfit.token),
          icon: outfit.expression ? EXPRESSION_ICONS[outfit.expression] : "",
          mood: outfit.expression ? expressionName(outfit.expression) : "",
          disguise: outfit.disguise
        })),
        noOutfits: !outfits.length
      };
    });
    const onStage = new Set(state.slots.map(s => s.actorId));
    const actors = game.actors.contents.filter(a => !onStage.has(a.id) && (usableOutfits(getOutfits(a)).length || a.img))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    const withOutfits = actors.filter(a => usableOutfits(getOutfits(a)).length).map(a => ({id: a.id, name: a.name}));
    const others = actors.filter(a => !usableOutfits(getOutfits(a)).length).map(a => ({id: a.id, name: a.name}));
    return {
      active: state.active,
      slots,
      empty: !slots.length,
      full: slots.length >= MAX_SLOTS,
      subtitle: state.active ? t("STW.Stage.onStage", {count: slots.length}) : t("STW.Stage.offStage"),
      withOutfits,
      others,
      hasTokens: !!canvas?.tokens?.controlled?.some(token => token.actor),
      shadings: BACKDROPS.map(value => ({value, label: t(`STW.Stage.backdrop.${value}`), selected: value === state.backdrop})),
      hasBackdrop: !!state.backdropId,
      pan: state.pan,
      tints: TINTS.map(value => ({value, label: t(`STW.Backdrop.tints.${value}`), selected: value === state.tint})),
      backdrops: getBackdrops().map((backdrop, index) => ({
        ...backdrop,
        active: backdrop.id === state.backdropId,
        thumb: mediaHTML(backdrop.img),
        audio: !!(backdrop.sound || backdrop.playlist),
        key: (index < 9) ? index + 1 : ""
      }))
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    addSettingsGear(frame);
    return frame;
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    const element = this.element;
    element.dataset.stwTheme = setting("theme");
    element.querySelector("select[name=backdrop]")?.addEventListener("change", event => setBackdrop(event.currentTarget.value));
    element.querySelector("select[name=tint]")?.addEventListener("change", event => setTint(event.currentTarget.value));
    element.querySelector("input[name=pan]")?.addEventListener("change", event => setPan(event.currentTarget.checked));
    if ( !element.dataset.stwKeys ) {
      element.dataset.stwKeys = "1";
      element.tabIndex = -1;
      element.addEventListener("keydown", event => this.#onKey(event));
      element.addEventListener("dragover", event => event.preventDefault());
      element.addEventListener("drop", event => this.#onDrop(event));
    }
    // The window keeps the keys after a redraw took the focused button away
    if ( options.isFirstRender || this.#hadFocus ) element.focus({preventScroll: true});
  }

  /** Did the focus sit in the window before the redraw? */
  #hadFocus = false;

  /** @inheritDoc */
  _preRender(context, options) {
    this.#hadFocus = !!this.element?.contains(document.activeElement);
    return super._preRender(context, options);
  }

  /* -------------------------------------------- */
  /*  Keys                                        */
  /* -------------------------------------------- */

  /**
   * The keys of the window: arrows choose the portrait (left, right) and the outfit (up, down), 1 to 9 pick an
   * outfit, S marks the speaker, F changes the side, Delete takes the portrait off the stage.
   * @param {KeyboardEvent} event
   */
  #onKey(event) {
    if ( event.target.closest("input, select, textarea, [contenteditable]") || event.ctrlKey || event.metaKey || event.altKey ) return;
    const state = getStage();
    const index = state.slots.findIndex(s => s.id === this.selected);
    const slot = state.slots[index];
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if ( digit && slot ) {
      handled();
      const outfit = slotOutfits(slot)[Number(digit[1]) - 1];
      if ( outfit ) setExpression(slot.id, outfit.id);
      return;
    }
    switch ( event.key ) {
      case "ArrowLeft":
      case "ArrowRight": {
        if ( !state.slots.length ) return;
        handled();
        const step = (event.key === "ArrowRight") ? 1 : -1;
        const order = layoutStage(state.slots);
        // Walk the stage from the left edge to the right edge
        const sorted = order.slice().sort((a, b) => ((a.side === b.side) ? ((a.side === "left") ? a.pos - b.pos : b.pos - a.pos)
          : ((a.side === "left") ? -1 : 1)));
        const at = sorted.findIndex(o => o.id === this.selected);
        this.#select(sorted[(((at + step) % sorted.length) + sorted.length) % sorted.length].id);
        break;
      }
      case "ArrowUp":
      case "ArrowDown": {
        if ( !slot ) return;
        handled();
        const outfits = slotOutfits(slot);
        if ( !outfits.length ) return;
        const at = outfits.findIndex(o => o.id === slot.outfitId);
        const step = (event.key === "ArrowDown") ? 1 : -1;
        setExpression(slot.id, outfits[(((at + step) % outfits.length) + outfits.length) % outfits.length].id);
        break;
      }
      case "b":
      case "B":
        handled();
        stepBackdrop(event.shiftKey ? -1 : 1);
        break;
      case "s":
      case "S":
        if ( !slot ) return;
        handled();
        setSpeaker(slot.id, true);
        break;
      case "f":
      case "F":
        if ( !slot ) return;
        handled();
        flipSide(slot.id);
        break;
      case "Delete":
      case "Backspace":
        if ( !slot ) return;
        handled();
        removeFromStage(slot.id);
        break;
      default:
    }
  }

  /**
   * Choose the portrait the keys act on.
   * @param {string} id
   */
  #select(id) {
    this.selected = id;
    for ( const card of this.element.querySelectorAll(".stw-stagecard") ) {
      card.classList.toggle("selected", card.dataset.slotId === id);
    }
    this.element.querySelector(`.stw-stagecard[data-slot-id="${id}"]`)?.scrollIntoView({block: "nearest", inline: "nearest"});
  }

  /* -------------------------------------------- */
  /*  Dropping                                    */
  /* -------------------------------------------- */

  /**
   * An actor or token dropped on the window joins the stage.
   * @param {DragEvent} event
   */
  async #onDrop(event) {
    let data = null;
    const raw = event.dataTransfer?.getData("text/plain") ?? "";
    try {
      data = JSON.parse(raw);
    } catch {
      data = /\.[a-z0-9]{2,5}(\?.*)?$/i.test(raw.trim()) ? {src: raw.trim()} : null;
    }
    // A picture dropped on the backdrops joins the library
    const src = data?.src ?? data?.path ?? data?.texture?.src;
    if ( (typeof src === "string") && src && event.target.closest?.(".stw-backdrops") ) {
      event.preventDefault();
      event.stopPropagation();
      const added = await addBackdrops([src]);
      if ( added.length ) countFeature(MODULE_ID, "backdropAdded");
      return;
    }
    if ( !data?.uuid || !["Actor", "Token"].includes(data.type) ) return;
    event.preventDefault();
    event.stopPropagation();
    const doc = await fromUuid(data.uuid);
    if ( doc ) await addToStage(doc);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Show an outfit on a portrait.
   * @this {StageApp}
   */
  static #onExpress(event, target) {
    const id = target.closest("[data-slot-id]")?.dataset.slotId;
    if ( !id ) return;
    this.#select(id);
    setExpression(id, target.dataset.outfitId);
  }

  /**
   * Mark or unmark the speaker.
   * @this {StageApp}
   */
  static #onSpeak(event, target) {
    const id = target.closest("[data-slot-id]")?.dataset.slotId;
    if ( id ) setSpeaker(id, true);
  }

  /**
   * Change the side of a portrait.
   * @this {StageApp}
   */
  static #onFlip(event, target) {
    const id = target.closest("[data-slot-id]")?.dataset.slotId;
    if ( id ) flipSide(id);
  }

  /**
   * Take a portrait off the stage.
   * @this {StageApp}
   */
  static #onRemove(event, target) {
    const id = target.closest("[data-slot-id]")?.dataset.slotId;
    if ( id ) removeFromStage(id);
  }

  /**
   * Choose a portrait for the keys.
   * @this {StageApp}
   */
  static #onSelect(event, target) {
    const id = target.closest("[data-slot-id]")?.dataset.slotId;
    if ( id ) this.#select(id);
  }

  /**
   * Add the actor of the list.
   * @this {StageApp}
   */
  static async #onAddActor() {
    const select = this.element.querySelector("select[name=addActor]");
    if ( !select?.value ) return;
    const id = select.value;
    await addToStage(id);
  }

  /**
   * Add the selected tokens.
   * @this {StageApp}
   */
  static async #onAddSelected() {
    for ( const token of canvas?.tokens?.controlled ?? [] ) if ( token.actor ) await addToStage(token.document);
  }

  /**
   * Close the stage for everybody.
   * @this {StageApp}
   */
  static async #onClose() {
    await hideStage();
  }

  /**
   * Put a portrait at the left, in the center or at the right.
   * @this {StageApp}
   */
  static #onPlace(event, target) {
    const id = target.closest("[data-slot-id]")?.dataset.slotId;
    if ( id ) setPlace(id, target.dataset.place);
  }

  /**
   * Put a portrait further back (and around again).
   * @this {StageApp}
   */
  static #onDepth(event, target) {
    const id = target.closest("[data-slot-id]")?.dataset.slotId;
    if ( id ) setDepth(id, "next");
  }

  /**
   * Show a backdrop of the library.
   * @this {StageApp}
   */
  static #onBackdropShow(event, target) {
    const id = target.closest("[data-backdrop-id]")?.dataset.backdropId;
    if ( id ) showBackdrop(id);
  }

  /**
   * Take the backdrop picture away.
   * @this {StageApp}
   */
  static #onBackdropOff() {
    showBackdrop(null);
  }

  /**
   * Change a backdrop of the library.
   * @this {StageApp}
   */
  static async #onBackdropEdit(event, target) {
    const id = target.closest("[data-backdrop-id]")?.dataset.backdropId;
    const backdrop = getBackdrops().find(b => b.id === id);
    if ( !backdrop ) return;
    const changes = await editBackdrop(backdrop);
    if ( changes ) await updateBackdrop(id, changes);
  }

  /**
   * Take a backdrop out of the library.
   * @this {StageApp}
   */
  static async #onBackdropRemove(event, target) {
    const id = target.closest("[data-backdrop-id]")?.dataset.backdropId;
    const backdrop = getBackdrops().find(b => b.id === id);
    if ( !backdrop ) return;
    const sure = await DialogV2.confirm({
      window: {title: t("STW.Backdrop.removeTitle", {name: backdrop.name})},
      content: `<p>${esc(t("STW.Backdrop.removeText", {name: backdrop.name}))}</p>`,
      rejectClose: false
    });
    if ( !sure ) return;
    if ( getStage().backdropId === id ) await showBackdrop(null);
    await removeBackdrop(id);
  }

  /**
   * Pick a picture and add it to the library.
   * @this {StageApp}
   */
  static #onBackdropAdd() {
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({
      type: "imagevideo",
      callback: async path => {
        const added = await addBackdrops([path]);
        if ( added.length ) countFeature(MODULE_ID, "backdropAdded");
        else ui.notifications.info(t("STW.Backdrop.known"));
      }
    }).render({force: true});
  }
}

/* -------------------------------------------- */

/**
 * Let the GM change a backdrop: name, picture, sound, playlist, time of day and panning.
 * @param {import("./backdrop-logic.mjs").Backdrop} backdrop
 * @returns {Promise<object|null>}
 */
async function editBackdrop(backdrop) {
  const playlists = game.playlists.contents.slice().sort((a, b) => a.name.localeCompare(b.name));
  const options = [`<option value="">${esc(t("STW.Backdrop.noPlaylist"))}</option>`,
    ...playlists.map(p => `<option value="${esc(p.uuid)}" ${(p.uuid === backdrop.playlist) ? "selected" : ""}>${esc(p.name)}</option>`)].join("");
  const tints = TINTS.map(tint => `<option value="${tint}" ${(tint === backdrop.tint) ? "selected" : ""}>${esc(t(`STW.Backdrop.tints.${tint}`))}</option>`).join("");
  const content = document.createElement("div");
  content.innerHTML = `<div class="stw-auto-form stw-backdrop-form">
    <label class="stw-check">${esc(t("STW.Backdrop.name"))} <input type="text" name="name" value="${esc(backdrop.name)}"></label>
    <label class="stw-check">${esc(t("STW.Backdrop.picture"))} <file-picker name="img" type="imagevideo" value="${esc(backdrop.img)}"></file-picker></label>
    <label class="stw-check">${esc(t("STW.Backdrop.sound"))} <file-picker name="sound" type="audio" value="${esc(backdrop.sound)}"></file-picker></label>
    <label class="stw-check">${esc(t("STW.Backdrop.playlist"))} <select name="playlist">${options}</select></label>
    <label class="stw-check">${esc(t("STW.Backdrop.tint"))} <select name="tint">${tints}</select></label>
    <label class="stw-check"><input type="checkbox" name="pan" ${backdrop.pan ? "checked" : ""}> ${esc(t("STW.Backdrop.pan"))}</label>
    <p class="hint">${esc(t("STW.Backdrop.editHint"))}</p></div>`;
  const result = await DialogV2.wait({
    window: {title: t("STW.Backdrop.editTitle", {name: backdrop.name}), icon: "fa-solid fa-image"},
    classes: ["stw-app", "stw-auto-dialog"],
    position: {width: 520},
    content,
    buttons: [{
      action: "save", label: "STW.Auto.save", icon: "fa-solid fa-check", default: true,
      callback: (event, button) => {
        const form = button.form.elements;
        return {name: form.name.value, img: form.img.value || backdrop.img, sound: form.sound.value, playlist: form.playlist.value,
          tint: form.tint.value, pan: form.pan.checked};
      }
    }, {action: "cancel", label: "STW.Auto.cancel", icon: "fa-solid fa-xmark"}],
    render: (event, dialog) => {
      dialog.element.dataset.stwTheme = setting("theme");
    },
    rejectClose: false
  });
  return (result && (typeof result === "object")) ? result : null;
}

/**
 * Open the stage controls, or bring them to the front.
 * @returns {StageApp|null}
 */
export function openStageControls() {
  if ( !game.user.isGM ) {
    ui.notifications.warn(t("STW.Stage.gmOnly"));
    return null;
  }
  const app = foundry.applications.instances.get(APP_ID) ?? new StageApp();
  app.render({force: true});
  return app;
}

/** Redraw the controls when the stage changed. */
function refreshStageControls() {
  const app = foundry.applications.instances.get(APP_ID);
  if ( app?.rendered ) app.render();
}

registerControls({open: openStageControls, refresh: refreshStageControls});

// The button for the selected tokens follows the selection
Hooks.on("controlToken", () => {
  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(refreshStageControls, 80);
});

/** The pause which gathers several selection changes into one redraw. */
let selectionTimer = null;
