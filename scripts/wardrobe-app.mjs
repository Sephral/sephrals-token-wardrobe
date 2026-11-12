/**
 * The wardrobe window of one character: cards with portrait and token image, name, scale, mirror and automation,
 * a click to put an outfit on, images dropped in from the desktop, the file browser, other characters or folders.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, esc, makeId, setting, t} from "./config.mjs";
import {mediaHTML} from "./palette.mjs";
import {alternateFiles, fileStem, hasAuto, isVideo, normalizeAuto, outfitsFromFiles, quickStartOutfits, uniqueNames,
  usableOutfits, withoutQuery} from "./outfits.mjs";
import {baseOf, canEdit, canWear, currentOutfitId, fileRights, getOutfits, resolveTarget, saveOutfits} from "./store.mjs";
import {countFeature} from "./usage.mjs";
import {wear} from "./wear.mjs";

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;

/** The type of the drag data when cards are moved. */
const DRAG_TYPE = "text/stw-outfit";

/**
 * Open the wardrobe of a character, or bring an open one to the front.
 * @param {Actor|TokenDocument|Token|string} target
 * @returns {WardrobeApp|null}
 */
export function openWardrobe(target) {
  const resolved = resolveTarget(target);
  if ( !resolved ) {
    ui.notifications.warn(t("STW.Notify.noTarget"));
    return null;
  }
  const {base, actor, token} = resolved;
  if ( !canEdit(actor) && !canWear(actor) ) {
    ui.notifications.warn(t("STW.Notify.noRight", {name: actor.name}));
    return null;
  }
  countFeature(MODULE_ID, "windowOpened");
  const id = WardrobeApp.idFor(base, token);
  const app = foundry.applications.instances.get(id) ?? new WardrobeApp({base, token});
  app.render({force: true});
  return app;
}

/**
 * Redraw the open wardrobes of an actor (or all of them).
 * @param {Actor} [actor]
 */
export function refreshWardrobes(actor) {
  for ( const app of foundry.applications.instances.values() ) {
    if ( (app instanceof WardrobeApp) && app.rendered && (!actor || (app.base.id === actor.id)) ) app.render();
  }
}

/* -------------------------------------------- */

/**
 * The folder for the images of a character that were uploaded from a computer.
 * @param {Actor} actor
 * @returns {string}
 */
export function uploadFolder(actor) {
  const slug = String(actor.name ?? "").normalize("NFKD").replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "-")
    .toLowerCase().slice(0, 40) || "actor";
  return `worlds/${game.world.id}/${MODULE_ID}/${slug}-${actor.id}`;
}

/**
 * The file extensions of images and videos, with a leading dot.
 * @param {boolean} [videos=true]
 * @returns {string[]}
 */
function mediaExtensions(videos=true) {
  const names = Object.keys(CONST.IMAGE_FILE_EXTENSIONS);
  if ( videos ) names.push(...Object.keys(CONST.VIDEO_FILE_EXTENSIONS));
  return names.map(e => `.${e}`);
}

/**
 * The media files of a folder.
 * @param {string} source
 * @param {string} target
 * @param {string} [bucket]
 * @returns {Promise<string[]>}
 */
async function browseMedia(source, target, bucket) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const extensions = mediaExtensions();
  const options = {extensions};
  if ( (source === "s3") && bucket ) options.bucket = bucket;
  const result = await FilePicker.browse(source, target, options);
  return (result.files ?? []).filter(f => extensions.some(e => withoutQuery(f).toLowerCase().endsWith(e)));
}

/**
 * Make sure a folder in the user data exists.
 * @param {string} path
 */
async function ensureFolder(path) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  try {
    await FilePicker.browse("data", path);
    return;
  } catch {
    // Not there yet
  }
  let current = "";
  for ( const part of path.split("/") ) {
    current = current ? `${current}/${part}` : part;
    try {
      await FilePicker.browse("data", current);
    } catch {
      try {
        await FilePicker.createDirectory("data", current);
      } catch(err) {
        console.warn(`${MODULE_ID} | Could not create ${current}`, err);
      }
    }
  }
}

