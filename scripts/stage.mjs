/**
 * The conversation stage: the GM brings character portraits big onto every screen, visual novel style, switches the
 * expression of a portrait with one click, marks who is speaking and closes the stage for all.
 *
 * The stage is stored in one hidden world setting. A GM writes it, every client redraws when the setting changes, and
 * a client which connects later reads the current stage. Players cannot write world settings, so they cannot change
 * the stage.
 */

import {MODULE_ID, makeId, setting, t} from "./config.mjs";
import {trace} from "./debug.mjs";
import {isVideo, stageName, usableOutfits} from "./outfits.mjs";
import {emptyStage, layoutStage, normalizeStage, resolveExpression, sameSubject, stageMetrics, startOutfit, withSlot,
  withSpeaker, withoutSlot, changeSlot, MAX_SLOTS} from "./stage-logic.mjs";
import {baseOf, currentOutfitId, getOutfits, resolveTarget} from "./store.mjs";
import {countFeature} from "./usage.mjs";
import {wear} from "./wear.mjs";

/** The hidden world setting which holds the stage. */
export const STAGE_SETTING = "stage";

/** The event after the stage changed on this client: `sephrals-token-wardrobe.stage`, with the state. */
export const STAGE_HOOK = `${MODULE_ID}.stage`;

/** Opens the controls window of the GM, set by that window's module. */
const controls = {open: () => null, refresh: () => {}};

/**
 * Let the window module register how it opens and redraws.
 * @param {{open: Function, refresh: Function}} handlers
 */
export function registerControls(handlers) {
  Object.assign(controls, handlers);
}

/* -------------------------------------------- */
/*  State                                       */
/* -------------------------------------------- */

/**
 * The stage as it is stored.
 * @returns {import("./stage-logic.mjs").StageState}
 */
export function getStage() {
  return normalizeStage(game.settings.get(MODULE_ID, STAGE_SETTING), makeId);
}

/** Running changes, one after the other. */
let chain = Promise.resolve();

/**
 * Change the stage: the change is made on the stage as it is when its turn comes.
 * @param {(state: import("./stage-logic.mjs").StageState) => (import("./stage-logic.mjs").StageState|Promise<import("./stage-logic.mjs").StageState>)} change
 * @returns {Promise<import("./stage-logic.mjs").StageState|null>}
 */
function mutate(change) {
  if ( !game.user.isGM ) {
    ui.notifications.warn(t("STW.Stage.gmOnly"));
    return Promise.resolve(null);
  }
  const job = chain.catch(() => {}).then(async () => {
    const before = getStage();
    const next = normalizeStage(await change(before), makeId);
    if ( JSON.stringify(next) !== JSON.stringify(before) ) await game.settings.set(MODULE_ID, STAGE_SETTING, next);
    return next;
  });
  chain = job.catch(() => {});
  return job;
}

/* -------------------------------------------- */
/*  Portraits                                   */
/* -------------------------------------------- */

/**
 * Who a call is about: an actor, a token, a UUID, the id or name of a world actor.
 * @param {Actor|Token|TokenDocument|string|null} target
 * @returns {import("./store.mjs").WardrobeTarget|null}
 */
export function stageTarget(target) {
  if ( typeof target === "string" ) {
    target = game.actors.get(target) ?? game.actors.getName(target) ?? fromUuidSync(target, {strict: false});
  }
  return resolveTarget(target);
}

/**
 * The stage portrait of a character with one of its outfits.
 * @param {import("./store.mjs").WardrobeTarget} resolved
 * @param {string|number|null} ref         The outfit asked for, by id, name, position or mood
 * @param {import("./stage-logic.mjs").StageSlot} [previous]   The portrait it replaces
 * @returns {import("./stage-logic.mjs").StageSlot|null}
 */
function slotFor({base, actor, token}, ref, previous = null) {
  const outfits = getOutfits(base);
  const wornId = currentOutfitId(token ?? actor);
  const outfit = startOutfit(outfits, ref, wornId);
  const img = outfit ? (outfit.portrait || outfit.token) : (actor.img || base.img);
  if ( !img ) return null;
  const worn = outfits.find(o => o.id === wornId) ?? null;
  const unlinked = token && !token.actorLink;
  const realName = unlinked ? (token.getFlag(MODULE_ID, "realName") ?? token.name) : base.name;
  return {
    id: previous?.id ?? makeId(),
    actorId: base.id,
    tokenUuid: unlinked ? token.uuid : "",
    name: stageName(realName, outfit, worn),
    img,
    outfitId: outfit?.id ?? null,
    expression: outfit?.expression ?? "",
    side: previous?.side ?? null
  };
}

