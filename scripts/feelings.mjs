/**
 * Feelings of the players: a player picks a feeling for the own character (palette button or keys). A symbol floats
 * over the token on every screen and over the portrait on the conversation stage, and if the character has an outfit
 * with a matching mood, the look switches to it for a while or until it is changed.
 *
 * The symbol is shown through the module socket: the sender names the feeling, every client checks that the sender
 * owns the character before it draws anything. The outfit is written by the sender with the rights the player has
 * (the existing setting for players putting on outfits); the other scenes of a linked token are done by the active
 * GM through the usual relay of `wear`.
 */

import {MODULE_ID, SOCKET, esc, setting, t} from "./config.mjs";
import {trace} from "./debug.mjs";
import {FEELINGS, FEELING_KEYS, feelingDuration, feelingKey, outfitForFeeling, parseFeelingMessage, planFeeling} from "./feelings-logic.mjs";
import {canWear, currentOutfitId, getOutfits, resolveTarget} from "./store.mjs";
import {setStageFeeling, stageTarget} from "./stage.mjs";
import {countFeature} from "./usage.mjs";
import {wear} from "./wear.mjs";

/** The event when a feeling is shown or taken away on this client: `sephrals-token-wardrobe.feeling`. */
export const FEELING_HOOK = `${MODULE_ID}.feeling`;

/** The timers which bring the old look back, by world actor id (and token for unlinked ones). */
const returns = new Map();

/** The feelings on the canvas by token id. */
const bubbles = new Map();

/** The font of the symbols. */
const FONT = "\"Segoe UI Emoji\", \"Apple Color Emoji\", \"Noto Color Emoji\", \"Twemoji Mozilla\", sans-serif";

/* -------------------------------------------- */
/*  Rights                                      */
/* -------------------------------------------- */

/**
 * May a user show a feeling for a character? The GM always, a player when the feelings are on and the player owns
 * the character.
 * @param {Actor} actor       The world actor
 * @param {User} [user]
 * @returns {boolean}
 */
export function canFeel(actor, user = game.user) {
  if ( !actor || !user ) return false;
  if ( user.isGM ) return true;
  return !!setting("feelings") && actor.testUserPermission(user, "OWNER");
}

/**
 * Are the feelings offered to the current user for a target (for the palettes)?
 * @param {Actor|TokenDocument|null} target
 * @returns {boolean}
 */
export function feelingsOffered(target) {
  if ( !setting("feelings") ) return false;
  const resolved = resolveTarget(target);
  return !!resolved && canFeel(resolved.base);
}

/* -------------------------------------------- */
/*  The palette row                             */
/* -------------------------------------------- */

/**
 * The row of feelings for a palette: one button per feeling and one to clear it.
 * @returns {string}
 */
export function feelingsRowHTML() {
  const buttons = FEELING_KEYS.map((key, index) => {
    const label = t(`STW.Feeling.${key}`);
    return `<button type="button" class="stw-feel-btn" data-stw="feel" data-feeling="${key}" data-tooltip="${esc(label)} (Shift+Alt+${index + 1})"
      aria-label="${esc(label)}">${FEELINGS[key].symbol}</button>`;
  }).join("");
  const clear = `<button type="button" class="stw-feel-btn stw-feel-clear" data-stw="feel" data-feeling=""
    data-tooltip="${esc(t("STW.Feeling.clear"))}" aria-label="${esc(t("STW.Feeling.clear"))}"><i class="fa-solid fa-xmark" inert></i></button>`;
  return `<div class="stw-feel-row" role="group" aria-label="${esc(t("STW.Feeling.title"))}">
    <span class="stw-feel-title">${esc(t("STW.Feeling.title"))}</span>${buttons}${clear}</div>`;
}

/* -------------------------------------------- */
/*  Showing a feeling                           */
/* -------------------------------------------- */

/**
 * Who is meant: the key of the timers and the content of the message.
 * @param {import("./store.mjs").WardrobeTarget} resolved
 * @returns {{actorId: string, tokenUuid: string, key: string}}
 */
function subject({base, token}) {
  const tokenUuid = (token && !token.actorLink) ? token.uuid : "";
  return {actorId: base.id, tokenUuid, key: tokenUuid || base.id};
}

/**
 * Show a feeling for a character or a token, and put on the outfit which answers it.
 * @param {Actor|TokenDocument|Token|string} target
 * @param {string|number|null} ref         A feeling by name or number, null or "" takes it away
 * @param {object} [options]
 * @param {boolean} [options.notify=true]
 * @returns {Promise<{feeling: (string|null), outfit: (object|null)}|null>}
 */