/* -------------------------------------------- */

/**
 * The wardrobe window.
 */
export class WardrobeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} options
   * @param {Actor} options.base           The world actor
   * @param {TokenDocument|null} [options.token]   The unlinked token the window was opened for, if any
   */
  constructor({base, token=null, ...options}={}) {
    super({id: WardrobeApp.idFor(base, token), ...options});
    this.base = base;
    this.token = (token && !token.actorLink) ? token : null;
  }

  /**
   * The application id of a character's window.
   * @param {Actor} base
   * @param {TokenDocument|null} token
   * @returns {string}
   */
  static idFor(base, token) {
    return `${MODULE_ID}-wardrobe-${base.id}${(token && !token.actorLink) ? `-${token.id}` : ""}`;
  }

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["stw-app", "stw-wardrobe"],
    tag: "section",
    window: {icon: "fa-solid fa-shirt", resizable: true},
    position: {width: 760, height: 680},
    actions: {
      wear: WardrobeApp.#onWear,
      pickPortrait: WardrobeApp.#onPick,
      pickToken: WardrobeApp.#onPick,
      clearPortrait: WardrobeApp.#onClear,
      clearToken: WardrobeApp.#onClear,
      remove: WardrobeApp.#onRemove,
      moveLeft: WardrobeApp.#onMove,
      moveRight: WardrobeApp.#onMove,
      auto: WardrobeApp.#onAuto,
      addImage: WardrobeApp.#onAddImage,
      upload: WardrobeApp.#onUpload,
      importFolder: WardrobeApp.#onImportFolder,
      suggest: WardrobeApp.#onSuggest,
      wildcard: WardrobeApp.#onWildcard,
      newOutfit: WardrobeApp.#onNew,
      quickStart: WardrobeApp.#onQuickStart
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/wardrobe.hbs`, scrollable: [".stw-cards"]}};

  /** @override */
  get title() {
    return t("STW.Window.title", {name: this.base.name});
  }

  /** The actor the window shows: the synthetic actor of an unlinked token, else the world actor. */
  get actor() {
    return this.token?.actor ?? this.base;
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const actor = this.actor;
    const outfits = getOutfits(this.base);
    const current = currentOutfitId(this.token ?? actor);
    const rights = fileRights();
    const editable = canEdit(actor);
    const notices = [];
    if ( editable && !rights.upload && !rights.browse ) notices.push(t("STW.Window.noFiles"));
    else if ( editable && !rights.upload ) notices.push(t("STW.Window.noUpload"));
    else if ( editable && !rights.browse ) notices.push(t("STW.Window.noBrowse"));
    const count = outfits.length;
    const wildcard = this.base.prototypeToken.randomImg;
    return {
      name: actor.name,
      whoImage: mediaHTML(actor.img),
      subtitle: this.token ? t("STW.Window.unlinked") : t((usableOutfits(outfits).length === 1) ? "STW.Window.countOne" : "STW.Window.count", {count: usableOutfits(outfits).length}),
      editable,
      wearable: canWear(actor),
      rights,
      wildcard: editable && wildcard,
      accept: mediaExtensions().join(","),
      notices,
      empty: !count,
      startNames: [t("STW.Quick.street"), t("STW.Quick.battle"), t("STW.Quick.fine")].join(", "),
      outfits: outfits.map((outfit, index) => ({
        ...outfit,
        index,
        first: index === 0,
        last: index === (count - 1),
        usable: !!(outfit.portrait || outfit.token),
        current: outfit.id === current,
        hasAuto: hasAuto(outfit),
        autoSummary: autoSummary(outfit),
        portraitHTML: mediaHTML(outfit.portrait),
        tokenHTML: mediaHTML(outfit.token)
      }))
    };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    addSettingsGear(frame);
    return frame;
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    const element = this.element;
    element.dataset.stwTheme = setting("theme");
    if ( !context.editable ) return;
    for ( const field of element.querySelectorAll("[data-field]") ) {
      field.addEventListener("change", event => this.#onField(event, field));
    }
    element.querySelector("input.stw-file")?.addEventListener("change", event => {
      const files = Array.from(event.currentTarget.files);
      event.currentTarget.value = "";
      this.#addUploads(files);
    });
    for ( const card of element.querySelectorAll(".stw-card") ) {
      card.addEventListener("dragstart", event => {
        if ( event.target !== card ) return;
        event.dataTransfer.setData(DRAG_TYPE, card.dataset.outfitId);
        event.dataTransfer.effectAllowed = "move";
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        for ( const other of element.querySelectorAll(".drop-before, .drop-after") ) {
          other.classList.remove("drop-before", "drop-after");
        }
      });
    }
    // Registered once per window element, not per render
    if ( !element.dataset.stwDrop ) {
      element.dataset.stwDrop = "1";
      element.addEventListener("dragover", event => this.#onDragOver(event));
      element.addEventListener("dragleave", event => {
        if ( !element.contains(event.relatedTarget) ) element.classList.remove("stw-dragging");
      });
      element.addEventListener("drop", event => this.#onDrop(event));
    }
  }

  /* -------------------------------------------- */
  /*  Saving                                      */
  /* -------------------------------------------- */

  /**
   * Save new outfits and keep the current one marked.
   * @param {import("./outfits.mjs").Outfit[]} outfits
   * @param {object} [extra]
   * @returns {Promise<void>}
   */
  async #save(outfits, extra={}) {
    await saveOutfits(this.base, outfits, extra);
    this.render();
  }

  /**
   * Change one outfit.
   * @param {string} id
   * @param {(outfit: object) => void} change
   */
  async #change(id, change) {
    const outfits = getOutfits(this.base);
    const outfit = outfits.find(o => o.id === id);
    if ( !outfit ) return;
    change(outfit);
    await this.#save(outfits);
  }

  /**
   * A field of a card changed.
   * @param {Event} event
   * @param {HTMLInputElement} field
   */
  async #onField(event, field) {
    const id = field.closest("[data-outfit-id]")?.dataset.outfitId;
    const name = field.dataset.field;
    if ( !id || !canEdit(this.actor) ) return;
    await this.#change(id, outfit => {
      if ( name === "label" ) outfit.label = field.value.trim() || outfit.label;
      else if ( name === "scale" ) outfit.scale = field.value === "" ? null : Number(field.value);
      else if ( name === "mirror" ) outfit.mirror = field.checked;
    });
  }

  /* -------------------------------------------- */
  /*  Adding                                      */
  /* -------------------------------------------- */

  /**
   * Add files as new outfits.
   * @param {string[]} paths
   * @param {object} [options]
   * @param {"both"|"token"} [options.single]
   * @returns {Promise<number>}   How many outfits were added
   */
  async #addFiles(paths, {single="both"}={}) {
    const existing = getOutfits(this.base);
    const added = outfitsFromFiles(paths, {existing, makeId, single});
    if ( !added.length ) {
      ui.notifications.info(t("STW.Window.nothingNew"));
      return 0;
    }
    await this.#save(existing.concat(added));
    countFeature(MODULE_ID, "outfitsAdded");
    ui.notifications.info(t("STW.Window.added", {count: added.length}));
    return added.length;
  }

  /**
   * Upload files from the computer into the folder of the character.
   * @param {File[]} files
   * @returns {Promise<string[]>}  The paths of the uploaded files
   */
  async #uploadFiles(files) {
    if ( !fileRights().upload ) {
      ui.notifications.warn(t("STW.Window.noUploadNotice"));
      return [];
    }
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    const allowed = mediaExtensions();
    const media = files.filter(f => allowed.some(e => f.name.toLowerCase().endsWith(e)));
    const skipped = files.length - media.length;
    if ( skipped ) ui.notifications.warn(t("STW.Window.skipped", {count: skipped}));
    if ( !media.length ) return [];
    const folder = uploadFolder(this.base);
    await ensureFolder(folder);
    let taken = new Set();
    try {
      taken = new Set((await FilePicker.browse("data", folder)).files.map(f => decodeURIComponent(f.split("/").pop()).toLowerCase()));
    } catch {
      // The folder could not be listed, upload anyway
    }
    const paths = [];
    const clean = media.map(file => file.name.replace(/[^\w.\- ()]+/g, "_"));
    const names = uniqueNames(clean, taken);
    for ( const [index, file] of media.entries() ) {
      const name = names.get(clean[index]);
      const response = await FilePicker.upload("data", folder, new File([file], name, {type: file.type}), {}, {notify: false});
      if ( response?.path ) paths.push(response.path);
      else ui.notifications.error(t("STW.Window.uploadFailed", {name: file.name}));
    }
    if ( paths.length ) countFeature(MODULE_ID, "uploaded");
    return paths;
  }

  /**
   * Upload files and add them as outfits.
   * @param {File[]} files
   */
  async #addUploads(files) {
    const paths = await this.#uploadFiles(files);
    if ( paths.length ) await this.#addFiles(paths);
  }

  /**
   * Copy the outfits of another character (or its look, when it has none).
   * @param {Actor} source
   */
  async #copyFrom(source) {
    const from = baseOf(source);
    if ( !from || (from.id === this.base.id) ) return;
    const existing = getOutfits(this.base);
    let copies = usableOutfits(getOutfits(from)).map(o => ({...foundry.utils.deepClone(o), id: makeId()}));
    if ( !copies.length ) {
      const token = from.prototypeToken.randomImg ? "" : from.prototypeToken.texture.src;
      copies = [{id: makeId(), label: from.name, portrait: from.img ?? "", token: token ?? ""}];
    }
    const known = new Set(existing.flatMap(o => [o.portrait, o.token]).filter(Boolean));
    copies = copies.filter(o => ![o.portrait, o.token].filter(Boolean).every(src => known.has(src)));
    if ( !copies.length ) {
      ui.notifications.info(t("STW.Window.nothingNew"));
      return;
    }
    await this.#save(existing.concat(copies));
    countFeature(MODULE_ID, "copied");
    ui.notifications.info(t("STW.Window.copied", {count: copies.length, name: from.name}));
  }

  /* -------------------------------------------- */
  /*  Dropping                                    */
  /* -------------------------------------------- */

  /**
   * Show where a drop would land.
   * @param {DragEvent} event
   */
  #onDragOver(event) {
    if ( !canEdit(this.actor) ) return;
    event.preventDefault();
    const types = Array.from(event.dataTransfer?.types ?? []);
    if ( types.includes(DRAG_TYPE) ) {
      const card = event.target.closest?.(".stw-card");
      for ( const other of this.element.querySelectorAll(".drop-before, .drop-after") ) {
        other.classList.remove("drop-before", "drop-after");
      }
      if ( card && !card.classList.contains("dragging") ) {
        const box = card.getBoundingClientRect();
        card.classList.add(event.clientX < box.left + (box.width / 2) ? "drop-before" : "drop-after");
      }
      return;
    }
    this.element.classList.add("stw-dragging");
  }

  /**
   * Handle a drop: cards to move, files from the computer, pictures from Foundry's file browser, other characters.
   * @param {DragEvent} event
   */
  async #onDrop(event) {
    if ( !canEdit(this.actor) ) return;
    event.preventDefault();
    this.element.classList.remove("stw-dragging");
    const transfer = event.dataTransfer;
    const slot = event.target.closest?.("[data-slot]");
    const card = event.target.closest?.(".stw-card");

    // Cards change places
    const moved = transfer.getData(DRAG_TYPE);
    if ( moved ) {
      if ( !card || (card.dataset.outfitId === moved) ) return;
      const box = card.getBoundingClientRect();
      const after = event.clientX >= box.left + (box.width / 2);
      const outfits = getOutfits(this.base);
      const from = outfits.findIndex(o => o.id === moved);
      const [outfit] = outfits.splice(from, 1);
      let to = outfits.findIndex(o => o.id === card.dataset.outfitId);
      if ( to < 0 ) to = outfits.length;
      outfits.splice(after ? to + 1 : to, 0, outfit);
      await this.#save(outfits);
      return;
    }

    // Files from the computer
    if ( transfer.files?.length ) {
      const paths = await this.#uploadFiles(Array.from(transfer.files));
      if ( !paths.length ) return;
      if ( slot && card ) await this.#setSlot(card.dataset.outfitId, slot.dataset.slot, paths[0]);
      else await this.#addFiles(paths);
      return;
    }

    // Pictures from Foundry's file browser and other characters
    const data = dragData(event);
    if ( data?.type === "Actor" && data.uuid ) {
      const source = await fromUuid(data.uuid);
      if ( source?.documentName === "Actor" ) await this.#copyFrom(source);
      return;
    }
    const src = data?.texture?.src ?? data?.src ?? data?.path;
    if ( (typeof src !== "string") || !src ) return;
    if ( slot && card ) await this.#setSlot(card.dataset.outfitId, slot.dataset.slot, src);
    else await this.#addFiles([src]);
  }

  /**
   * Put an image into the portrait or token slot of an outfit. A video is only accepted as token image.
   * @param {string} id
   * @param {"portrait"|"token"} slot
   * @param {string} src
   */
  async #setSlot(id, slot, src) {
    if ( (slot === "portrait") && isVideo(src) ) {
      ui.notifications.warn(t("STW.Notify.videoPortrait"));
      return;
    }
    await this.#change(id, outfit => {
      outfit[slot] = src;
      if ( !outfit.label || (outfit.label === t("STW.Window.newName")) ) outfit.label = fileStem(src);
    });
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Put the outfit on.
   * @this {WardrobeApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onWear(event, target) {
    const id = target.closest("[data-outfit-id]")?.dataset.outfitId;
    if ( id ) await wear(this.token ?? this.actor, id);
    this.render();
  }

  /**
   * Pick an image for the portrait or the token of an outfit.
   * @this {WardrobeApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPick(event, target) {
    const id = target.closest("[data-outfit-id]")?.dataset.outfitId;
    const slot = target.closest("[data-slot]")?.dataset.slot;
    if ( !id || !slot || !canEdit(this.actor) ) return;
    if ( !fileRights().browse ) {
      ui.notifications.warn(t("STW.Window.noBrowseNotice"));
      return;
    }
    const outfit = getOutfits(this.base).find(o => o.id === id);
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({
      type: (slot === "token") ? "imagevideo" : "image",
      current: outfit?.[slot] || this.actor.img,
      callback: path => this.#setSlot(id, slot, path)
    }).render({force: true});
  }

  /**
   * Empty the portrait or the token slot of an outfit.
   * @this {WardrobeApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onClear(event, target) {
    const id = target.closest("[data-outfit-id]")?.dataset.outfitId;
    const slot = target.closest("[data-slot]")?.dataset.slot;
    if ( id && slot ) await this.#change(id, outfit => { outfit[slot] = ""; });
  }

  /**
   * Remove an outfit (the image files stay).
   * @this {WardrobeApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onRemove(event, target) {
    const id = target.closest("[data-outfit-id]")?.dataset.outfitId;
    const outfit = getOutfits(this.base).find(o => o.id === id);
    if ( !outfit ) return;
    const sure = await DialogV2.confirm({
      window: {title: t("STW.Card.removeTitle"), icon: "fa-solid fa-trash"},
      content: `<p>${esc(t("STW.Card.removeText", {name: outfit.label}))}</p>`,
      rejectClose: false
    });
    if ( !sure ) return;
    const outfits = getOutfits(this.base).filter(o => o.id !== id);
    const flags = (currentOutfitId(this.actor) === id) ? {[`flags.${MODULE_ID}.-=current`]: null} : {};
    await this.#save(outfits, flags);
  }

  /**
   * Move an outfit one place.
   * @this {WardrobeApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onMove(event, target) {
    const id = target.closest("[data-outfit-id]")?.dataset.outfitId;
    const outfits = getOutfits(this.base);
    const index = outfits.findIndex(o => o.id === id);
    const other = index + ((target.dataset.action === "moveLeft") ? -1 : 1);
    if ( (index < 0) || !outfits[other] ) return;
    [outfits[index], outfits[other]] = [outfits[other], outfits[index]];
    await this.#save(outfits);
  }

  /**
   * Set when the outfit puts itself on.
   * @this {WardrobeApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onAuto(event, target) {
    const id = target.closest("[data-outfit-id]")?.dataset.outfitId;
    const outfit = getOutfits(this.base).find(o => o.id === id);
    if ( !outfit ) return;
    const auto = await editAuto(outfit);
    if ( auto ) {
      countFeature(MODULE_ID, "autoSet");
      await this.#change(id, o => { o.auto = auto; });
    }
  }

  /**
   * Pick one image and add it as an outfit.
   * @this {WardrobeApp}
   */
  static #onAddImage() {
    if ( !fileRights().browse ) {
      ui.notifications.warn(t("STW.Window.noBrowseNotice"));
      return;
    }
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({
      type: "imagevideo",
      current: this.actor.img,
      callback: path => this.#addFiles([path])
    }).render({force: true});
  }

  /**
   * Upload files from the computer.
   * @this {WardrobeApp}
   */
  static #onUpload() {
    if ( !fileRights().upload ) {
      ui.notifications.warn(t("STW.Window.noUploadNotice"));
      return;
    }
    this.element.querySelector("input.stw-file")?.click();
  }

  /**
   * Pick a folder and add all its images.
   * @this {WardrobeApp}
   */
  static #onImportFolder() {
    if ( !fileRights().browse ) {
      ui.notifications.warn(t("STW.Window.noBrowseNotice"));
      return;
    }
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    const current = this.actor.img?.split("/").slice(0, -1).join("/");
    const picker = new FilePicker({
      type: "folder",
      current,
      callback: async path => {
        countFeature(MODULE_ID, "folderImport");
        try {
          const files = await browseMedia(picker.activeSource, path, picker.source?.bucket);
          if ( !files.length ) {
            ui.notifications.warn(t("STW.Window.noImages", {path}));
            return;
          }
          await this.#addFiles(files);
        } catch(err) {
          console.error(`${MODULE_ID} | Could not read the folder ${path}`, err);
          ui.notifications.error(t("STW.Window.folderFailed", {path}));
        }
      }
    });
    picker.render({force: true});
  }

  /**
   * Look for variants of the portrait and the token image next to them and add the ones the user picks.
   * @this {WardrobeApp}
   */
  static async #onSuggest() {
    if ( !fileRights().browse ) {
      ui.notifications.warn(t("STW.Window.noBrowseNotice"));
      return;
    }
    countFeature(MODULE_ID, "suggest");
    const {files, failed} = await findAlternates(this.base, getOutfits(this.base));
    if ( !files.length ) {
      if ( failed.length ) ui.notifications.error(t("STW.Window.folderFailed", {path: failed.join(", ")}));
      else ui.notifications.info(t("STW.Suggest.none"));
      return;
    }
    const picked = await pickAlternates(this.base, files);
    if ( picked.length ) await this.#addFiles(picked);
  }

  /**
   * Take the images of a wildcard token as outfits.
   * @this {WardrobeApp}
   */
  static async #onWildcard() {
    countFeature(MODULE_ID, "wildcard");
    let images = [];
    try {
      images = await this.base.getTokenImages();
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not read the wildcard images`, err);
    }
    images = images.filter(src => src && !src.includes("*"));
    if ( !images.length ) {
      ui.notifications.info(t("STW.Window.wildcardNone"));
      return;
    }
    await this.#addFiles(images, {single: "token"});
  }

  /**
   * An empty outfit.
   * @this {WardrobeApp}
   */
  static async #onNew() {
    const outfits = getOutfits(this.base);
    outfits.push({id: makeId(), label: t("STW.Window.newName"), portrait: "", token: ""});
    await this.#save(outfits);
  }

  /**
   * The three outfits of a new wardrobe, the first one with what the character has on now.
   * @this {WardrobeApp}
   */
  static async #onQuickStart() {
    const proto = this.base.prototypeToken;
    const outfits = quickStartOutfits([t("STW.Quick.street"), t("STW.Quick.battle"), t("STW.Quick.fine")], {
      portrait: this.base.img ?? "",
      token: proto.randomImg ? "" : (proto.texture.src ?? "")
    }, makeId);
    countFeature(MODULE_ID, "quickStart");
    await this.#save(getOutfits(this.base).concat(outfits), {
      [`flags.${MODULE_ID}.current`]: outfits[0].id,
      [`flags.${MODULE_ID}.manual`]: outfits[0].id
    });
  }
}