/**
 * The world actor and outfits behind a portrait.
 * @param {import("./stage-logic.mjs").StageSlot} slot
 * @returns {import("./store.mjs").WardrobeTarget|null}
 */
export function slotTarget(slot) {
  const token = slot.tokenUuid ? fromUuidSync(slot.tokenUuid, {strict: false}) : null;
  return resolveTarget(token?.documentName === "Token" ? token : game.actors.get(slot.actorId));
}

/**
 * Find the portrait of a character on the stage.
 * @param {import("./stage-logic.mjs").StageState} state
 * @param {Actor|Token|TokenDocument|string} target     Or the id of a portrait
 * @returns {import("./stage-logic.mjs").StageSlot|null}
 */
export function findSlot(state, target) {
  if ( (typeof target === "string") && state.slots.some(s => s.id === target) ) return state.slots.find(s => s.id === target);
  const resolved = stageTarget(target);
  if ( !resolved ) return null;
  const tokenUuid = (resolved.token && !resolved.token.actorLink) ? resolved.token.uuid : "";
  return state.slots.find(s => sameSubject(s, resolved.base.id, tokenUuid))
    ?? state.slots.find(s => s.actorId === resolved.base.id) ?? null;
}

/* -------------------------------------------- */
/*  Changing the stage                          */
/* -------------------------------------------- */

/**
 * Bring a character onto the stage (or change its portrait when it is there already).
 * @param {Actor|Token|TokenDocument|string} target
 * @param {object} [options]
 * @param {string|number} [options.outfit]       The outfit to show: id, name, position or mood
 * @param {"left"|"right"} [options.side]
 * @param {boolean} [options.speaking]           Mark the character as the speaker
 * @param {boolean} [options.open=false]         Open the controls of the GM
 * @returns {Promise<import("./stage-logic.mjs").StageState|null>}
 */
export async function addToStage(target, {outfit = null, side = null, speaking = false, open = false} = {}) {
  const resolved = stageTarget(target);
  if ( !resolved ) {
    ui.notifications.warn(t("STW.Notify.noTarget"));
    return null;
  }
  let added = null;
  let full = false;
  const state = await mutate(before => {
    const old = findSlot(before, resolved.token ?? resolved.base);
    const slot = slotFor(resolved, outfit, old);
    if ( !slot ) return before;
    if ( side ) slot.side = side;
    if ( !old && (before.slots.length >= MAX_SLOTS) ) {
      full = true;
      return before;
    }
    let next = withSlot({...before, active: true, backdrop: before.active ? before.backdrop : setting("stageBackdrop")}, slot);
    added = next.slots.find(s => sameSubject(s, slot.actorId, slot.tokenUuid));
    if ( speaking ) next = withSpeaker(next, added.id);
    return next;
  });
  if ( !state ) return null;
  if ( full ) ui.notifications.warn(t("STW.Stage.full", {max: MAX_SLOTS}));
  else if ( !added ) ui.notifications.warn(t("STW.Stage.noImage", {name: resolved.actor.name}));
  else countFeature(MODULE_ID, "stageShown");
  trace.add("stage: add", {actor: resolved.base.name});
  if ( open ) controls.open();
  return state;
}

/**
 * Show a stage with these characters.
 * @param {Array<Actor|Token|TokenDocument|string|{actor: (Actor|Token|TokenDocument|string), outfit?: (string|number), side?: string}>} actors
 * @param {object} [options]
 * @param {boolean} [options.replace=true]       Start with an empty stage. Off: add to the one which is there
 * @param {Actor|Token|TokenDocument|string} [options.speaker]    Who speaks
 * @param {"soft"|"dark"|"none"} [options.backdrop]
 * @param {boolean} [options.open=false]         Open the controls of the GM
 * @returns {Promise<import("./stage-logic.mjs").StageState|null>}
 */
