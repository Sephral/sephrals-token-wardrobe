/**
 * The palette in the token HUD: right-click a token, open the palette with the shirt button, click an outfit.
 *
 * The palette is opened and closed by the module itself, not through the HUD's own palette bookkeeping: Foundry
 * 13 and 14 look up the element of the active palette while the HUD renders, before any module can add its own
 * elements, which throws when the HUD redraws with a module palette open.
 */

import {MODULE_ID, setting, t} from "./config.mjs";
import {feelingsOffered, setFeeling} from "./feelings.mjs";
import {createPalette, paletteHTML} from "./palette.mjs";
import {canEdit, canWear, wearableOutfits} from "./store.mjs";
import {rerollLook} from "./variety.mjs";
import {countFeature} from "./usage.mjs";
import {addToStage} from "./stage.mjs";
import {openWardrobe} from "./wardrobe-app.mjs";
import {wear} from "./wear.mjs";

/** The UUID of the token whose palette is open, if any. */
let openFor = null;

/**
 * Open or close the palette of the HUD.
 * @param {foundry.applications.hud.TokenHUD} hud
 * @param {boolean} active
 */
function setOpen(hud, active) {
  const element = hud.element;
  if ( !element ) return;
  if ( active ) hud.togglePalette(null);
  element.querySelector(".stw-hud-button")?.classList.toggle("active", active);
  element.querySelector(".stw-hud-palette")?.classList.toggle("active", active);
  openFor = active ? hud.document?.uuid ?? null : null;
}

/**
 * Hook "renderTokenHUD": add the shirt button and its palette.
 * @param {foundry.applications.hud.TokenHUD} hud
 * @param {HTMLElement} element
 */
export function onRenderTokenHUD(hud, element) {
  if ( !setting("hudButton") ) return;
  const token = hud.document;
  const actor = token?.actor;
  if ( !actor ) return;
  const wearable = canWear(actor);
  const editable = canEdit(actor);
  const feels = feelingsOffered(token);
  if ( !wearable && !feels ) return;
  if ( !editable && !wearableOutfits(actor).length && !feels ) return;
  const column = element.querySelector(".col.right");
  if ( !column || column.querySelector(".stw-hud-button") ) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon stw-hud-button";
  button.dataset.tooltip = "";
  button.setAttribute("aria-label", t("STW.HUD.button"));
  button.innerHTML = '<i class="fa-solid fa-shirt" inert></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(hud, openFor !== token.uuid);
  });

  const palette = createPalette(token, "palette stw-hud-palette", "foundry", {reroll: true, prefer: "token"});
  palette.addEventListener("click", event => onPaletteClick(event, hud, token));
  column.append(button, palette);
  // Another palette of the HUD closes this one
  for ( const other of element.querySelectorAll('[data-action="togglePalette"]') ) {
    other.addEventListener("click", () => {
      if ( openFor ) setOpen(hud, false);
    });
  }
  if ( openFor === token.uuid ) setOpen(hud, true);
  else openFor = null;
}

/**
 * Hook "closeTokenHUD": the palette is closed with the HUD.
 */
export function onCloseTokenHUD() {
  if ( !pendingReopen ) openFor = null;
}

/**
 * Handle a click in the palette.
 * @param {PointerEvent} event
 * @param {foundry.applications.hud.TokenHUD} hud
 * @param {TokenDocument} token
 */
async function onPaletteClick(event, hud, token) {
  const target = event.target.closest("[data-stw]");
  if ( !target || target.disabled ) return;
  event.preventDefault();
  event.stopPropagation();
  if ( target.dataset.stw === "open" ) {
    setOpen(hud, false);
    openWardrobe(token);
    return;
  }
  if ( target.dataset.stw === "stage" ) {
    setOpen(hud, false);
    addToStage(token, {open: true});
    return;
  }
  if ( target.dataset.stw === "feel" ) {
    reopenAfterRedraw(hud, token);
    await setFeeling(token, target.dataset.feeling || null);
    refreshPalette(hud, token);
    return;
  }
  if ( target.dataset.stw === "reroll" ) {
    reopenAfterRedraw(hud, token);
    await rerollLook(token);
    refreshPalette(hud, token);
    return;
  }
  if ( target.dataset.stw !== "wear" ) return;
  reopenAfterRedraw(hud, token);
  countFeature(MODULE_ID, "hudWear");
  await wear(token, target.dataset.outfitId);
  refreshPalette(hud, token);
}

/**
 * A new texture makes Foundry redraw the token at the end of its transition, which can close the HUD. Reopen it with
 * the palette, so the next outfit is one click away.
 * @param {foundry.applications.hud.TokenHUD} hud
 * @param {TokenDocument} token
 */
function reopenAfterRedraw(hud, token) {
  pendingReopen?.cancel();
  let timeout;
  const hookId = Hooks.on("drawToken", async placeable => {
    if ( placeable.document !== token ) return;
    pendingReopen.cancel();
    if ( (hud.rendered && (hud.document !== token)) || (placeable.scene !== canvas.scene) ) return;
    openFor = token.uuid;
    await hud.bind(placeable);
    setOpen(hud, true);
  });
  pendingReopen = {cancel: () => {
    Hooks.off("drawToken", hookId);
    clearTimeout(timeout);
    pendingReopen = null;
  }};
  timeout = setTimeout(() => pendingReopen?.cancel(), 10000);
}

/** The reopening that waits for the next redraw, if any. */
let pendingReopen = null;

/**
 * Update the palette in place after a switch, if the HUD did not re-render on its own.
 * @param {foundry.applications.hud.TokenHUD} hud
 * @param {TokenDocument} token
 */
function refreshPalette(hud, token) {
  const old = hud.element?.querySelector(".stw-hud-palette");
  if ( !old || (hud.document !== token) ) return;
  old.innerHTML = paletteHTML(token, {reroll: true, prefer: "token"});
}

/** Re-render an open token HUD, e.g. after a setting changed. */
export function refreshTokenHUD() {
  const hud = canvas?.hud?.token;
  if ( !hud?.rendered ) return;
  hud.render();
}
