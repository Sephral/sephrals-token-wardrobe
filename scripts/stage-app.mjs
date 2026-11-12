/**
 * The controls of the conversation stage for the GM: who stands on the stage, one click for another outfit or
 * expression, who is speaking, which side, the backdrop and closing the stage for all. The window is also
 * operated with the keyboard.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, setting, t} from "./config.mjs";
import {layoutStage, BACKDROPS, MAX_SLOTS} from "./stage-logic.mjs";
import {mediaHTML} from "./palette.mjs";
import {usableOutfits} from "./outfits.mjs";
import {getOutfits} from "./store.mjs";
import {EXPRESSION_ICONS, expressionName} from "./wardrobe-app.mjs";
import {addToStage, flipSide, getStage, hideStage, registerControls, removeFromStage, setBackdrop, setExpression,
  setSpeaker, slotOutfits, slotTarget} from "./stage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

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
      closeStage: StageApp.#onClose
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
      backdrops: BACKDROPS.map(value => ({value, label: t(`STW.Stage.backdrop.${value}`), selected: value === state.backdrop}))
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
    try {
      data = JSON.parse(event.dataTransfer?.getData("text/plain") ?? "");
    } catch {
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
}

/* -------------------------------------------- */

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
