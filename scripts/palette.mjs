/**
 * The palette: small pictures of the outfits, one click puts one on. The same markup is used by the popup at the
 * portrait of a sheet and by the palette of the token HUD.
 */

import {esc, setting, t} from "./config.mjs";
import {feelingsOffered, feelingsRowHTML} from "./feelings.mjs";
import {isVideo} from "./outfits.mjs";
import {canEdit, canWear, currentOutfitId, resolveTarget, wearableOutfits} from "./store.mjs";
import {canReroll} from "./variety.mjs";

/**
 * An image or the first frame of a video.
 * @param {string} src
 * @param {string} [cls]
 * @returns {string}
 */
export function mediaHTML(src, cls="") {
  if ( !src ) return "";
  const css = cls ? ` class="${cls}"` : "";
  if ( isVideo(src) ) return `<video${css} src="${esc(src)}#t=0.1" muted playsinline preload="metadata" inert></video>`;
  return `<img${css} src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false">`;
}

/**
 * The picture of one outfit: the portrait, with the token as a small round picture in the corner. The token HUD shows
 * it the other way round, because there a click changes the token in front of you.
 * @param {import("./outfits.mjs").Outfit} outfit
 * @param {"portrait"|"token"} [prefer="portrait"]   Which picture is the big one
 * @returns {string}
 */
export function thumbHTML(outfit, prefer="portrait") {
  const first = (prefer === "token") ? outfit.token : outfit.portrait;
  const second = (prefer === "token") ? outfit.portrait : outfit.token;
  const main = first || second;
  const bubble = (first && second && (first !== second)) ? second : "";
  return `<span class="stw-thumb">${mediaHTML(main, "stw-main")}${bubble
    ? `<span class="stw-bubble">${mediaHTML(bubble)}</span>` : ""}</span>`;
}

/**
 * The content of a palette.
 * @param {Actor|TokenDocument} target
 * @param {object} [options]
 * @param {boolean} [options.reroll=false]    Offer a new random look (token HUD)
 * @param {"portrait"|"token"} [options.prefer="portrait"]   The big picture of each outfit (token HUD: the token)
 * @returns {string}
 */
export function paletteHTML(target, {reroll = false, prefer = "portrait"} = {}) {
  const resolved = resolveTarget(target);
  if ( !resolved ) return "";
  const {base, actor, token} = resolved;
  const outfits = wearableOutfits(base);
  const current = currentOutfitId(token ?? actor);
  const wearable = canWear(actor);
  const editable = canEdit(actor);
  const tool = (action, icon, label) => `<button type="button" class="stw-tool" data-stw="${action}"
    data-tooltip="${esc(label)}" aria-label="${esc(label)}"><i class="${icon}" inert></i></button>`;
  const head = `<div class="stw-palette-head"><span class="stw-palette-title">${esc(actor.name)}</span>${
    (reroll && canReroll(token)) ? tool("reroll", "fa-solid fa-dice", t("STW.Variety.reroll")) : ""}${
    (game.user.isGM && outfits.length) ? tool("stage", "fa-solid fa-masks-theater", t("STW.Palette.stage")) : ""}${
    (editable || wearable) ? tool("open", "fa-solid fa-shirt", t("STW.Palette.open")) : ""}</div>${
    feelingsOffered(token ?? actor) ? feelingsRowHTML() : ""}`;
  // Whoever may not put on outfits is offered the feelings only
  if ( !wearable && feelingsOffered(token ?? actor) ) return head;
  if ( !outfits.length ) {
    return `${head}<p class="stw-empty">${esc(t(editable ? "STW.Palette.emptyEdit" : "STW.Palette.empty"))}</p>`;
  }
  const columns = Math.min(4, Math.max(1, outfits.length));
  const disabled = wearable ? "" : " disabled";
  const cards = outfits.map(outfit => `<button type="button" class="stw-outfit${(outfit.id === current) ? " active" : ""}"
    data-stw="wear" data-outfit-id="${esc(outfit.id)}" data-tooltip="${esc(outfit.label)}"${disabled}>${thumbHTML(outfit, prefer)}
    <span class="stw-outfit-label">${esc(outfit.label)}</span></button>`).join("");
  return `${head}<div class="stw-palette-grid" style="--stw-columns: ${columns}">${cards}</div>`;
}

/**
 * A palette element for the HUD or the popup.
 * @param {Actor|TokenDocument} target
 * @param {string} [extra]     More classes
 * @param {string} [theme]     The look, the setting by default
 * @returns {HTMLElement}
 */
export function createPalette(target, extra="", theme=setting("theme"), options={}) {
  const element = document.createElement("div");
  element.className = `stw-app stw-palette ${extra}`.trim();
  element.dataset.stwTheme = theme;
  element.innerHTML = paletteHTML(target, options);
  return element;
}

/**
 * Show a palette near an element, over everything else. It closes with a click elsewhere, with Escape or after a
 * choice.
 * @param {HTMLElement} anchor
 * @param {Actor|TokenDocument} target
 * @param {object} handlers
 * @param {(outfitId: string) => void} handlers.wear
 * @param {() => void} handlers.open
 * @param {() => void} [handlers.stage]
 * @param {(feeling: string) => void} [handlers.feel]
 * @returns {{close: () => void, element: HTMLElement}}
 */
export function openPopup(anchor, target, {wear, open, stage, feel}) {
  closePopup();
  const element = createPalette(target, "stw-popup");
  document.body.append(element);
  const place = () => {
    const box = anchor.getBoundingClientRect();
    const own = element.getBoundingClientRect();
    let left = box.right + 6;
    if ( left + own.width > window.innerWidth - 8 ) left = Math.max(8, box.left - own.width - 6);
    if ( left < 8 ) left = 8;
    let top = Math.min(box.top, window.innerHeight - own.height - 8);
    element.style.left = `${left}px`;
    element.style.top = `${Math.max(8, top)}px`;
  };
  place();
  const close = () => {
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    element.remove();
    if ( popup?.element === element ) popup = null;
  };
  const onOutside = event => {
    if ( !element.contains(event.target) && !anchor.contains(event.target) ) close();
  };
  const onKey = event => {
    if ( event.key === "Escape" ) {
      event.stopPropagation();
      close();
    }
  };
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  element.addEventListener("click", event => {
    const button = event.target.closest("[data-stw]");
    if ( !button || button.disabled ) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    if ( button.dataset.stw === "wear" ) wear(button.dataset.outfitId);
    else if ( button.dataset.stw === "open" ) open();
    else if ( button.dataset.stw === "stage" ) stage?.();
    else if ( button.dataset.stw === "feel" ) feel?.(button.dataset.feeling);
  });
  popup = {close, element};
  return popup;
}

/** The open popup, if any. */
let popup = null;

/** Close the popup at a portrait. */
export function closePopup() {
  popup?.close();
}
