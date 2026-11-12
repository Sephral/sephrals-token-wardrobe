# Sephral’s Token Wardrobe: Manual

Every character can have a wardrobe. An outfit is a name with a portrait and a token image, and optionally a mood for the conversation stage and a disguise name. Putting an outfit on changes the portrait on the sheet and the token on the map together.

## Putting an outfit on

* **On the character sheet.** Move the mouse over the portrait. A small shirt button appears in the corner. Click it, then click an outfit. The palette closes and the portrait changes at once. The button shows only for those who may put outfits on, and for players only when the character has outfits or they may create some. Sheets from game systems that draw the portrait in an unusual way get the entry *Wardrobe* in the window menu instead.
* **In the token HUD.** Right click a token, open the shirt palette and click an outfit. After the token has changed, the HUD and the palette are open again, so the next change is one click.
* **From the actor sidebar.** Right click an actor and choose *Wardrobe* to open its window.
* **With keys.** *Next outfit of the selected tokens* and *Previous outfit of the selected tokens* have no default keys. Choose them in Foundry’s key settings. Without a selected token they act on your own character. *Open the wardrobe of the selected token* works the same way. The GM has two more keys: *Open the conversation stage* and *Close the conversation stage for all*.
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

## Conversation stage

For a talk with an innkeeper or a duke the GM brings portraits big onto every screen: left and right over the map, each with a name plate, on a soft backdrop. Players cannot change the stage, they only watch.

**Bring a character on.**