export async function showStage(actors, {replace = true, speaker = null, backdrop = null, open = false} = {}) {
  const list = (Array.isArray(actors) ? actors : [actors]).filter(Boolean);
  // A plain object {actor, outfit, side} names more than the character, everything else is the character
  const entries = list.map(entry => ((Object.getPrototypeOf(entry) === Object.prototype) && ("actor" in entry) ? entry : {actor: entry}));
  const prepared = entries.map(entry => ({entry, resolved: stageTarget(entry.actor)})).filter(e => e.resolved);
  if ( !prepared.length ) {
    ui.notifications.warn(t("STW.Notify.noTarget"));
    return null;
  }
  const state = await mutate(before => {
    let next = replace ? emptyStage(backdrop ?? setting("stageBackdrop")) : {...before, backdrop: backdrop ?? before.backdrop};
    for ( const {entry, resolved} of prepared ) {
      const old = findSlot(next, resolved.token ?? resolved.base);
      const slot = slotFor(resolved, entry.outfit ?? null, old);
      if ( !slot ) continue;
      if ( entry.side ) slot.side = entry.side;
      next = withSlot({...next, active: true}, slot);
    }
    if ( speaker ) {
      const slot = findSlot(next, speaker);
      if ( slot ) next = withSpeaker(next, slot.id);
    }
    return next;
  });
  if ( state?.active ) countFeature(MODULE_ID, "stageShown");
  if ( open ) controls.open();
  return state;
}

/**
 * Close the stage for everybody.
 * @returns {Promise<import("./stage-logic.mjs").StageState|null>}
 */
export function hideStage() {
  return mutate(() => emptyStage(setting("stageBackdrop")));
}

/**
 * Take a character off the stage.
 * @param {Actor|Token|TokenDocument|string} target     Or the id of a portrait
 * @returns {Promise<import("./stage-logic.mjs").StageState|null>}
 */
export function removeFromStage(target) {
  return mutate(before => {
    const slot = findSlot(before, target);
    return slot ? withoutSlot(before, slot.id) : before;
  });
}

/**
 * Show another outfit or expression on a character of the stage.
 * @param {Actor|Token|TokenDocument|string} target     Or the id of a portrait
 * @param {string|number} ref                           Outfit id, name, position or a mood such as "angry"
 * @returns {Promise<import("./stage-logic.mjs").StageSlot|null>}   The new portrait, null when nothing changed
 */
export async function setExpression(target, ref) {
  let changed = null;
  await mutate(before => {
    const slot = findSlot(before, target);
    const resolved = slot ? slotTarget(slot) : null;
    if ( !slot || !resolved ) return before;
    const outfit = resolveExpression(getOutfits(resolved.base), ref);
    if ( !outfit ) return before;
    const next = slotFor(resolved, outfit.id, slot);
    if ( !next ) return before;
    changed = {...next, side: slot.side};
    return changeSlot(before, slot.id, changed);
  });
  if ( !changed ) return null;
  countFeature(MODULE_ID, "stageExpression");
  if ( setting("stageWear") ) {
    const resolved = slotTarget(changed);
    if ( resolved ) await wear(resolved.token ?? resolved.actor, changed.outfitId, {notify: false});
  }
  return changed;
}

/**
 * Mark who is speaking, or nobody.
 * @param {Actor|Token|TokenDocument|string|null} target     Or the id of a portrait
 * @param {boolean} [toggle=false]                          Marking the speaker again takes the mark off
 * @returns {Promise<import("./stage-logic.mjs").StageState|null>}
 */
export function setSpeaker(target, toggle = false) {
  return mutate(before => {
    if ( !target ) return withSpeaker(before, null);
    const slot = findSlot(before, target);
    return slot ? withSpeaker(before, slot.id, toggle) : before;
  });
}

/**
 * Put a portrait on the other side.
 * @param {string} id     The id of the portrait
 * @returns {Promise<import("./stage-logic.mjs").StageState|null>}
 */
export function flipSide(id) {
  return mutate(before => {
    const layout = layoutStage(before.slots);
    const target = layout.find(l => l.id === id);
    if ( !target ) return before;
    // Every portrait keeps the side it stands on, so only the chosen one moves
    const slots = before.slots.map(s => ({...s, side: layout.find(l => l.id === s.id).side}));
    return {...before, slots: slots.map(s => ((s.id === id) ? {...s, side: (target.side === "left") ? "right" : "left"} : s))};
  });
}

/**
 * Change the backdrop.
 * @param {"soft"|"dark"|"none"} backdrop
 * @returns {Promise<import("./stage-logic.mjs").StageState|null>}
 */
