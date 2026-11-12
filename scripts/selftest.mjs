/**
 * Self test: what the module relies on in Foundry, its storage and its texts.
 */

import {MODULE_ID, SOCKET, TESTED_VERSIONS, esc, makeId, t} from "./config.mjs";
import {cycleOutfit, outfitsFromFiles, planAuto, textureScale} from "./outfits.mjs";

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
  for ( const key of ["playersWear", "playersEdit", "allScenes", "transition", "automation", "sheetButton", "hudButton"] ) {
    check(game.settings.settings.has(`${MODULE_ID}.${key}`), "STW.SELFTEST.Storage", {key});
  }
  const files = outfitsFromFiles(["a/x-token.webp", "a/x-portrait.webp"], {makeId});
  const list = outfitsFromFiles(["a/one.webp", "a/two.webp"], {makeId});
  const auto = planAuto(list.map((o, i) => ({...o, auto: {combat: i === 0, hp: null, status: []}})),
    {inCombat: true, hpPercent: 100, statuses: []}, {manual: null, current: null, autoId: null});
  check((files.length === 1) && (files[0].token === "a/x-token.webp") && (cycleOutfit(list, list[0].id, 1) === list[1].id)
    && auto.change && (textureScale({scale: 2, mirror: false}, {scaleX: 1, scaleY: 1}, null).scaleX === 2), "STW.SELFTEST.Logic");
  const broken = game.actors.filter(actor => {
    const stored = actor.getFlag(MODULE_ID, "outfits");
    return (stored !== undefined) && !Array.isArray(stored);
  }).map(actor => actor.name);
  check(!broken.length, "STW.SELFTEST.Broken", {names: broken.join(", ")});
  const keys = ["STW.gear", "STW.SELFTEST.Title", "STW.Window.title", "STW.Sheet.button", "STW.HUD.button",
    "STW.Quick.street", "STW.Card.wear", "STW.Auto.title", "STW.Notify.noRight"];
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
