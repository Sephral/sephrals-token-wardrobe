/**
 * Self test: what the module relies on in Foundry, its storage and its texts.
 */

import {MODULE_ID, SOCKET, TESTED_VERSIONS, esc, makeId, t} from "./config.mjs";
import {cycleBackdrop, normalizeBackdrops, withBackdrop} from "./backdrop-logic.mjs";
import {FEELINGS, outfitForFeeling, planFeeling} from "./feelings-logic.mjs";
import {gearKeys, gearMatches, isEquippedItem} from "./gear-logic.mjs";
import {armorState, cycleOutfit, nameChange, normalizeOutfit, outfitsFromFiles, planAuto, stageName, textureScale} from "./outfits.mjs";
import {BEHAVIOR_TYPE} from "./places.mjs";
import {layoutStage, normalizeStage, planEnter, planLeave, stageMetrics} from "./stage-logic.mjs";
import {getStage} from "./stage.mjs";
import {normalizeVariety, pickVariant, varietyPool} from "./variety-logic.mjs";

/**
 * Run all checks.
 * @returns {Promise<{problems: string[], checks: number}>}
 */
async function checkAll() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if ( !ok ) problems.push(game.i18n.has(key) ? t(key, data) : key);
  };
  check(typeof foundry.applications?.api?.DialogV2 === "function", "STW.SELFTEST.Dialog");
  const picker = foundry.applications?.apps?.FilePicker?.implementation;
  check(["browse", "upload", "createDirectory"].every(name => typeof picker?.[name] === "function"),
    "STW.SELFTEST.Files");
  check(typeof foundry.applications?.hud?.TokenHUD?.prototype?.togglePalette === "function", "STW.SELFTEST.Hud");
  check(!!foundry.applications?.sheets?.ActorSheetV2, "STW.SELFTEST.Sheet");
  check(typeof CONFIG.Actor?.documentClass?.prototype?.getTokenImages === "function", "STW.SELFTEST.Wildcard");
  check(typeof CONFIG.Token?.documentClass?.prototype?.getBarAttribute === "function", "STW.SELFTEST.Bar");
  const types = Object.values(foundry.canvas?.rendering?.filters?.TextureTransitionFilter?.TYPES ?? {});
  const wanted = Object.keys(game.settings.settings.get(`${MODULE_ID}.transition`)?.choices ?? {}).filter(k => k !== "none");
  check(wanted.every(type => types.includes(type)), "STW.SELFTEST.Transitions", {types: wanted.filter(w => !types.includes(w)).join(", ")});
  check(Array.isArray(CONFIG.statusEffects), "STW.SELFTEST.Status");
  check((typeof game.socket?.emit === "function") && !!SOCKET && !!game.modules.get(MODULE_ID)?.socket, "STW.SELFTEST.Socket");
  check("activeGM" in game.users, "STW.SELFTEST.ActiveGM");
  for ( const key of ["playersWear", "playersEdit", "allScenes", "transition", "automation", "sheetButton", "hudButton",
    "stageBackdrop", "stageWear", "stageShow", "stageScale", "stage", "backdrops", "stageSound", "feelings", "feelingSeconds"] ) {
    check(game.settings.settings.has(`${MODULE_ID}.${key}`), "STW.SELFTEST.Storage", {key});
  }
  const files = outfitsFromFiles(["a/x-token.webp", "a/x-portrait.webp"], {makeId});
  const list = outfitsFromFiles(["a/one.webp", "a/two.webp"], {makeId});
  const auto = planAuto(list.map((o, i) => ({...o, auto: {combat: i === 0, hp: null, status: []}})),
    {inCombat: true, hpPercent: 100, statuses: []}, {manual: null, current: null, autoId: null});
  check((files.length === 1) && (files[0].token === "a/x-token.webp") && (cycleOutfit(list, list[0].id, 1) === list[1].id)
    && auto.change && (textureScale({scale: 2, mirror: false}, {scaleX: 1, scaleY: 1}, null).scaleX === 2), "STW.SELFTEST.Logic");
  // The conversation stage, the disguises and the places
  const layout = layoutStage([{id: "a", side: null}, {id: "b", side: null}, {id: "c", side: "right"}, {id: "d", side: "right"}]);
  const metrics = stageMetrics({width: 1280, height: 720, left: 2, right: 1});
  check((layout[0].side === "left") && (layout[1].side === "left") && (layout[2].pos === 0) && (layout[3].pos === 1)
    && (metrics.w > 0) && (metrics.h > 0) && normalizeStage({}, makeId).slots.length === 0, "STW.SELFTEST.StageLogic");
  check((nameChange("Gruk", null, "Baron").real === "Gruk") && (nameChange("Baron", "Gruk", "").name === "Gruk")
    && (stageName("Gruk", {disguise: "Baron"}, null) === "Baron"), "STW.SELFTEST.Disguise");
  check(planEnter({current: "a", wanted: "b", restore: true, stored: false}).remember && (planLeave({stored: "a", current: "b", known: "a"}).wear === "a")
    && armorState([]).has("none"), "STW.SELFTEST.PlaceLogic");
  // Random looks, backdrops, feelings and equipment as trigger
  const looks = ["a", "b"].map(id => normalizeOutfit({id, label: id, portrait: `${id}.webp`, variety: id === "a"}, makeId));
  const pick = pickVariant({pool: varietyPool(looks, normalizeVariety({mode: "all"})), used: {a: 1}, config: normalizeVariety({}),
    random: () => 0});
  check((pick?.outfit.id === "b") && (varietyPool(looks, normalizeVariety({mode: "marked"})).length === 1), "STW.SELFTEST.VarietyLogic");
  const sets = normalizeBackdrops([{id: "x", img: "x.webp"}, {id: "y", img: "y.webp"}], makeId);
  check((cycleBackdrop(sets, "x", 1).id === "y") && (withBackdrop({backdropId: null, tint: "none", pan: false}, sets[0]).backdropId === "x"),
    "STW.SELFTEST.BackdropLogic");
  const mood = normalizeOutfit({id: "m", label: "m", portrait: "m.webp", expression: "angry"}, makeId);
  check((outfitForFeeling([mood], "angry")?.id === "m") && (planFeeling({current: "a", back: null, wanted: "m"}).back === "a")
    && !!FEELINGS.happy.symbol, "STW.SELFTEST.FeelingLogic");
  const gearSet = gearKeys([{name: "Plate Armor", equipped: true, uuids: ["Item.1"]}, {name: "Cloak", equipped: false}]);
  check(gearMatches([{name: "plate armor", uuid: ""}], gearSet) && !gearMatches([{name: "Cloak", uuid: ""}], gearSet)
    && isEquippedItem({system: {equipped: true}}, "dnd5e") && isEquippedItem({system: {equipStatus: 3}}, "swade"), "STW.SELFTEST.GearLogic");
  check(!!globalThis.PIXI?.Text && !!globalThis.PIXI?.Graphics && !!game.audio?.play, "STW.SELFTEST.FeelingScreen");
  const stageStored = game.settings.get(MODULE_ID, "stage");
  check(!!stageStored && (typeof stageStored === "object") && Array.isArray(getStage().slots), "STW.SELFTEST.Stage");
  check(!!foundry.data?.regionBehaviors?.RegionBehaviorType && !!CONFIG.RegionBehavior?.dataModels?.[BEHAVIOR_TYPE], "STW.SELFTEST.Behavior");
  check(typeof ResizeObserver === "function" && !!document.getElementById("interface"),
    "STW.SELFTEST.StageScreen");
  check(typeof foundry.canvas?.placeables?.Token?.prototype?._refreshNameplate === "function", "STW.SELFTEST.Nameplate");
  const broken = game.actors.filter(actor => {
    const stored = actor.getFlag(MODULE_ID, "outfits");
    return (stored !== undefined) && !Array.isArray(stored);
  }).map(actor => actor.name);
  check(!broken.length, "STW.SELFTEST.Broken", {names: broken.join(", ")});
  const keys = ["STW.gear", "STW.SELFTEST.Title", "STW.Window.title", "STW.Sheet.button", "STW.HUD.button",
    "STW.Quick.street", "STW.Card.wear", "STW.Auto.title", "STW.Notify.noRight", "STW.Stage.title", "STW.Scene.title", "STW.BEHAVIOR.label"];
  const missing = keys.filter(key => !game.i18n.has(key));
  check(!missing.length, "STW.SELFTEST.Texts", {keys: missing.join(", ")});
  return {problems, checks};
}