/* -------------------------------------------- */

/**
 * The data of a drag, from Foundry's drag sources (JSON) or a plain path.
 * @param {DragEvent} event
 * @returns {object|null}
 */
function dragData(event) {
  const raw = event.dataTransfer?.getData("text/plain") ?? "";
  if ( !raw ) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return /\.[a-z0-9]{2,5}(\?.*)?$/i.test(raw.trim()) ? {src: raw.trim()} : null;
  }
}

/**
 * A short text of what triggers an outfit.
 * @param {import("./outfits.mjs").Outfit} outfit
 * @returns {string}
 */
export function autoSummary(outfit) {
  const auto = outfit.auto;
  if ( !auto ) return "";
  const parts = [];
  if ( auto.combat ) parts.push(t("STW.Auto.inCombat"));
  if ( auto.hp !== null ) parts.push(t("STW.Auto.belowHp", {percent: auto.hp}));
  if ( auto.status.length ) parts.push(t("STW.Auto.whileStatus", {status: auto.status.map(statusName).join(", ")}));
  return parts.join(", ");
}

/**
 * The name of a status effect.
 * @param {string} id
 * @returns {string}
 */
function statusName(id) {
  const effect = CONFIG.statusEffects.find(e => e.id === id);
  const name = effect?.name ?? effect?.label ?? id;
  return game.i18n.localize(name);
}