export async function setFeeling(target, ref, {notify = true} = {}) {
  const resolved = stageTarget(target);
  if ( !resolved ) {
    if ( notify ) ui.notifications.warn(t("STW.Notify.noTarget"));
    return null;
  }
  const {base, actor, token} = resolved;
  if ( !setting("feelings") && !game.user.isGM ) {
    if ( notify ) ui.notifications.info(t("STW.Feeling.off"));
    return null;
  }
  if ( !canFeel(base) ) {
    if ( notify ) ui.notifications.warn(t("STW.Feeling.noRight", {name: actor.name}));
    return null;
  }
  const empty = (ref === null) || (ref === undefined) || (ref === "");
  const feeling = empty ? null : feelingKey(ref);
  if ( !empty && !feeling ) return null;
  const who = subject(resolved);
  const seconds = Number(setting("feelingSeconds")) || 0;
  clearTimeout(returns.get(who.key));
  returns.delete(who.key);

  // The symbol, here and on the other screens
  const message = {type: "feel", actorId: who.actorId, tokenUuid: who.tokenUuid, feeling, seconds};
  display(message);
  game.socket.emit(SOCKET, message);
  if ( feeling ) countFeature(MODULE_ID, "feelingShown");
  trace.add("feeling", {actor: base.name, feeling});

  // The outfit
  let outfit = null;
  const target2 = token ?? actor;
  const stored = actor.getFlag(MODULE_ID, "feelBack") ?? null;
  if ( feeling && canWear(actor) ) {
    const wanted = outfitForFeeling(getOutfits(base), feeling);
    const plan = planFeeling({current: currentOutfitId(target2), back: stored, wanted: wanted?.id ?? null});
    if ( plan.wear ) {
      const result = await wear(target2, plan.wear, {source: "feeling", back: plan.back, notify: false});
      outfit = result?.outfit ?? null;
      if ( outfit ) countFeature(MODULE_ID, "feelingOutfit");
    }
    const ms = feelingDuration(seconds);
    if ( wanted && ms ) returns.set(who.key, setTimeout(() => giveBack(resolveTarget(target2)).catch(() => {}), ms));
  } else if ( !feeling ) {
    await giveBack(resolved);
  }
  return {feeling, outfit};
}

/**
 * Take the outfit of a feeling off: the look from before comes back.
 * @param {import("./store.mjs").WardrobeTarget|null} resolved
 */
async function giveBack(resolved) {
  if ( !resolved ) return;
  const {base, actor, token} = resolved;
  const back = actor.getFlag(MODULE_ID, "feelBack") ?? null;
  if ( !back || !canWear(actor) ) return;
  const known = getOutfits(base).some(o => o.id === back);
  await wear(token ?? actor, known ? back : null, {source: "feeling", back: null, notify: false}).catch(() => null);
  if ( !known ) await actor.setFlag(MODULE_ID, "feelBack", null).catch(() => null);
}

/* -------------------------------------------- */
/*  Drawing                                     */
/* -------------------------------------------- */

/**
 * Show or remove a feeling on this screen: over the tokens and on the stage.
 * @param {{actorId: string, tokenUuid: string, feeling: (string|null), seconds: number}} message
 */
function display({actorId, tokenUuid, feeling, seconds}) {
  const until = (feeling && feelingDuration(seconds)) ? Date.now() + feelingDuration(seconds) : null;
  for ( const token of tokensFor(actorId, tokenUuid) ) {
    if ( feeling ) drawBubble(token, feeling, until);
    else removeBubble(token.id);
  }
  setStageFeeling({actorId, tokenUuid, symbol: feeling ? FEELINGS[feeling].symbol : "", until});
  Hooks.callAll(FEELING_HOOK, {actorId, tokenUuid, feeling});
}

/**
 * The tokens of the viewed scene a feeling belongs to.
 * @param {string} actorId
 * @param {string} tokenUuid
 * @returns {Token[]}
 */
function tokensFor(actorId, tokenUuid) {
  if ( !canvas?.ready ) return [];
  if ( tokenUuid ) {
    const doc = fromUuidSync(tokenUuid, {strict: false});
    return (doc?.documentName === "Token" && (doc.actorId === actorId) && doc.object) ? [doc.object] : [];
  }
  return canvas.tokens.placeables.filter(token => (token.document.actorId === actorId) && token.document.actorLink);
}

/**
 * Remove the symbol from a token.
 * @param {string} tokenId
 */
function removeBubble(tokenId) {
  const entry = bubbles.get(tokenId);
  if ( !entry ) return;
  bubbles.delete(tokenId);
  if ( !entry.container.destroyed ) entry.container.destroy({children: true});
}

/**
 * Draw the symbol above a token: a round bubble with the symbol, popping in and bobbing a little.
 * @param {Token} token
 * @param {string} feeling
 * @param {number|null} until       The time it ends (null = until changed)
 */
function drawBubble(token, feeling, until) {
  if ( !globalThis.PIXI ) return;
  removeBubble(token.id);
  const size = Math.max(26, Math.min(64, token.w * 0.34));
  const container = new PIXI.Container();
  container.name = "stwFeeling";
  container.eventMode = "none";
  const back = new PIXI.Graphics();
  const radius = size * 0.78;
  back.lineStyle(2, 0xe7c27a, 0.95);
  back.beginFill(0x1c1620, 0.88);
  back.drawCircle(0, 0, radius);
  back.endFill();
  back.lineStyle(0);
  back.beginFill(0x1c1620, 0.88);
  back.drawPolygon([-radius * 0.28, radius * 0.86, radius * 0.28, radius * 0.86, 0, radius * 1.32]);
  back.endFill();
  const text = new PIXI.Text(FEELINGS[feeling].symbol, {fontFamily: FONT, fontSize: size, align: "center"});
  text.anchor.set(0.5);
  container.addChild(back, text);
  container.position.set(token.w / 2, -radius * 1.4);
  container.scale.set(0);
  token.addChild(container);
  bubbles.set(token.id, {container, feeling, until, born: performance.now(), baseY: container.y, token});
  startTicker();
}

