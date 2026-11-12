/**
 * The wardrobe at the portrait of an actor sheet: a small button over the portrait (visible when the mouse is over it)
 * opens a palette next to it, one click puts an outfit on. Sheets without a portrait the module knows get an entry
 * in their window menu instead.
 */

import {MODULE_ID, setting, t} from "./config.mjs";
import {openPopup} from "./palette.mjs";
import {canEdit, canWear, getOutfits, resolveTarget, wearableOutfits} from "./store.mjs";
import {countFeature} from "./usage.mjs";
import {openWardrobe} from "./wardrobe-app.mjs";
import {wear} from "./wear.mjs";

/**
 * The elements which show the portrait or token image of an actor on sheets of Foundry and the game systems.
 * dnd5e shows the token image instead of the portrait when its toggle is on, so the token path is listed too.
 */
const PORTRAIT_SELECTORS = [
  'img[data-edit="img"]', 'video[data-edit="img"]',
  'img[data-action="editImage"][data-edit="img"]', 'video[data-action="editImage"][data-edit="img"]',
  'img[data-edit="prototypeToken.texture.src"]', 'video[data-edit="prototypeToken.texture.src"]',
  'img.profile[data-action="editImage"]', 'img.profile-img', 'img.actor-portrait',
  // dnd5e in play mode: the portrait only shows the artwork
  '.portrait img[data-action="showArtwork"]', '.portrait video[data-action="showArtwork"]'
].join(",");

/**
 * The actor of a sheet.
 * @param {Application} app
 * @returns {Actor|null}
 */
function sheetActor(app) {
  const doc = app.document ?? app.actor ?? app.object;
  return (doc?.documentName === "Actor") ? doc : null;
}

/**
 * The target for a sheet: an unlinked token's actor is dressed through its token.
 * @param {Actor} actor
 * @returns {Actor|TokenDocument}
 */
function sheetTarget(actor) {
  return (actor.isToken && actor.token) ? actor.token : actor;
}

/**
 * Hooks "renderActorSheet" and "renderActorSheetV2" (and the sheets of systems based on them): put the button over
 * the portrait.
 * @param {Application} app
 * @param {HTMLElement|jQuery} html
 */
export function onRenderActorSheet(app, html) {
  if ( !setting("sheetButton") ) return;
  const actor = sheetActor(app);
  const root = (html instanceof HTMLElement) ? html : html?.[0];
  if ( !actor || !root ) return;
  const wearable = canWear(actor);
  const editable = canEdit(actor);
  // The button is for putting outfits on. Without outfits only those who can create some are shown it
  if ( !wearable ) return;
  if ( !editable && !wearableOutfits(actor).length ) return;
  const image = Array.from(root.querySelectorAll(PORTRAIT_SELECTORS)).find(el => el.parentElement);
  if ( !image ) return;
  const host = image.parentElement;
  if ( host.querySelector(":scope > .stw-sheet-button") ) return;
  if ( getComputedStyle(host).position === "static" ) host.classList.add("stw-host");
  host.classList.add("stw-has-button");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "stw-sheet-button";
  button.dataset.tooltip = t("STW.Sheet.button");
  button.dataset.tooltipDirection = "UP";
  button.setAttribute("aria-label", t("STW.Sheet.button"));
  button.innerHTML = '<i class="fa-solid fa-shirt" inert></i>';
  // Foundry's sheets handle clicks on the portrait; this one is ours alone
  for ( const type of ["click", "pointerdown", "dblclick"] ) button.addEventListener(type, event => event.stopPropagation());
  button.addEventListener("click", event => {
    event.preventDefault();
    countFeature(MODULE_ID, "sheetPalette");
    const target = sheetTarget(actor);
    openPopup(button, target, {
      wear: id => wear(target, id),
      open: () => openWardrobe(target)
    });
  });
  host.append(button);
}

/**
 * Hooks "getHeaderControlsActorSheetV2": an entry in the window menu of every actor sheet, which opens the wardrobe.
 * @param {ApplicationV2} app
 * @param {object[]} controls
 */
export function onSheetHeaderControls(app, controls) {
  const actor = sheetActor(app);
  if ( !actor || controls.some(c => c.action === "stwWardrobe") ) return;
  app.options.actions.stwWardrobe = () => openWardrobe(sheetTarget(actor));
  controls.push({
    action: "stwWardrobe",
    icon: "fa-solid fa-shirt",
    label: "STW.Sheet.wardrobe",
    visible: canWear(actor) || canEdit(actor)
  });
}

/**
 * Hook "getActorSheetHeaderButtons" of the older sheets: a button in the title bar.
 * @param {Application} app
 * @param {object[]} buttons
 */
export function onSheetHeaderButtons(app, buttons) {
  const actor = sheetActor(app);
  if ( !actor || !(canWear(actor) || canEdit(actor)) ) return;
  buttons.unshift({
    label: t("STW.Sheet.wardrobe"),
    class: "stw-wardrobe-button",
    icon: "fa-solid fa-shirt",
    onclick: () => openWardrobe(sheetTarget(actor))
  });
}

/**
 * Hook "getActorContextOptions": entries in the context menu of the actor directory.
 * @param {ApplicationV2} app
 * @param {object[]} entries
 */
export function onActorContextOptions(app, entries) {
  const actorOf = li => game.actors.get(li?.dataset?.entryId ?? li?.dataset?.documentId ?? li?.data?.("documentId"));
  const visible = li => {
    const actor = actorOf(li);
    return !!actor && (canWear(actor) || canEdit(actor));
  };
  const open = li => {
    const actor = actorOf(li);
    if ( actor ) openWardrobe(actor);
  };
  // Both key sets: Foundry 13 only reads the old names, Foundry 14 warns on them until it drops them in 16
  entries.push({
    name: "STW.Sheet.wardrobe",
    label: "STW.Sheet.wardrobe",
    icon: '<i class="fa-solid fa-shirt"></i>',
    condition: visible,
    visible,
    callback: open,
    onClick: (event, li) => open(li)
  });
}

/** For tests of the module: does a wardrobe exist for this actor? */
export function hasWardrobe(actor) {
  const resolved = resolveTarget(actor);
  return !!resolved && getOutfits(resolved.base).length > 0;
}