/**
 * Let the user set the automation of an outfit.
 * @param {import("./outfits.mjs").Outfit} outfit
 * @returns {Promise<import("./outfits.mjs").OutfitAuto|null>}
 */
async function editAuto(outfit) {
  const auto = normalizeAuto(outfit.auto);
  const effects = CONFIG.statusEffects.filter(e => e.id && !e.hud?.invisible || (e.id && auto.status.includes(e.id)));
  const boxes = effects.map(e => `<label class="stw-status"><input type="checkbox" name="status" value="${esc(e.id)}"
    ${auto.status.includes(e.id) ? "checked" : ""}><img src="${esc(e.img ?? e.icon ?? "")}" alt=""><span>${esc(statusName(e.id))}</span></label>`)
    .join("");
  const content = document.createElement("div");
  content.innerHTML = `<div class="stw-auto-form"><p class="hint">${esc(t("STW.Auto.intro"))}</p>
    <label class="stw-check"><input type="checkbox" name="combat" ${auto.combat ? "checked" : ""}> ${esc(t("STW.Auto.combat"))}</label>
    <label class="stw-check">${esc(t("STW.Auto.hp"))}
      <input type="number" name="hp" min="1" max="100" step="1" value="${auto.hp ?? ""}" placeholder="-"> %</label>
    <p class="stw-auto-title">${esc(t("STW.Auto.status"))}</p>
    <div class="stw-status-list">${boxes}</div>
    <p class="hint">${esc(t("STW.Auto.outro"))}</p></div>`;
  const result = await DialogV2.wait({
    window: {title: t("STW.Auto.title", {name: outfit.label}), icon: "fa-solid fa-bolt"},
    classes: ["stw-app", "stw-auto-dialog"],
    position: {width: 460},
    content,
    buttons: [{
      action: "save", label: "STW.Auto.save", icon: "fa-solid fa-check", default: true,
      callback: (event, button) => normalizeAuto({
        combat: button.form.elements.combat.checked,
        hp: button.form.elements.hp.value,
        status: Array.from(button.form.querySelectorAll("input[name=status]:checked"), i => i.value)
      })
    }, {action: "cancel", label: "STW.Auto.cancel", icon: "fa-solid fa-xmark"}],
    render: (event, dialog) => {
      dialog.element.dataset.stwTheme = setting("theme");
    },
    rejectClose: false
  });
  return (result && (typeof result === "object")) ? result : null;
}

