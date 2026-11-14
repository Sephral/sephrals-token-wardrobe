/**
 * Pure helpers of the feelings of the players: the palette, which outfit answers a feeling and how long a feeling
 * lasts. Nothing here touches Foundry globals, so the helpers also run in Node tests.
 */

import {usableOutfits} from "./outfits.mjs";

/**
 * The feelings a player can show, with the symbol over the token and the moods of an outfit which answer it (the
 * first mood in the list wins).
 */
export const FEELINGS = {
  happy: {symbol: "\u{1F60A}", moods: ["happy", "friendly"], icon: "fa-face-smile"},
  angry: {symbol: "\u{1F620}", moods: ["angry"], icon: "fa-face-angry"},
  worried: {symbol: "\u{1F61F}", moods: ["worried", "afraid"], icon: "fa-face-frown-open"},
  sad: {symbol: "\u{1F622}", moods: ["sad", "hurt"], icon: "fa-face-sad-tear"},
  surprised: {symbol: "\u{1F62E}", moods: ["surprised"], icon: "fa-face-surprise"},
  thoughtful: {symbol: "\u{1F914}", moods: ["thoughtful", "neutral"], icon: "fa-face-meh"}
};

/** The keys of the feelings in the order of the palette. */
export const FEELING_KEYS = Object.keys(FEELINGS);

/**
 * A feeling from a name or a number (from 1), or null.
 * @param {string|number|null|undefined} ref
 * @returns {string|null}
 */
export function feelingKey(ref) {
  if ( (ref === null) || (ref === undefined) || (ref === "") ) return null;
  const text = String(ref).trim().toLowerCase();
  if ( FEELINGS[text] ) return text;
  const index = Number(text);
  return (Number.isInteger(index) && (index >= 1) && (index <= FEELING_KEYS.length)) ? FEELING_KEYS[index - 1] : null;
}

/**
 * The outfit which shows a feeling: the first usable outfit with one of the moods, the earlier mood first.
 * @param {import("./outfits.mjs").Outfit[]} outfits
 * @param {string} feeling
 * @returns {import("./outfits.mjs").Outfit|null}
 */
export function outfitForFeeling(outfits, feeling) {
  const moods = FEELINGS[feeling]?.moods ?? [];
  const usable = usableOutfits(outfits);
  for ( const mood of moods ) {
    const found = usable.find(o => o.expression === mood);
    if ( found ) return found;
  }
  return null;
}

/**
 * What happens with the outfit when a feeling is shown.
 * @param {object} options
 * @param {string|null} options.current       The outfit worn now
 * @param {string|null} options.back          The outfit remembered to come back to (null = none)
 * @param {string|null} options.wanted        The outfit of the feeling (null = the character has none)
 * @returns {{wear: (string|null), back: (string|null)}}   `back` is what to remember
 */
export function planFeeling({current, back, wanted}) {
  if ( !wanted ) return {wear: null, back};
  return {wear: (wanted === current) ? null : wanted, back: back ?? current ?? null};
}

/**
 * How long a feeling lasts, in milliseconds. 0 seconds means until it is changed.
 * @param {*} seconds
 * @returns {number|null}   null = no end
 */
export function feelingDuration(seconds) {
  const number = Number(seconds);
  if ( !Number.isFinite(number) || (number <= 0) ) return null;
  return Math.round(Math.min(number, 600) * 1000);
}

/**
 * Is a socket message a well formed feeling? Returns the cleaned message or null.
 * @param {*} message
 * @returns {{actorId: string, tokenUuid: string, feeling: (string|null), seconds: number}|null}
 */
export function parseFeelingMessage(message) {
  if ( !message || (message.type !== "feel") || (typeof message.actorId !== "string") || !message.actorId ) return null;
  const feeling = (message.feeling === null) ? null : feelingKey(message.feeling);
  if ( (message.feeling !== null) && !feeling ) return null;
  const seconds = Number(message.seconds);
  return {actorId: message.actorId, tokenUuid: (typeof message.tokenUuid === "string") ? message.tokenUuid : "", feeling,
    seconds: Number.isFinite(seconds) ? Math.max(0, Math.min(600, seconds)) : 0};
}