export function setBackdrop(backdrop) {
  return mutate(before => ({...before, backdrop}));
}

/**
 * Update the portraits and names after an outfit or a disguise changed. Only the active GM does it.
 */
export function refreshSlots() {
  if ( !game.user.isGM || (game.users.activeGM?.id !== game.user.id) ) return;
  const state = getStage();
  if ( !state.active ) return;
  mutate(before => {
    let next = before;
    for ( const slot of before.slots ) {
      const resolved = slotTarget(slot);
      if ( !resolved ) continue;
      const fresh = slotFor(resolved, slot.outfitId ?? null, slot);
      if ( fresh ) next = changeSlot(next, slot.id, fresh);
    }
    return next;
  }).catch(err => console.error(`${MODULE_ID} | The stage could not be refreshed`, err));
}

/* -------------------------------------------- */
/*  Outfits of a stage character                */
/* -------------------------------------------- */

/**
 * The outfits a stage character can show.
 * @param {import("./stage-logic.mjs").StageSlot} slot
 * @returns {import("./outfits.mjs").Outfit[]}
 */
export function slotOutfits(slot) {
  const resolved = slotTarget(slot);
  return resolved ? usableOutfits(getOutfits(resolved.base)) : [];
}

/* -------------------------------------------- */
/*  The screen                                  */
/* -------------------------------------------- */

/** The element over the canvas. */
let overlay = null;

/** The portraits on screen by id of the slot. */
const figures = new Map();

/** The last stage drawn. */
let drawn = null;

/**
 * An image or a looping video for a portrait.
 * @param {string} src
 * @returns {HTMLElement}
 */
