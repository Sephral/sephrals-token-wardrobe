# Sephral’s Token Wardrobe: Manual

Every character can have a wardrobe. An outfit is a name with a portrait and a token image. Putting an outfit on changes the portrait on the sheet and the token on the map together.

## Putting an outfit on

* **On the character sheet.** Move the mouse over the portrait. A small shirt button appears in the corner. Click it, then click an outfit. The palette closes and the portrait changes at once. The button shows only for those who may put outfits on, and for players only when the character has outfits or they may create some. Sheets from game systems that draw the portrait in an unusual way get the entry *Wardrobe* in the window menu instead.
* **In the token HUD.** Right click a token, open the shirt palette and click an outfit. After the token has changed, the HUD and the palette are open again, so the next change is one click.
* **From the actor sidebar.** Right click an actor and choose *Wardrobe* to open its window.
* **With keys.** *Next outfit of the selected tokens* and *Previous outfit of the selected tokens* have no default keys. Choose them in Foundry’s key settings. Without a selected token they act on your own character. *Open the wardrobe of the selected token* works the same way.
* **With a macro.** See [Macro API](#macro-api).

What changes: the portrait of the character, the token image of the character’s prototype token (used for new tokens), and the tokens on the map. For a token linked to its actor that means all its tokens on all scenes, if the GM allows it in the settings. A token that is not linked changes on its own, with its own portrait, and the other tokens of the same actor stay as they are. Opened from the sidebar, the outfit changes the actor and the tokens that are not linked keep their image.

An outfit without a portrait leaves the portrait as it is, an outfit without a token image leaves the token as it is. If a token ring is on and has its own picture, the outfit’s token image goes into the ring too, except videos.

## The wardrobe window

Open it from the shirt palette, the window menu of a sheet, the actor sidebar, the settings or a key.

* **Quick start.** An empty wardrobe offers *Start with three outfits*: street clothes, battle gear and fine clothes. The first one takes what the character wears now, the other two wait for pictures.
* **Cards.** Each card shows the portrait and the token image. Click one of them to pick a file. The small cross empties it. Rename the outfit in the name field. *Put on* shows *Worn* on the outfit that is on now.
* **Size and mirror.** Give an outfit a scale and a tick for *Mirror* if its token image should look the other way or stand bigger. The next outfit without them brings the old size back.
* **Order.** Drag a card onto another card or use the arrows. The order is the order in the palettes, and the automation uses it too.
* **Dropping images.** Drop files onto the window: from your computer, from Foundry’s file browser (the GM with the tiles layer active) or an actor from the sidebar to copy its outfits. A single image fills the portrait and the token. A video fills only the token, because a portrait must be an image. Files named like `battle token` and `battle portrait` (the words token and portrait at the end or the beginning of the name) become one outfit. Drop a file onto one slot of a card to fill just that slot.
* **Buttons on top.** *Image* picks one file, *Upload* uploads files from your computer, *Folder* makes an outfit of every image in a folder, *Find variants* looks next to the portrait and the token image for files with a similar name and lets you tick the ones to add, *Wildcard images* (only for tokens with random images) takes those images as outfits, *New outfit* adds an empty card.
* **Uploads** land in the folder `sephrals-token-wardrobe` inside the world folder, one subfolder per character. A file with a name that is already taken gets a number. Foundry cannot delete files, so removing an outfit leaves its images in the folder.
* **Automation.** The lightning button of a card opens its rules, see [Automatic outfits](#automatic-outfits).

## Automatic outfits

Each outfit can put itself on, by default none does. In the lightning dialog of a card choose any of these, an outfit with several goes on when one of them is true:

* while the character is in a fight that has started
* when the hit points are below a share (the value of the first token bar, so it works in every game system)
* while one of the chosen status effects is active

Only the active GM’s browser runs the rules, so they need a GM at the table. The first matching outfit in the order of the window wins. When the situation ends, the outfit you chose by hand comes back. If you choose another outfit by hand during the fight, it stays until the situation changes. Nothing is written when nothing differs, so tokens do not flicker.

## Rights

* The GM can always do everything.
* Players who own a character can put its outfits on (*Players put outfits on*) and manage the wardrobe (*Players manage the wardrobe*). Both are settings of the GM.
* Browsing and uploading files needs Foundry’s own file permissions. Without them the window says so and disables the file buttons. Players can still switch, rename and make empty outfits, and the GM can allow file access under Configure Permissions in Foundry’s settings.
* A player’s outfit reaches tokens on scenes the player cannot change through the GM’s browser. If no GM is connected, it waits and arrives when a GM connects.

## Settings

| Setting | Does |
| --- | --- |
| Module language | Follow Foundry’s language or use English or German for this module. This device only. |
| Look | *Signature* shows the windows on warm paper, *Foundry* keeps them dark. This device only. |
| Button on the sheet portrait | Shows or hides the shirt button on sheets. This device only. |
| Button in the token HUD | Shows or hides the shirt button in the HUD. This device only. |
| Players put outfits on | Lets players who own a character switch its outfits. |
| Players manage the wardrobe | Lets players add, rename, sort and remove outfits of their characters. |
| Linked tokens on all scenes | A new outfit also goes on the linked tokens on every scene. Off: only the scene you are looking at. |
| Change of the token image | How the token image changes: instant, fade, swirl, water drop, morph, crosshatch, wind, waves, white noise, hologram, hole, hole swirl, glitch or dots. |
| Automatic outfits | Switches the automation for the whole world. |

The settings tab also has *Wardrobe* (opens the wardrobe of the selected token or your character).

## Self test

*Run self test* in the module settings (GM) checks after a Foundry or game system update that everything the module relies on is still there: the file functions, the token HUD palette, the sheet class, the token bars, the token transitions, the socket and the texts. The result appears as a message and in the chat.

## Debug file

For bug reports, the GM saves one file about all of Sephral’s modules in this world: `Save debug file` in the module settings, or `Save Debug File (Sephral’s Modules)` in the context menu of a chat message.

The file contains chat text and whispers. Check it before you share it.

## Sephral’s Modules

The first button in the module settings, *Sephral’s Modules* (GMs only), opens one window for all of Sephral's modules in the world: the version, self test, settings, manual and demo video of each, a button that switches on an installed module that is off (Foundry then reloads the world for everyone), and the debug file. Below, *More from Sephral* lists other modules that fit the game system of the world, shown only after a click, each with its demo video and an *Install* button. Foundry installs modules only on its setup screen, so the button copies the module's link (manifest URL) and shows the steps with a short clip. When the GM launches the world again, the window opens once with the new module and its *Enable* button. The list is part of the module. Only a video you start is loaded, from the module page on GitHub.

## Macro API

`game.modules.get("sephrals-token-wardrobe").api` has:

| Call | Does |
| --- | --- |
| `wear(target, outfit)` | Puts an outfit on an actor, a token (document or on the canvas) or a UUID. The outfit is its name, its position from 1 in the wardrobe or its id. Returns `{actor, token, outfit}` or `null`. |
| `next(target)` and `previous(target)` | Put on the next or previous outfit, wrapping around. |
| `open(target)` | Opens the wardrobe window. |
| `outfits(target)` | The outfits of a character as a list of copies. |
| `current(target)` | The outfit that is on now, or `null`. |
| `runSelfTest()` | Runs the self test (GM). |
| `saveDebugFile()` | Saves the debug file (GM). |

The hook `sephrals-token-wardrobe.worn` fires on the client that put an outfit on, with `{actor, token, outfit, source}`. `source` is `user` or `auto`.

```js
const api = game.modules.get("sephrals-token-wardrobe").api;
await api.wear(canvas.tokens.controlled[0], "Battle gear");
await api.next(game.user.character);
```

## Limits

* Foundry cannot delete files from a module, so removed outfits keep their image files.
* A token that is not linked keeps its own portrait, so changing the outfit of its world actor from the sidebar changes the portrait of tokens that were never dressed by hand, but not their token images.
* The automation needs an active GM. Players’ outfits for other scenes wait for a GM as well.
* Dropping from the file browser only works for the GM with the tiles layer active, a Foundry rule.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Token Wardrobe it holds:

* on how many of the last 30 days the module was used
* how often outfits are put on (in total, through the token HUD, through a key and by the automation), how often the sheet palette and the window are opened, and how often outfits are added, uploaded, copied, imported from a folder, found as variants or taken from wildcard images, how often the quick start and the automation dialog are used
* the settings *Look*, *Button on the sheet portrait*, *Button in the token HUD*, *Players put outfits on*, *Players manage the wardrobe*, *Linked tokens on all scenes*, *Change of the token image* and *Automatic outfits* (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, notes, pictures or other content of the world are sent.