* In the actor sidebar: right click an actor and choose *Bring to the conversation stage*.
* In the token HUD palette or the palette at the sheet portrait: the mask button (GM only).
* In the wardrobe window: the button *Stage*.
* In the controls window: pick a character from the list, drop an actor or a token onto the window, or use *Selected tokens*.
* With the macro API, see [Macro API](#macro-api).

A portrait shows the portrait image of the outfit the character wears. A character without outfits shows its own picture. Up to six portraits fit on the stage. They take the left and the right side in turn, more portraits on one side overlap a little. The stage keeps clear of the sidebar and works from 1280 pixels wide.

**The controls window** (also in the module settings and with the key *Open the conversation stage*) shows a card for every portrait with all outfits of the character as small pictures.

* Click an outfit to show it. This changes the expression for everyone at once, with a soft fade.
* The speech bubble marks who speaks. That portrait steps forward, gets a golden name plate and the others dim. Click it again to take the mark off.
* The arrows button moves a portrait to the other side. The cross takes it off the stage. When the last portrait goes, the stage closes.
* *Backdrop* switches between soft, dark and none for everyone. *Close stage* removes all portraits on every screen.
* Keys while the window has the focus: left and right choose the portrait, up and down or 1 to 9 pick an outfit, S marks the speaker, F changes the side, Delete takes the portrait off the stage. These keys stay in the window and do not reach the hotbar of Foundry.

**Moods.** An outfit can carry a mood: neutral, friendly, happy, angry, hurt, sad, afraid, surprised or mocking. Choose it on the card of the outfit. A mood is a name to ask for an outfit (`api.stage.setExpression(actor, "angry")`) and a small icon in the stage controls. Any outfit can be shown on the stage, with or without a mood.

**What the stage changes.** Showing another expression changes the stage only, the character keeps the outfit it wears. The world setting *Stage expressions put the outfit on* makes the character wear it as well.

**Names.** The name plate shows the disguise name of the outfit shown if it has one, else the disguise of the outfit the character wears, else the real name. The GM sees the real name under a disguise.

**On the screens of the players.** The stage is stored in a world setting, so every screen follows at once and a player who connects later sees the current stage. The settings *Show the conversation stage* and *Size of the stage portraits* belong to each device.

## Disguises

An outfit can have a *Disguise name* (the field with the mask symbol on its card). While the outfit is worn:

* the token shows that name instead of the real one, on the map, in chat messages and on the conversation stage
* the real name is kept aside and comes back with the next outfit without a disguise name
* the GM sees both on the map: the disguise with the real name in brackets
* the name display of the token stays as it is: a token with names switched off or shown on hover behaves as before

The wardrobe window tells the GM when the character is disguised. The name of the character itself stays the same.

A disguise works like every outfit: it changes the linked tokens of the character on all scenes, or one unlinked token. The real name is kept as a flag on the token, so a player who reads the token data with tools can find it. A disguise hides the name from the eyes of the table, not from a determined player.

## Outfits by place

**Region behavior.** In the Region configuration add the behavior *Put on outfit*. Choose the outfit by its name, for example *Street clothes*, and what happens on leaving: *Keep the outfit* or *Put the previous outfit back*. A token which enters the Region puts the outfit on. A token whose character has no outfit of that name stays as it is. With *Put the previous outfit back* the token gets the outfit it had before when it leaves. If it had none, nothing changes.

**Scene.** Every scene has the same option in its configuration, under *Token Wardrobe* in the first tab: the name of an outfit and what happens when the scene ends. When the scene is activated, the tokens on it put the outfit on. Tokens added while the scene is active do the same. A scene which is not active changes nothing. With *Put the previous outfit back* the tokens get their previous outfits back when another scene is activated. This works on Foundry 13 and 14.

Only the active GM writes these changes, so a GM must be connected. Tokens moved by players work the same way.

## Automatic outfits

Each outfit can put itself on, by default none does. In the lightning dialog of a card choose any of these, an outfit with several goes on when one of them is true:

* while the character is in a fight that has started
* when the hit points are below a share (the value of the first token bar, so it works in every game system)
* while one of the chosen status effects is active
* while armor of the chosen kinds is equipped (D&D 5e only): no armor, light, medium, heavy or a shield. Only equipped armor counts, and a shield does not count as armor for *No armor*.

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
| Backdrop of the conversation stage | The look behind the portraits of a new stage: soft, dark or none. |
| Stage expressions put the outfit on | Off: an expression on the stage only changes the stage. On: the character also puts the outfit on. |
| Show the conversation stage | Show the stage on this device. This device only. |
| Size of the stage portraits | Small, normal or large on this device. This device only. |

The settings tab also has *Wardrobe* (opens the wardrobe of the selected token or your character) and *Conversation stage* (opens the stage controls, GM only).

## Self test

*Run self test* in the module settings (GM) checks after a Foundry or game system update that everything the module relies on is still there: the file functions, the token HUD palette, the sheet class, the token bars, the token transitions, the socket and the texts. The result appears as a message and in the chat. It also checks the rules of the stage, the disguises and the places, and that the Region behavior is registered.

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
| `stage.show(actors, options)` | Shows a stage (GM). `actors` is a list of actors, tokens, UUIDs or names, or entries like `{actor, outfit, side}`. Options: `replace` (default true, false adds to the stage), `speaker`, `backdrop` (`soft`, `dark`, `none`) and `open` (open the controls). Returns the stage. |
| `stage.add(actor, options)` | Brings one character on or changes its portrait (GM). Options: `outfit` (id, name, position or mood), `side`, `speaking`, `open`. |
| `stage.setExpression(actor, outfit)` | Shows an outfit on a portrait (GM). The outfit is its id, name, position from 1 or a mood such as `angry`. Returns the portrait or `null`. |
| `stage.speak(actor)` | Marks who speaks, `null` for nobody (GM). |
| `stage.remove(actor)`, `stage.hide()` | Takes one portrait off, or closes the stage for all (GM). |
| `stage.flip(id)`, `stage.backdrop(name)` | Another side for a portrait (by its id in `stage.state()`), another backdrop (GM). |
| `stage.open()` | Opens the stage controls (GM). |
| `stage.state()` | A copy of the stage as it is now. |
| `runSelfTest()` | Runs the self test (GM). |
| `saveDebugFile()` | Saves the debug file (GM). |

The hook `sephrals-token-wardrobe.worn` fires on the client that put an outfit on, with `{actor, token, outfit, source}`. `source` is `user`, `auto` or `place` (a Region or scene asked for it). The hook `sephrals-token-wardrobe.stage` fires on every client when the stage changes, with the stage.

```js
const api = game.modules.get("sephrals-token-wardrobe").api;
await api.wear(canvas.tokens.controlled[0], "Battle gear");
await api.next(game.user.character);

// A talk: the innkeeper on the left, the own character on the right, the innkeeper speaks
await api.stage.show([{actor: "Innkeeper", side: "left"}, {actor: game.user.character, side: "right"}], {speaker: "Innkeeper"});
await api.stage.setExpression("Innkeeper", "angry");
await api.stage.hide();
```

## Limits

* Foundry cannot delete files from a module, so removed outfits keep their image files.
* A token that is not linked keeps its own portrait, so changing the outfit of its world actor from the sidebar changes the portrait of tokens that were never dressed by hand, but not their token images.
* The automation, the Regions and the scenes need an active GM. Players’ outfits for other scenes wait for a GM as well.
* Only a GM runs the conversation stage. Its portraits are pictures on the screen, not tokens, so they have no sheet and no rights of their own.
* A disguise name is kept on the token, see [Disguises](#disguises).
* Dropping from the file browser only works for the GM with the tiles layer active, a Foundry rule.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Token Wardrobe it holds:

* on how many of the last 30 days the module was used
* how often outfits are put on (in total, through the token HUD, through a key and by the automation), how often the sheet palette and the window are opened, how often portraits are brought onto the stage and expressions changed, how often a Region or scene puts an outfit on, and how often outfits are added, uploaded, copied, imported from a folder, found as variants or taken from wildcard images, how often the quick start and the automation dialog are used
* the settings *Look*, *Button on the sheet portrait*, *Button in the token HUD*, *Players put outfits on*, *Players manage the wardrobe*, *Linked tokens on all scenes*, *Change of the token image*, *Automatic outfits* and the settings of the conversation stage (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, notes, pictures or other content of the world are sent.
