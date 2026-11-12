/**
 * The automation: outfits which put themselves on at the start of a fight, below a share of hit points or while a
 * status effect is active. The rules run only on the active GM's client. A fight, a wound or an effect asks for a
 * check of the character, a short pause gathers several changes into one check, and nothing is written when
 * nothing differs.
 */

import {MODULE_ID, setting} from "./config.mjs";
import {trace} from "./debug.mjs";
import {armorState, barPercent, hasAuto, planAuto} from "./outfits.mjs";
import {baseOf, getOutfits, isActiveGM} from "./store.mjs";
import {countFeature} from "./usage.mjs";
import {wear} from "./wear.mjs";

/** Pending checks by actor UUID. */
const timers = new Map();

/** How long a change waits for others, in milliseconds. */
const PAUSE = 60;

/* -------------------------------------------- */
/*  State of a character                        */
/* -------------------------------------------- */

/**
 * Is the character part of a fight that has started?
 * @param {Actor} actor
 * @returns {boolean}
 */
function inCombat(actor) {
  return game.combats.some(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid));
}

/**
 * The share of hit points left, read from the first bar of the token (the same attribute the token bar shows, so it
 * works in every game system).
 * @param {Actor} actor
 * @returns {number|null}
 */
function hitPointPercent(actor) {
  const token = actor.token ?? actor.getActiveTokens?.(false, true)?.[0] ?? null;
  for ( const bar of ["bar1", "bar2"] ) {
    let data = null;
    try {
      data = token?.getBarAttribute?.(bar) ?? null;
    } catch {
      data = null;
    }
    if ( !data ) {
      const path = actor.prototypeToken?.[bar]?.attribute;
      const value = path ? foundry.utils.getProperty(actor.system, path) : null;
      data = (value && (typeof value === "object")) ? {...value, type: "bar"} : null;
    }
    if ( data && (data.type === "bar") ) return barPercent(data);
  }
  return null;
}

/**
 * The armor a character has on. Only dnd5e knows armor types, other systems give null (no rule applies).
 * @param {Actor} actor
 * @returns {Set<string>|null}
 */
function armorOf(actor) {
  if ( game.system.id !== "dnd5e" ) return null;
  const items = actor.items.map(item => ({type: item.type, equipped: !!item.system?.equipped,
    kind: item.system?.type?.value ?? ""}));
  return armorState(items);
}

/**
 * What the rules look at.
 * @param {Actor} actor
 * @returns {{inCombat: boolean, hpPercent: (number|null), statuses: Set<string>, armor: (Set<string>|null)}}
 */
export function stateOf(actor) {
  return {inCombat: inCombat(actor), hpPercent: hitPointPercent(actor), statuses: new Set(actor.statuses ?? []),
    armor: armorOf(actor)};
}

/* -------------------------------------------- */
/*  Checking                                    */
/* -------------------------------------------- */

/**
 * Ask for a check of a character after a short pause.
 * @param {Actor|null|undefined} actor
 */
export function schedule(actor) {
  if ( !actor || (actor.documentName !== "Actor") || !isActiveGM() || !setting("automation") ) return;
  const key = actor.uuid;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    evaluate(actor).catch(err => console.error(`${MODULE_ID} | The automation failed for ${actor.name}`, err));
  }, PAUSE));
}

/**
 * Check a character now and put on or take off an outfit.
 * @param {Actor} actor
 * @returns {Promise<boolean>}   True when something was written
 */
export async function evaluate(actor) {
  if ( !isActiveGM() || !setting("automation") || !actor?.id ) return false;
  // A token which was deleted while the check waited
  if ( actor.isToken && !actor.token?.parent?.tokens?.has(actor.token.id) ) return false;
  const base = baseOf(actor);
  if ( !base ) return false;
  const outfits = getOutfits(base);
  const memory = {
    manual: actor.getFlag(MODULE_ID, "manual") ?? null,
    current: actor.getFlag(MODULE_ID, "current") ?? null,
    autoId: actor.getFlag(MODULE_ID, "autoId") ?? null
  };
  if ( !outfits.some(hasAuto) && !memory.autoId ) return false;
  const plan = planAuto(outfits, stateOf(actor), memory);
  if ( !plan.change ) return false;
  trace.add("automation", {actor: actor.name, wear: plan.wear, autoId: plan.autoId});
  countFeature(MODULE_ID, "autoWorn");
  const target = actor.isToken ? actor.token : base;
  const flags = {manual: plan.manual, autoId: plan.autoId};
  if ( plan.wear ) {
    await wear(target, plan.wear, {source: "auto", memory: flags, notify: false});
    return true;
  }
  // Nothing to go back to: only remember that the situation ended
  const data = {[`flags.${MODULE_ID}.autoId`]: null};
  if ( plan.manual ) data[`flags.${MODULE_ID}.manual`] = plan.manual;
  await actor.update(data);
  return true;
}

/**
 * Check every character of a combat.
 * @param {Combat} combat
 */
function scheduleCombat(combat) {
  for ( const combatant of combat.combatants ) schedule(combatant.actor);
}

/**
 * Check all characters which have automatic outfits, e.g. after the world started.
 */
export function evaluateAll() {
  if ( !isActiveGM() || !setting("automation") ) return;
  for ( const actor of game.actors ) {
    if ( getOutfits(actor).some(hasAuto) || actor.getFlag(MODULE_ID, "autoId") ) schedule(actor);
  }
  for ( const token of canvas?.scene?.tokens ?? [] ) {
    if ( !token.actorLink && token.actor && (getOutfits(token.actor).some(hasAuto) || token.actor.getFlag(MODULE_ID, "autoId")) ) {
      schedule(token.actor);
    }
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * Register the hooks of the automation. Call in "ready".
 */
export function registerAutomation() {
  Hooks.on("combatStart", scheduleCombat);
  Hooks.on("updateCombat", (combat, changes) => {
    if ( ("round" in changes) || ("turn" in changes) ) scheduleCombat(combat);
  });
  Hooks.on("deleteCombat", scheduleCombat);
  Hooks.on("createCombatant", combatant => schedule(combatant.actor));
  Hooks.on("deleteCombatant", combatant => schedule(combatant.actor));
  Hooks.on("updateActor", (actor, changes) => {
    if ( changes?.flags?.[MODULE_ID] && (Object.keys(changes).length <= 2) ) return;
    schedule(actor);
  });
  Hooks.on("updateToken", (token, changes) => {
    if ( !token.actorLink && changes?.delta ) schedule(token.actor);
  });
  const onEffect = effect => {
    const parent = effect.parent;
    schedule(parent?.documentName === "Actor" ? parent : parent?.parent);
  };
  // Armor put on or taken off (dnd5e)
  const onItem = item => {
    if ( (game.system.id === "dnd5e") && (item.parent?.documentName === "Actor") && (item.type === "equipment") ) schedule(item.parent);
  };
  Hooks.on("createItem", onItem);
  Hooks.on("updateItem", onItem);
  Hooks.on("deleteItem", onItem);
  Hooks.on("createActiveEffect", onEffect);
  Hooks.on("updateActiveEffect", onEffect);
  Hooks.on("deleteActiveEffect", onEffect);
  evaluateAll();
}