/**
 * Run the self test and report the result.
 * @param {object} [options]
 * @param {boolean} [options.report=true]
 * @returns {Promise<{problems: string[], checks: number}>}
 */
export async function runSelfTest({report = true} = {}) {
  const {problems, checks} = await checkAll();
  const summary = problems.length ? t("STW.SELFTEST.Problems", {problems: problems.length, checks})
    : t("STW.SELFTEST.Passed", {checks});
  if ( problems.length ) ui.notifications.warn(summary, {permanent: true});
  else ui.notifications.info(summary);
  if ( report ) {
    const versions = t("STW.SELFTEST.Version", {current: game.version, tested: TESTED_VERSIONS.core});
    let content = `<h3>${esc(t("STW.SELFTEST.Title"))}</h3><p>${esc(summary)}</p><p><small>${esc(versions)}</small></p>`;
    if ( problems.length ) content += `<ul>${problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
    await ChatMessage.implementation.create({content, whisper: [game.user.id],
      speaker: {alias: game.modules.get(MODULE_ID).title}});
  }
  return {problems, checks};
}

/**
 * Tell the GM once when Foundry is newer than the version the module was verified against.
 */
export function noticeNewVersions() {
  if ( !game.user.isGM ) return;
  if ( !foundry.utils.isNewerVersion(game.version, TESTED_VERSIONS.core) ) return;
  const signature = `core ${game.version}`;
  if ( game.settings.get(MODULE_ID, "acknowledgedVersions") === signature ) return;
  game.settings.set(MODULE_ID, "acknowledgedVersions", signature);
  ui.notifications.info(t("STW.SELFTEST.NewVersions", {versions: signature}), {permanent: true});
}