/* -------------------------------------------- */

/**
 * Files next to the portrait and the token image whose names continue theirs.
 * @param {Actor} actor
 * @param {import("./outfits.mjs").Outfit[]} existing
 * @returns {Promise<{files: string[], failed: string[]}>}
 */
async function findAlternates(actor, existing) {
  const token = actor.prototypeToken;
  const references = [...new Set([actor.img, token.randomImg ? null : token.texture.src])]
    .filter(src => src && (src !== CONST.DEFAULT_TOKEN) && !src.includes("*"));
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const files = [];
  const failed = [];
  const browsed = new Set();
  for ( const src of references ) {
    let target = src.split("/").slice(0, -1).join("/");
    try {
      const picker = new FilePicker({type: "image", current: src}); // Never rendered
      const source = picker.activeSource;
      const bucket = picker.source?.bucket;
      target = picker.source?.target ?? "";
      if ( !target && src.includes("/") ) continue;
      const key = `${source}:${bucket ?? ""}:${target}`;
      if ( browsed.has(key) ) continue;
      browsed.add(key);
      files.push(...await browseMedia(source, target, bucket));
    } catch(err) {
      console.warn(`${MODULE_ID} | Could not read the folder of ${src}`, err);
      failed.push(target);
    }
  }
  return {files: alternateFiles(files, references, {existing}), failed};
}

