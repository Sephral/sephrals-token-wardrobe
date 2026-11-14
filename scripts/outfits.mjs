/**
 * Pure helpers of the wardrobe: normalizing stored outfits, turning image files into outfits, the scale and mirror
 * of a token image and the rules of the automation. Nothing here touches Foundry globals, so the helpers also run in
 * Node tests.
 */

import {gearMatches, normalizeGear} from "./gear-logic.mjs";

/**
 * @typedef Outfit
 * @property {string} id            Stable id
 * @property {string} label         Name shown in the palettes and the window
 * @property {string} portrait      Image for the portrait of the actor ("" keeps the portrait)
 * @property {string} token         Image or video for the token ("" keeps the token image)
 * @property {number|null} scale    Texture scale of the token, null = as it is
 * @property {boolean} mirror       Mirror the token image
 * @property {string} expression    Mood tag for the conversation stage ("" = none), one of EXPRESSIONS
 * @property {string} disguise      Name players see on the token and the stage while the outfit is worn ("" = none)
 * @property {boolean} variety      Part of the random looks of unlinked tokens ("Every figure looks different")
 * @property {OutfitAuto} auto      When the outfit puts itself on
 */

/**
 * @typedef OutfitAuto
 * @property {boolean} combat       While the character fights (a started combat)
 * @property {number|null} hp       Below this percentage of the hit points, null = off
 * @property {string[]} status      While one of these status effects is active
 * @property {string[]} armor       While armor of one of these kinds is equipped (ARMOR_TYPES, dnd5e and PF2e)
 * @property {import("./gear-logic.mjs").GearLink[]} gear   While one of these items is equipped
 */

/** The moods an outfit can be tagged with for the conversation stage. */
export const EXPRESSIONS = ["neutral", "friendly", "happy", "angry", "hurt", "sad", "afraid", "surprised", "mocking",
  "worried", "thoughtful"];

/** The kinds of armor an outfit can follow (the dnd5e armor types, "none" = no armor on). */
export const ARMOR_TYPES = ["none", "light", "medium", "heavy", "shield"];

/** The file extensions of videos. They are only allowed as token image. */
export const VIDEO_EXTENSIONS = ["webm", "mp4", "m4v", "ogv"];

/* -------------------------------------------- */
/*  File names                                  */
/* -------------------------------------------- */

/**
 * The file name of a path without folder, query and extension.
 * @param {string} path
 * @returns {string}
 */
export function fileStem(path) {
  const name = String(path ?? "").split(/[\\/]/).pop().split("?")[0];
  let stem = name.replace(/\.[^.]+$/, "");
  try {
    stem = decodeURIComponent(stem);
  } catch {
    // Keep the raw name if it is not valid URI encoding
  }
  return stem;
}

/**
 * A path without its query (Foundry adds "?<timestamp>" to refreshed images).
 * @param {string|null} path
 * @returns {string}
 */
export function withoutQuery(path) {
  return String(path ?? "").split("?")[0];
}

/**
 * Is a path a video?
 * @param {string} path
 * @returns {boolean}
 */
export function isVideo(path) {
  const extension = withoutQuery(path).split(".").pop().toLowerCase();
  return VIDEO_EXTENSIONS.includes(extension);
}

/**
 * The longest common beginning of several names, cut back to the last separator ("hero-").
 * @param {string[]} stems
 * @returns {string}
 */
export function commonPrefix(stems) {
  if ( stems.length < 2 ) return "";
  let prefix = stems[0];
  for ( const stem of stems.slice(1) ) {
    let i = 0;
    while ( (i < prefix.length) && (i < stem.length) && (prefix[i].toLowerCase() === stem[i].toLowerCase()) ) i++;
    prefix = prefix.slice(0, i);
  }
  const cut = Math.max(...["-", "_", " ", "."].map(c => prefix.lastIndexOf(c)));
  return cut >= 0 ? prefix.slice(0, cut + 1) : "";
}

