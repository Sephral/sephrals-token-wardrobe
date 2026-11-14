/**
 * Pure helpers of "equipment as trigger": is an item equipped (per game system, with a generic fallback), which
 * items an outfit is linked to, and the armor kinds of the armor rule. Nothing here touches Foundry globals, so the
 * helpers also run in Node tests.
 */

/**
 * @typedef GearLink
 * @property {string} name      Name of the item (matched ignoring case)
 * @property {string} uuid      UUID of the item or of its source ("" = match by name only)
 */

/** The game systems whose equipped state is known (everything else uses the generic paths). */
export const KNOWN_SYSTEMS = ["dnd5e", "pf2e", "swade", "crucible"];

/** The game systems which have armor kinds for the armor rule. */
export const ARMOR_SYSTEMS = ["dnd5e", "pf2e"];

/** SWADE: stored 0, carried 1, off hand 2, equipped 3, main hand 4 and more. Equipped is everything above carried. */
const SWADE_CARRIED = 1;

/**
 * The most common data paths of an "equipped" state, tried one after the other when the system is not known.
 * A boolean is taken as it is, a number is equipped above 1 (like SWADE's states), an object is read through its
 * `carryType`, `equipped` or `value`.
 */
export const GENERIC_PATHS = ["equipped", "isEquipped", "equipStatus", "equip", "worn", "isWorn", "equipment.equipped",
  "equipment.worn", "state.equipped"];

/**
 * Read a nested path of a plain object.
 * @param {object} object
 * @param {string} path
 * @returns {*}
 */
function read(object, path) {
  let value = object;
  for ( const key of path.split(".") ) {
    if ( value === null || value === undefined ) return undefined;
    value = value[key];
  }
  return value;
}

/**
 * Turn a value found at an "equipped" path into a verdict, null when it says nothing.
 * @param {*} value
 * @returns {boolean|null}
 */
export function equippedValue(value) {
  if ( typeof value === "boolean" ) return value;
  if ( typeof value === "number" ) return Number.isFinite(value) ? (value > SWADE_CARRIED) : null;
  if ( typeof value === "string" ) {
    const text = value.trim().toLowerCase();
    if ( ["equipped", "worn", "held", "wielded", "readied", "true", "on"].includes(text) ) return true;
    if ( ["unequipped", "stowed", "stored", "dropped", "carried", "false", "off", "none", ""].includes(text) ) return false;
    return null;
  }
  if ( value && (typeof value === "object") ) {
    if ( "carryType" in value ) return equippedValue(value.carryType);
    for ( const key of ["equipped", "value", "state"] ) if ( key in value ) return equippedValue(value[key]);
  }
  return null;
}

/**
 * Is an item equipped? Each known system has its own rule, other systems are read through the common data paths. An
 * item with no sign of an equipped state counts as not equipped.
 * @param {{type?: string, system?: object, isEquipped?: *}} item   The item or its plain data
 * @param {string} [systemId]                                       The id of the game system
 * @returns {boolean}
 */
export function isEquippedItem(item, systemId = "") {
  const system = item?.system ?? {};
  switch ( systemId ) {
    case "dnd5e":
      return system.equipped === true;
    case "crucible":
      return system.equipped === true;
    case "swade": {
      if ( "equipStatus" in system ) return Number(system.equipStatus) > SWADE_CARRIED;
      return system.equipped === true;
    }
    case "pf2e": {
      // The system answers itself when the item is a live document
      if ( typeof item?.isEquipped === "boolean" ) return item.isEquipped;
      const carried = system.equipped;
      if ( !carried || (typeof carried !== "object") ) return false;
      if ( carried.carryType === "held" ) return (carried.handsHeld ?? 1) > 0;
      if ( carried.carryType === "worn" ) return carried.inSlot !== false;
      return false;
    }
    default:
  }
  if ( typeof item?.isEquipped === "boolean" ) return item.isEquipped;
  for ( const path of GENERIC_PATHS ) {
    const verdict = equippedValue(read(system, path));
    if ( verdict !== null ) return verdict;
  }
  return false;
}

/**
 * The armor kind of an item for the armor rule: "light", "medium", "heavy", "shield" or null when it is no armor.
 * @param {{type?: string, system?: object}} item
 * @param {string} systemId
 * @returns {string|null}
 */
export function armorKind(item, systemId) {
  const system = item?.system ?? {};
  if ( systemId === "dnd5e" ) {
    if ( item?.type !== "equipment" ) return null;
    const kind = system.type?.value ?? "";
    return ["light", "medium", "heavy", "shield"].includes(kind) ? kind : null;
  }
  if ( systemId === "pf2e" ) {
    if ( item?.type === "shield" ) return "shield";
    if ( item?.type !== "armor" ) return null;
    return ["light", "medium", "heavy"].includes(system.category) ? system.category : null;
  }
  return null;
}

/* -------------------------------------------- */
/*  Links between items and outfits             */
/* -------------------------------------------- */

/**
 * The comparison key of an item name.
 * @param {string} name
 * @returns {string}
 */
export function nameKey(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Bring stored or submitted links into a known shape: names without duplicates, UUIDs as text.
 * @param {*} list
 * @returns {GearLink[]}
 */
export function normalizeGear(list) {
  const entries = Array.isArray(list) ? list : Object.values(list ?? {});
  const seen = new Set();
  const gear = [];
  for ( const entry of entries ) {
    const link = (typeof entry === "string") ? {name: entry, uuid: ""} : entry;
    const name = (typeof link?.name === "string") ? link.name.trim() : "";
    const uuid = (typeof link?.uuid === "string") ? link.uuid.trim() : "";
    if ( !name && !uuid ) continue;
    // A link with a source is known by it, a link by name only is dropped when its name is in the list already
    const key = uuid ? `uuid:${uuid}` : `name:${nameKey(name)}`;
    if ( seen.has(key) ) continue;
    seen.add(key);
    if ( name ) seen.add(`name:${nameKey(name)}`);
    gear.push({name, uuid});
  }
  return gear;
}

/**
 * The names a text field is made of: separated by commas or line breaks, empty ones dropped.
 * @param {string} text
 * @returns {string[]}
 */
export function namesFromText(text) {
  return String(text ?? "").split(/[,\n]+/).map(part => part.trim()).filter(Boolean);
}

/**
 * The keys by which the equipped items of a character are known: "name:<name>" and, for items made from a source or
 * from a compendium, "uuid:<uuid>".
 * @param {{name: string, equipped: boolean, uuids?: string[]}[]} items
 * @returns {Set<string>}
 */
export function gearKeys(items) {
  const keys = new Set();
  for ( const item of items ) {
    if ( !item.equipped ) continue;
    keys.add(`name:${nameKey(item.name)}`);
    for ( const uuid of item.uuids ?? [] ) if ( uuid ) keys.add(`uuid:${uuid}`);
  }
  return keys;
}

/**
 * Does one of the links match the equipped gear of a character?
 * @param {GearLink[]} links
 * @param {Iterable<string>|null|undefined} keys    From `gearKeys`
 * @returns {boolean}
 */
export function gearMatches(links, keys) {
  if ( !links?.length || !keys ) return false;
  const set = (keys instanceof Set) ? keys : new Set(keys);
  return links.some(link => (link.uuid && set.has(`uuid:${link.uuid}`)) || (link.name && set.has(`name:${nameKey(link.name)}`)));
}

/**
 * A short readable text for the links of an outfit.
 * @param {GearLink[]} links
 * @returns {string}
 */
export function gearNames(links) {
  return (links ?? []).map(link => link.name || link.uuid).join(", ");
}