/** Is the ticker which animates the symbols running? */
let ticking = false;

/**
 * Animate the symbols: pop in, bob, fade out at the end.
 */
function startTicker() {
  if ( ticking || !canvas?.app?.ticker ) return;
  ticking = true;
  const step = () => {
    if ( !bubbles.size ) {
      canvas.app?.ticker?.remove(step);
      ticking = false;
      return;
    }
    const now = performance.now();
    for ( const [id, entry] of [...bubbles] ) {
      const {container} = entry;
      if ( container.destroyed ) {
        bubbles.delete(id);
        continue;
      }
      const age = now - entry.born;
      const pop = Math.min(1, age / 260);
      // A little overshoot while it pops in
      const scale = pop < 1 ? (1 - Math.pow(1 - pop, 3)) * 1.12 : 1 + (0.12 * Math.max(0, 1 - ((age - 260) / 200)));
      let alpha = 1;
      if ( entry.until ) {
        const left = entry.until - Date.now();
        if ( left <= 0 ) {
          removeBubble(id);
          continue;
        }
        alpha = Math.min(1, left / 700);
      }
      container.scale.set(scale);
      container.alpha = alpha;
      container.y = entry.baseY + (Math.sin(age / 420) * 2.5);
    }
  };
  canvas.app.ticker.add(step);
}

/**
 * The feelings still running for a token (for tests and the debug file).
 * @returns {{tokenId: string, feeling: string}[]}
 */
export function activeFeelings() {
  return [...bubbles].map(([tokenId, entry]) => ({tokenId, feeling: entry.feeling}));
}

/* -------------------------------------------- */
/*  Messages and keys                           */
/* -------------------------------------------- */

/**
 * Handle a feeling sent by another client: draw it when the sender owns the character.
 * @param {object} raw
 * @param {string} senderId
 */
function onMessage(raw, senderId) {
  const message = parseFeelingMessage(raw);
  if ( !message || !setting("feelings") ) return;
  const sender = game.users.get(senderId);
  const base = game.actors.get(message.actorId);
  if ( !sender || !base || !canFeel(base, sender) ) {
    trace.add("feeling refused", {user: sender?.name});
    return;
  }
  if ( message.tokenUuid ) {
    const doc = fromUuidSync(message.tokenUuid, {strict: false});
    if ( !doc || (doc.actorId !== base.id) ) return;
  }
  display(message);
}

/**
 * The tokens a key acts on: the controlled tokens the user may show a feeling for, else the character of the user.
 * @returns {Array<TokenDocument|Actor>}
 */
function keyTargets() {
  const seen = new Set();
  const targets = [];
  for ( const token of canvas?.tokens?.controlled ?? [] ) {
    const resolved = resolveTarget(token);
    if ( !resolved || !canFeel(resolved.base) ) continue;
    const key = subject(resolved).key;
    if ( seen.has(key) ) continue;
    seen.add(key);
    targets.push(token.document);
  }
  if ( !targets.length && game.user.character && canFeel(game.user.character) ) targets.push(game.user.character);
  return targets;
}

/**
 * Show a feeling for the controlled tokens or the character of the user (the keys).
 * @param {string|null} feeling
 */
export async function feelSelected(feeling) {
  const targets = keyTargets();
  if ( !targets.length ) {
    ui.notifications.info(t("STW.Notify.select"));
    return;
  }
  for ( const target of targets ) await setFeeling(target, feeling, {notify: targets.length === 1});
}

/**
 * Register the keys of the feelings. Call in "init".
 */
export function registerFeelingKeys() {
  FEELING_KEYS.forEach((key, index) => {
    game.keybindings.register(MODULE_ID, `feeling.${key}`, {
      name: `STW.Feeling.key.${key}`,
      editable: [{key: `Digit${index + 1}`, modifiers: ["Shift", "Alt"]}],
      onDown: () => {
        feelSelected(key);
        return true;
      }
    });
  });
  game.keybindings.register(MODULE_ID, "feeling.clear", {
    name: "STW.Feeling.key.clear",
    editable: [{key: "Digit0", modifiers: ["Shift", "Alt"]}],
    onDown: () => {
      feelSelected(null);
      return true;
    }
  });
}

/**
 * Start listening. Call in "ready".
 */
export function startFeelings() {
  game.socket.on(SOCKET, onMessage);
  // A token which is drawn again keeps its symbol, a new scene starts without
  Hooks.on("drawToken", token => {
    const entry = bubbles.get(token.id);
    if ( entry && !entry.container.destroyed && (entry.container.parent !== token) ) token.addChild(entry.container);
  });
  Hooks.on("canvasTearDown", () => bubbles.clear());
  Hooks.on("deleteToken", token => removeBubble(token.id));
}