/**
 * A readable label from a file name: "hero-battle-gear" with prefix "hero-" gives "Battle gear".
 * @param {string} stem
 * @param {string} [prefix]
 * @returns {string}
 */
export function labelFromStem(stem, prefix="") {
  stem = String(stem ?? "");
  let text = (prefix && stem.toLowerCase().startsWith(prefix.toLowerCase())) ? stem.slice(prefix.length) : stem;
  text = text.replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim();
  if ( !text ) text = stem.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* -------------------------------------------- */
/*  Normalizing                                 */
/* -------------------------------------------- */

/**
 * A positive finite number or null.
 * @param {*} value
 * @returns {number|null}
 */
function positiveOrNull(value) {
  if ( (value === null) || (value === undefined) || (value === "") ) return null;
  const number = Number(value);
  return (Number.isFinite(number) && (number > 0)) ? number : null;
}

/**
 * A percentage between 1 and 100 or null.
 * @param {*} value
 * @returns {number|null}
 */
function percentOrNull(value) {
  if ( (value === null) || (value === undefined) || (value === "") ) return null;
  const number = Number(value);
  if ( !Number.isFinite(number) || (number <= 0) ) return null;
  return Math.min(100, Math.round(number));
}

/**
 * A mood tag: one of EXPRESSIONS or "".
 * @param {*} value
 * @returns {string}
 */
export function normalizeExpression(value) {
  const key = (typeof value === "string") ? value.trim().toLowerCase() : "";
  return EXPRESSIONS.includes(key) ? key : "";
}

/**
 * Bring the automation of an outfit into a known shape.
 * @param {object} [data]
 * @returns {OutfitAuto}
 */
export function normalizeAuto(data) {
  const status = Array.isArray(data?.status) ? data.status : Object.values(data?.status ?? {});
  const armor = Array.isArray(data?.armor) ? data.armor : Object.values(data?.armor ?? {});
  return {
    combat: !!data?.combat,
    hp: percentOrNull(data?.hp),
    status: [...new Set(status.filter(s => (typeof s === "string") && s))],
    armor: ARMOR_TYPES.filter(type => armor.includes(type)),
    gear: normalizeGear(data?.gear)
  };
}

/**
 * Does an outfit have any automation?
 * @param {Outfit} outfit
 * @returns {boolean}
 */
export function hasAuto(outfit) {
  const auto = outfit?.auto;
  return !!auto && (auto.combat || (auto.hp !== null) || (auto.status.length > 0) || (auto.armor.length > 0)
    || (auto.gear.length > 0));
}

/**
 * Bring one stored or submitted outfit into a known shape. A video is only kept as token image.
 * @param {object} data
 * @param {() => string} makeId     Creates an id for outfits which have none
 * @returns {Outfit}
 */
export function normalizeOutfit(data, makeId) {
  data ??= {};
  const text = value => ((typeof value === "string") ? value.trim() : "");
  let portrait = text(data.portrait);
  let token = text(data.token);
  if ( isVideo(portrait) ) portrait = "";
  const stem = fileStem(token || portrait);
  return {
    id: ((typeof data.id === "string") && data.id) ? data.id : makeId(),
    label: text(data.label) || (stem ? labelFromStem(stem) : ""),
    portrait,
    token,
    scale: positiveOrNull(data.scale),
    mirror: !!data.mirror,
    expression: normalizeExpression(data.expression),
    disguise: text(data.disguise),
    variety: !!data.variety,
    auto: normalizeAuto(data.auto)
  };
}

/**
 * Normalize a stored wardrobe. Entries without name and images are dropped, duplicate ids are replaced.
 * @param {object[]|object} list    The stored array (or an index-keyed object)
 * @param {() => string} makeId
 * @returns {Outfit[]}
 */
export function normalizeOutfits(list, makeId) {
  const entries = Array.isArray(list) ? list : Object.values(list ?? {});
  const seen = new Set();
  const outfits = [];
  for ( const entry of entries ) {
    const outfit = normalizeOutfit(entry, makeId);
    if ( !outfit.portrait && !outfit.token && !outfit.label ) continue;
    if ( seen.has(outfit.id) ) outfit.id = makeId();
    seen.add(outfit.id);
    outfits.push(outfit);
  }
  return outfits;
}

/**
 * The outfits which can be worn: those with an image.
 * @param {Outfit[]} outfits
 * @returns {Outfit[]}
 */
export function usableOutfits(outfits) {
  return outfits.filter(o => o.portrait || o.token);
}

/**
 * Find an outfit by id, by name (ignoring case) or by its 1-based position among the usable outfits.
 * @param {Outfit[]} outfits
 * @param {string|number|null} ref
 * @returns {Outfit|null}
 */
export function findOutfit(outfits, ref) {
  if ( (ref === null) || (ref === undefined) || (ref === "") ) return null;
  const usable = usableOutfits(outfits);
  const byId = usable.find(o => o.id === ref);
  if ( byId ) return byId;
  const name = String(ref).trim().toLowerCase();
  const byLabel = usable.find(o => o.label.toLowerCase() === name);
  if ( byLabel ) return byLabel;
  const index = Number(ref);
  if ( Number.isInteger(index) && (index >= 1) ) return usable[index - 1] ?? null;
  return null;
}

/**
 * The id of the next or previous usable outfit, wrapping around. Without a current outfit, forward starts at the
 * first and backward at the last.
 * @param {Outfit[]} outfits
 * @param {string|null} currentId
 * @param {number} step             +1 or -1
 * @returns {string|null}
 */
export function cycleOutfit(outfits, currentId, step) {
  const usable = usableOutfits(outfits);
  if ( !usable.length ) return null;
  const index = usable.findIndex(o => o.id === currentId);
  if ( index < 0 ) return (step >= 0 ? usable[0] : usable.at(-1)).id;
  const n = usable.length;
  return usable[(((index + step) % n) + n) % n].id;
}

/* -------------------------------------------- */
/*  Files to outfits                            */
/* -------------------------------------------- */

/** The words which mark a file as token or portrait image, as suffix or prefix. */
const KIND_WORDS = {token: ["token", "tok"], portrait: ["portrait", "portraet", "porträt", "portrat"]};

/**
 * Split a file name into its base and the kind it marks: "battle-token" gives {base: "battle", kind: "token"}.
 * `before` and `after` are the parts around the base ("-token" in the example).
 * @param {string} stem
 * @returns {{base: string, kind: ("token"|"portrait"|null), before: string, after: string}}
 */
export function splitKind(stem) {
  stem = String(stem ?? "");
  for ( const [kind, words] of Object.entries(KIND_WORDS) ) {
    for ( const word of words ) {
      const suffix = new RegExp(`^(.+?)([-_. ]+${word})$`, "iu").exec(stem);
      if ( suffix ) return {base: suffix[1], kind, before: "", after: suffix[2]};
      const prefix = new RegExp(`^(${word}[-_. ]+)(.+)$`, "iu").exec(stem);
      if ( prefix ) return {base: prefix[2], kind, before: prefix[1], after: ""};
    }
  }
  return {base: stem, kind: null, before: "", after: ""};
}

/**
 * New names for files which would overwrite existing ones. A counter goes into the base name, so the words which mark
 * token and portrait files stay where they are, and the files of one set all get the same counter:
 * "battle-token.webp" and "battle-portrait.webp" become "battle-2-token.webp" and "battle-2-portrait.webp".
 * @param {string[]} names           The file names to upload
 * @param {Set<string>|string[]} taken   The names in the folder, in lower case
 * @returns {Map<string, string>}    Old name to new name (equal when nothing changes)
 */
export function uniqueNames(names, taken) {
  const used = new Set([...taken].map(n => n.toLowerCase()));
  const groups = new Map();
  for ( const name of names ) {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const {base} = splitKind(stem);
    const key = base.toLowerCase();
    if ( !groups.has(key) ) groups.set(key, []);
    groups.get(key).push(name);
  }
  const renamed = new Map();
  const make = (name, n) => {
    if ( n === 1 ) return name;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    const {base, before, after} = splitKind(stem);
    return `${before}${base}-${n}${after}${extension}`;
  };
  for ( const members of groups.values() ) {
    let n = 1;
    while ( members.some(name => used.has(make(name, n).toLowerCase())) ) n++;
    for ( const name of members ) {
      const result = make(name, n);
      used.add(result.toLowerCase());
      renamed.set(name, result);
    }
  }
  return renamed;
}

/**
 * Turn files into new outfits. Files named like "battle-token.webp" and "battle-portrait.webp" become one outfit.
 * A single image fills both the portrait and the token (a video only the token). Files already in the wardrobe are
 * skipped.
 * @param {string[]} paths
 * @param {object} options
 * @param {Outfit[]} [options.existing]       Outfits already in the wardrobe, their files are skipped
 * @param {() => string} options.makeId
 * @param {"both"|"token"} [options.single]   Where a single image goes ("token" for wildcard images)
 * @returns {Outfit[]}
 */
export function outfitsFromFiles(paths, {existing=[], makeId, single="both"}={}) {
  const known = new Set(existing.flatMap(o => [o.portrait, o.token]).filter(Boolean).map(withoutQuery));
  const files = [...new Set(paths.map(p => String(p ?? "")))].filter(p => p && !known.has(withoutQuery(p)));

  // Group by base name
  const groups = new Map();
  for ( const path of files ) {
    const {base, kind} = splitKind(fileStem(path));
    const key = base.toLowerCase();
    if ( !groups.has(key) ) groups.set(key, {base, token: null, portrait: null, plain: []});
    const group = groups.get(key);
    if ( kind === "token" ) group.token ??= path;
    else if ( kind === "portrait" ) group.portrait ??= path;
    else group.plain.push(path);
  }

  const bases = [...groups.values()].map(g => g.base).concat(existing.map(o => fileStem(o.token || o.portrait)));
  const prefix = commonPrefix(bases);
  const make = (base, portrait, token) => normalizeOutfit({label: labelFromStem(base, prefix), portrait, token}, makeId);
  const outfits = [];
  for ( const group of groups.values() ) {
    if ( group.token || group.portrait ) {
      // A plain file of the same name fills the slot the others leave open
      const plain = group.plain[0] ?? "";
      const portrait = group.portrait ?? ((plain && !isVideo(plain)) ? plain : "");
      const token = group.token ?? plain;
      outfits.push(make(group.base, portrait, token));
      continue;
    }
    // Plain files: one outfit per file stem
    const stems = new Set();
    for ( const path of group.plain ) {
      const stem = fileStem(path).toLowerCase();
      if ( stems.has(stem) ) continue;
      stems.add(stem);
      const video = isVideo(path);
      const both = (single === "both") && !video;
      outfits.push(make(fileStem(path), both ? path : "", path));
    }
  }
  outfits.sort((a, b) => a.label.localeCompare(b.label, undefined, {numeric: true}));
  return outfits;
}

/**
 * Does a file name continue another one, as variants of a portrait do? After the shared beginning comes a separator,
 * a number or a new word: "merchant" gives "merchant-angry", "merchant_2", "MerchantCloak", but not "merchants".
 * @param {string} stem
 * @param {string} base
 * @returns {boolean}
 */
export function sharesStem(stem, base) {
  stem = String(stem ?? "");
  base = String(base ?? "");
  if ( !base || !stem.toLowerCase().startsWith(base.toLowerCase()) ) return false;
  if ( stem.length === base.length ) return true;
  const last = base.at(-1);
  const next = stem.charAt(base.length);
  if ( /\p{L}/u.test(last) && /\p{Ll}/u.test(next) ) return false; // The word goes on
  return !(/\d/.test(last) && /\d/.test(next));                    // The number goes on: "guard-1", "guard-12"
}

/**
 * The files of a folder which look like variants of some images, sorted by name. The images themselves and files
 * already in the wardrobe are left out.
 * @param {string[]} files                    Files of the folder
 * @param {string[]} references               The images whose variants are wanted
 * @param {object} [options]
 * @param {Outfit[]} [options.existing]       Outfits already in the wardrobe
 * @returns {string[]}
 */
export function alternateFiles(files, references, {existing=[]}={}) {
  references = references.filter(Boolean).map(withoutQuery);
  const bases = references.map(r => splitKind(fileStem(r)).base).filter(Boolean);
  const known = new Set(existing.flatMap(o => [o.portrait, o.token]).filter(Boolean).map(withoutQuery)
    .concat(references));
  const found = new Map();
  for ( const file of files ) {
    const path = withoutQuery(file);
    if ( !path || known.has(path) || found.has(path) ) continue;
    if ( bases.some(base => sharesStem(fileStem(file), base)) ) found.set(path, file);
  }
  return [...found.values()].sort((a, b) => fileStem(a).localeCompare(fileStem(b)));
}

/* -------------------------------------------- */
/*  Quick start                                 */
/* -------------------------------------------- */

/**
 * The outfits of a new wardrobe: the three given names, the first one wearing what the character has on now.
 * @param {string[]} names
 * @param {{portrait: string, token: string}} current
 * @param {() => string} makeId
 * @returns {Outfit[]}
 */
export function quickStartOutfits(names, current, makeId) {
  return names.map((label, index) => normalizeOutfit({
    label,
    portrait: index ? "" : current.portrait,
    token: index ? "" : current.token
  }, makeId));
}

/* -------------------------------------------- */
/*  Token texture                               */
/* -------------------------------------------- */

/**
 * The texture scale a token gets from an outfit. An outfit with a scale or a mirror remembers the scale the token had
 * before (`base`), the next outfit without them restores it.
 * @param {Pick<Outfit, "scale"|"mirror">} outfit
 * @param {{scaleX: number, scaleY: number}} current    The scale of the token now
 * @param {{scaleX: number, scaleY: number}|null} base  The remembered scale, if any
 * @returns {{scaleX: number, scaleY: number, base: ({scaleX: number, scaleY: number}|null)}}
 */
export function textureScale(outfit, current, base) {
  const own = (outfit.scale !== null) || outfit.mirror;
  if ( !own ) {
    if ( base ) return {scaleX: base.scaleX, scaleY: base.scaleY, base: null};
    return {scaleX: current.scaleX, scaleY: current.scaleY, base: null};
  }
  base ??= {scaleX: current.scaleX, scaleY: current.scaleY};
  const x = outfit.scale ?? Math.abs(base.scaleX);
  const y = outfit.scale ?? Math.abs(base.scaleY);
  return {scaleX: outfit.mirror ? -x : x, scaleY: y, base};
}

/* -------------------------------------------- */
/*  Automation                                  */
/* -------------------------------------------- */

/**
 * The percentage of hit points left, from a bar attribute.
 * @param {{value: number, max?: number, effectiveMax?: number}|null|undefined} data
 * @returns {number|null}
 */
export function barPercent(data) {
  if ( !data || (typeof data !== "object") ) return null;
  const max = Number(data.effectiveMax ?? data.max);
  const value = Number(data.value);
  if ( !Number.isFinite(max) || !Number.isFinite(value) || (max <= 0) ) return null;
  return Math.max(0, (value / max) * 100);
}

/**
 * Does the state of a character call for an outfit?
 * @param {Outfit} outfit
 * @param {{inCombat: boolean, hpPercent: (number|null), statuses: Iterable<string>, armor?: (Iterable<string>|null), gear?: (Iterable<string>|null)}} state
 * @returns {boolean}
 */
export function autoMatches(outfit, state) {
  const auto = outfit?.auto;
  if ( !auto || !(outfit.portrait || outfit.token) ) return false;
  if ( auto.combat && state.inCombat ) return true;
  if ( (auto.hp !== null) && (state.hpPercent !== null) && (state.hpPercent < auto.hp) ) return true;
  if ( auto.status.length ) {
    const active = new Set(state.statuses);
    if ( auto.status.some(s => active.has(s)) ) return true;
  }
  if ( auto.armor.length && state.armor ) {
    const worn = new Set(state.armor);
    if ( auto.armor.some(type => worn.has(type)) ) return true;
  }
  if ( auto.gear.length && gearMatches(auto.gear, state.gear) ) return true;
  return false;
}

/**
 * The armor kinds a character has on, from its items. "none" is part of the result when no light, medium or heavy
 * armor is equipped (a shield does not count as armor here).
 * @param {{type: string, equipped: boolean, kind: string}[]} items   Equipment items: item type, equipped flag, armor type
 * @returns {Set<string>}
 */
export function armorState(items) {
  const worn = new Set();
  for ( const item of items ) {
    if ( (item.type === "equipment") && item.equipped && ARMOR_TYPES.includes(item.kind) && (item.kind !== "none") ) worn.add(item.kind);
  }
  if ( !["light", "medium", "heavy"].some(type => worn.has(type)) ) worn.add("none");
  return worn;
}

/* -------------------------------------------- */
/*  Disguise                                    */
/* -------------------------------------------- */

/**
 * The name a token gets when an outfit goes on, and the real name to remember. A disguise keeps the real name aside,
 * the next outfit without one gives it back.
 * @param {string} current                 The name of the token now
 * @param {string|null} stored             The remembered real name, if any
 * @param {string} disguise                The disguise of the outfit ("" = none)
 * @returns {{name: string, real: (string|null)}}
 */
export function nameChange(current, stored, disguise) {
  disguise = String(disguise ?? "").trim();
  if ( disguise ) return {name: disguise, real: stored ?? ((current === disguise) ? null : current)};
  if ( stored ) return {name: stored, real: null};
  return {name: current, real: null};
}

/**
 * The name shown on the conversation stage: the disguise of the outfit shown, else the disguise of the outfit the
 * character wears, else the real name.
 * @param {string} actorName
 * @param {Outfit|null} shown
 * @param {Outfit|null} worn
 * @returns {string}
 */
export function stageName(actorName, shown, worn) {
  return shown?.disguise || worn?.disguise || actorName;
}

/**
 * Decide what the automation does. The first matching outfit in the list order wins. While the call for an outfit
 * is unchanged nothing happens, so a manual choice stays until the situation changes. When the situation ends, the
 * outfit the user chose by hand comes back.
 * @param {Outfit[]} outfits
 * @param {{inCombat: boolean, hpPercent: (number|null), statuses: Iterable<string>, armor?: (Iterable<string>|null), gear?: (Iterable<string>|null)}} state
 * @param {{manual: (string|null), current: (string|null), autoId: (string|null)}} memory
 * @returns {{change: false}|{change: true, wear: (string|null), autoId: (string|null), manual: (string|null)}}
 */
export function planAuto(outfits, state, memory) {
  const wanted = outfits.find(o => autoMatches(o, state))?.id ?? null;
  if ( wanted === (memory.autoId ?? null) ) return {change: false};
  const manual = memory.manual ?? memory.current ?? null;
  if ( wanted ) return {change: true, wear: wanted, autoId: wanted, manual};
  const back = usableOutfits(outfits).some(o => o.id === manual) ? manual : null;
  return {change: true, wear: back, autoId: null, manual};
}