/**
 * Let the user tick the variants to add.
 * @param {Actor} actor
 * @param {string[]} files
 * @returns {Promise<string[]>}
 */
async function pickAlternates(actor, files) {
  const items = files.map(src => `<label class="stw-suggestion" data-tooltip="${esc(src)}">
    <input type="checkbox" name="files" value="${esc(src)}" checked>
    ${mediaHTML(src)}<span>${esc(fileStem(src))}</span></label>`);
  const content = document.createElement("div");
  content.innerHTML = `<p class="hint">${esc(t("STW.Suggest.intro"))}</p><div class="stw-suggestions">${items.join("")}</div>`;
  const picked = await DialogV2.wait({
    window: {title: t("STW.Suggest.title", {name: actor.name}), icon: "fa-solid fa-wand-magic-sparkles"},
    classes: ["stw-app", "stw-suggest"],
    position: {width: 560},
    content,
    buttons: [{
      action: "add", label: "STW.Suggest.add", icon: "fa-solid fa-plus", default: true,
      callback: (event, button) => Array.from(button.form.querySelectorAll("input[name=files]:checked"), i => i.value)
    }, {action: "cancel", label: "STW.Auto.cancel", icon: "fa-solid fa-xmark"}],
    render: (event, dialog) => {
      dialog.element.dataset.stwTheme = setting("theme");
    },
    rejectClose: false
  });
  return Array.isArray(picked) ? picked : [];
}
