/**
 * The automation: outfits which put themselves on at the start of a fight, below a share of hit points or while a
 * status effect is active. The rules run only on the active GM's client. A fight, a wound or an effect asks for a
 * check of the character, a short pause gathers several changes into one check, and nothing is written when
 * nothing differs.
 */

import {MODULE_ID, setting} from "./config.mjs";
import {trace} from "./debug.mjs";
import {ARMOR_SYSTEMS, armorKind, gearKeys, gearMatches, isEquippedItem} from "./gear-logic.mjs";
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
 * The armor a character has on. Only systems with armor kinds (dnd5e, PF2e) know them, in the others no armor rule
 * applies (null).
 * @param {Actor} actor
 * @returns {Set<string>|null}
 */
function armorOf(actor) {
  const system = game.system.id;
  if ( !ARMOR_SYSTEMS.includes(system) ) return null;
  const items = actor.items.map(item => ({type: "equipment", equipped: isEquippedItem(item, system),
    kind: armorKind(item, system) ?? ""}));
  return armorState(items);
}

/**
 * The equipped items of a character, by name and by the source they were made from.
 * @param {Actor} actor
 * @returns {Set<string>}
 */
export function gearOf(actor) {
  const system = game.system.id;
  return gearKeys(actor.items.map(item => ({name: item.name, equipped: isEquippedItem(item, system),
    uuids: [item.uuid, item._stats?.compendiumSource, item.flags?.core?.sourceId]})));
}

/**
 * What the rules look at.
 * @param {Actor} actor
 * @returns {{inCombat: boolean, hpPercent: (number|null), statuses: Set<string>, armor: (Set<string>|null), gear: Set<string>}}
 */
export function stateOf(actor) {
  return {inCombat: inCombat(actor), hpPercent: hitPointPercent(actor), statuses: new Set(actor.statuses ?? []),
    armor: armorOf(actor), gear: gearOf(actor)};
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
  const state = stateOf(actor);
  const plan = planAuto(outfits, state, memory);
  if ( !plan.change ) return false;
  trace.add("automation", {actor: actor.name, wear: plan.wear, autoId: plan.autoId});
  countFeature(MODULE_ID, "autoWorn");
  const chosen = outfits.find(o => o.id === plan.autoId);
  if ( chosen?.auto.gear.length && gearMatches(chosen.auto.gear, state.gear) ) countFeature(MODULE_ID, "gearWorn");
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
  // Armor and other gear put on or taken off, in every game system
  const onItem = (item, changes) => {
    const actor = item.parent;
    if ( (actor?.documentName !== "Actor") || !isActiveGM() ) return;
    // Only characters whose outfits look at armor or gear need a check
    const outfits = getOutfits(actor);
    if ( !outfits.some(o => o.auto.gear.length || o.auto.armor.length) ) return;
    // An update which does not touch the data of the item cannot change what is equipped
    if ( changes && !("system" in changes) && !("flags" in changes) && !("name" in changes) ) return;
    schedule(actor);
  };
  Hooks.on("createItem", onItem);
  Hooks.on("updateItem", onItem);
  Hooks.on("deleteItem", onItem);
  Hooks.on("createActiveEffect", onEffect);
  Hooks.on("updateActiveEffect", onEffect);
  Hooks.on("deleteActiveEffect", onEffect);
  evaluateAll();
}