function createMedia(src) {
  if ( isVideo(src) ) {
    const video = document.createElement("video");
    Object.assign(video, {src, muted: true, loop: true, autoplay: true, playsInline: true});
    return video;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.src = src;
  return img;
}

/**
 * The overlay, created on first use below Foundry's own interface (windows and the sidebar stay on top).
 * @returns {HTMLElement}
 */
function ensureOverlay() {
  if ( overlay?.isConnected ) return overlay;
  overlay = document.createElement("div");
  overlay.id = "stw-stage";
  overlay.className = "stw-stage";
  overlay.setAttribute("role", "region");
  overlay.setAttribute("aria-label", t("STW.Stage.title"));
  overlay.innerHTML = '<div class="stw-backdrop"></div><div class="stw-actors"></div>';
  const anchor = document.getElementById("interface");
  if ( anchor ) anchor.before(overlay);
  else document.body.append(overlay);
  new ResizeObserver(() => layoutNow()).observe(overlay);
  const sidebar = document.getElementById("sidebar");
  if ( sidebar ) new ResizeObserver(() => layoutNow()).observe(sidebar);
  return overlay;
}

/**
 * Keep the stage out from under the sidebar.
 */
function reserveSidebar() {
  const sidebar = document.getElementById("sidebar");
  let inset = 0;
  if ( sidebar ) {
    const box = sidebar.getBoundingClientRect();
    if ( box.width > 0 ) inset = Math.max(0, Math.round(window.innerWidth - box.left));
  }
  overlay.style.setProperty("--stw-inset", `${Math.min(inset, Math.round(window.innerWidth * 0.4))}px`);
}

/**
 * Set the sizes of the stage for the screen and the portraits on it.
 */
function layoutNow() {
  if ( !overlay || !drawn ) return;
  reserveSidebar();
  const box = overlay.getBoundingClientRect();
  const layout = layoutStage(drawn.slots);
  const scale = {small: 0.8, normal: 1, large: 1.2}[setting("stageScale")] ?? 1;
  const metrics = stageMetrics({width: box.width, height: box.height, scale,
    left: layout.filter(l => l.side === "left").length, right: layout.filter(l => l.side === "right").length});
  for ( const [name, value] of Object.entries({h: metrics.h, w: metrics.w, edge: metrics.edge, step: metrics.step}) ) {
    overlay.style.setProperty(`--stw-${name}`, `${value}px`);
  }
  for ( const place of layout ) {
    const figure = figures.get(place.id);
    if ( !figure ) continue;
    figure.dataset.side = place.side;
    figure.style.setProperty("--stw-pos", place.pos);
    figure.style.zIndex = String(10 + place.pos + ((drawn.speaker === place.id) ? 50 : 0));
  }
}

/**
 * Put a new picture into a portrait, fading it over the old one.
 * @param {HTMLElement} figure
 * @param {string} src
 */
async function setMedia(figure, src) {
  const box = figure.querySelector(".stw-picture");
  box.dataset.src = src;
  const media = createMedia(src);
  media.classList.add("stw-media", "stw-fresh");
  box.append(media);
  try {
    if ( media instanceof HTMLImageElement ) await media.decode();
  } catch {
    // The picture is missing: the empty box stays, the plate still names the character
  }
  if ( box.dataset.src !== src ) {
    media.remove();
    return;
  }
  requestAnimationFrame(() => media.classList.remove("stw-fresh"));
  const old = Array.from(box.querySelectorAll(".stw-media")).filter(m => m !== media);
  setTimeout(() => old.forEach(m => m.remove()), 450);
}

/**
 * Redraw the stage on this screen from the stored state.
 */
export function renderStage() {
  const state = getStage();
  const show = state.active && setting("stageShow") && state.slots.length;
  const previous = drawn;
  if ( !show ) {
    if ( !overlay ) {
      controls.refresh();
      return;
    }
    for ( const [id, figure] of figures ) {
      figure.classList.add("leaving");
      setTimeout(() => figure.remove(), 450);
      figures.delete(id);
    }
    overlay.classList.remove("active");
    drawn = null;
    setTimeout(() => {
      if ( !drawn ) overlay?.remove();
    }, 500);
    if ( previous ) Hooks.callAll(STAGE_HOOK, state);
    controls.refresh();
    return;
  }
  const element = ensureOverlay();
  drawn = state;
  element.dataset.backdrop = state.backdrop;
  element.classList.toggle("has-speaker", !!state.speaker);
  const holder = element.querySelector(".stw-actors");
  const ids = new Set(state.slots.map(s => s.id));
  for ( const [id, figure] of figures ) {
    if ( ids.has(id) ) continue;
    figure.classList.add("leaving");
    setTimeout(() => figure.remove(), 450);
    figures.delete(id);
  }
  for ( const slot of state.slots ) {
    let figure = figures.get(slot.id);
    const isNew = !figure;
    if ( isNew ) {
      figure = document.createElement("figure");
      figure.className = "stw-actor entering";
      figure.dataset.slotId = slot.id;
      figure.innerHTML = '<div class="stw-picture"></div><figcaption class="stw-plate"><span class="stw-plate-name"></span><small class="stw-plate-real"></small></figcaption>';
      holder.append(figure);
      figures.set(slot.id, figure);
      requestAnimationFrame(() => requestAnimationFrame(() => figure.classList.remove("entering")));
    }
    figure.dataset.expression = slot.expression;
    figure.classList.toggle("speaking", state.speaker === slot.id);
    figure.querySelector(".stw-plate-name").textContent = slot.name;
    // The GM also sees who is behind a disguise
    const real = game.user.isGM ? (game.actors.get(slot.actorId)?.name ?? "") : "";
    const hint = figure.querySelector(".stw-plate-real");
    hint.textContent = (real && (real !== slot.name)) ? t("STW.Stage.realName", {name: real}) : "";
    if ( figure.querySelector(".stw-picture").dataset.src !== slot.img ) setMedia(figure, slot.img);
  }
  element.classList.add("active");
  layoutNow();
  Hooks.callAll(STAGE_HOOK, state);
  controls.refresh();
}

/**
 * Start the stage on this client. Call in "ready".
 */
export function startStage() {
  renderStage();
  window.addEventListener("resize", () => layoutNow());
  Hooks.on("updateActor", (actor, changes) => {
    if ( !changes?.flags?.[MODULE_ID] && !("name" in changes) && !("img" in changes) ) return;
    if ( getStage().slots.some(s => s.actorId === baseOf(actor)?.id) ) setTimeout(refreshSlots, 150);
  });
  Hooks.on("updateToken", token => {
    if ( !token.actorLink && getStage().slots.some(s => s.tokenUuid === token.uuid) ) setTimeout(refreshSlots, 150);
  });
  Hooks.on("deleteActor", actor => {
    if ( game.user.isGM && getStage().slots.some(s => s.actorId === actor.id) ) {
      mutate(before => before.slots.reduce((state, s) => ((s.actorId === actor.id) ? withoutSlot(state, s.id) : state), before));
    }
  });
}
