# Sephral’s Token Wardrobe: Manual

Every character can have a wardrobe. An outfit is a name with a portrait and a token image, and optionally a mood for the conversation stage and a disguise name. Putting an outfit on changes the portrait on the sheet and the token on the map together.

Besides that the module has four more parts: [every figure looks different](#every-figure-looks-different) (random looks for tokens that are not linked), [backdrops for the stage](#backdrops-for-the-stage), [feelings of the players](#feelings-of-the-players) and [equipment as trigger](#equipment-as-trigger).

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
* **Dice button and dice mark.** *Every figure different* sets the random looks of the character, the dice mark on a card takes the outfit into them, see [Every figure looks different](#every-figure-looks-different).
* **Automation.** The lightning button of a card opens its rules, see [Automatic outfits](#automatic-outfits). Drop an item from the sidebar or a sheet onto a card to link it to the outfit, see [Equipment as trigger](#equipment-as-trigger).

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
* The arrows button moves a portrait to the other side. The cross takes it off the stage. When the last portrait goes, the stage closes, unless a backdrop picture is up.
* The buttons *Left*, *Center* and *Right* put a portrait at a place. The layers button sets how far back it stands, see [Backdrops for the stage](#backdrops-for-the-stage).
* *Shading* switches between soft, dark and none for everyone. *Close stage* removes all portraits and the backdrop picture on every screen.
* Keys while the window has the focus: left and right choose the portrait, up and down or 1 to 9 pick an outfit, S marks the speaker, F changes the side, B shows the next backdrop and Shift+B the one before, Delete takes the portrait off the stage. These keys stay in the window and do not reach the hotbar of Foundry.

**Moods.** An outfit can carry a mood: neutral, friendly, happy, angry, hurt, sad, afraid, surprised, mocking, worried or thoughtful. Choose it on the card of the outfit. A mood is a name to ask for an outfit (`api.stage.setExpression(actor, "angry")`) and a small icon in the stage controls. Any outfit can be shown on the stage, with or without a mood.

**What the stage changes.** Showing another expression changes the stage only, the character keeps the outfit it wears. The world setting *Stage expressions put the outfit on* makes the character wear it as well.

**Names.** The name plate shows the disguise name of the outfit shown if it has one, else the disguise of the outfit the character wears, else the real name. The GM sees the real name under a disguise.

**On the screens of the players.** The stage is stored in a world setting, so every screen follows at once and a player who connects later sees the current stage. The settings *Show the conversation stage* and *Size of the stage portraits* belong to each device.

## Backdrops for the stage

The stage can have a backdrop: a wide picture or a looping video behind the portraits that fills the screen, like a scene of a film. The GM keeps a library of backdrops in the world and switches them from the stage controls.

**The library.** The controls window has a *Backdrops* section. *Add backdrop* picks a picture or a video, a picture dropped onto the section joins the library too. Each card shows the picture, its number (the number of the position in the library) and a note symbol when it has sound. Move the mouse over a card for the pen (change) and the bin (remove from the library, the file stays). The library is stored in the hidden world setting `backdrops`, only a GM writes it, every client reads it. A backdrop has:

* a name, which also appears as the title of the place for a few seconds when the backdrop is shown
* the picture or video
* an ambient sound file, which plays looping on every screen while the backdrop is up. It goes through the ambient channel of each user, and each player can switch it off for the own device with the setting *Backdrop sounds*. Browsers start audio only after the first click or key, so a screen which has had none starts the sound with it.
* a playlist, which the GM who switches to the backdrop starts. It is stopped again when the backdrop changes or the stage closes.
* the time of day and the panning it starts with

**Switching.** A click on a card shows that backdrop. It fades over the one before in about a second and a half. The keys B and Shift+B in the controls window, and the world keys *Next backdrop of the stage* and *Previous backdrop of the stage* (no default keys, GM only), step through the library. *No picture* takes the picture away. A backdrop alone opens the stage without portraits, and the stage stays open when the last portrait goes while a picture is up.

**Time of day.** *Plain*, *Dawn*, *Dusk* or *Night* put a soft colored light over the picture, with a gradient from the ground up. Choosing a backdrop takes the time of day stored with it, choosing the same backdrop again leaves what the GM set. *Slow pan* moves the picture slowly from side to side and back (about 70 seconds each way). It stops for users who have reduced motion switched on.

**Portraits in front.** Each portrait stands *Left*, *Center* or *Right*. Several portraits in the center stand side by side around the middle. The layers button sets the depth: front, middle or back. A portrait further back is smaller (82 and 66 percent), stands a little higher and is a little darker, so the portraits form a scene with depth. The name plate becomes a lower third while a backdrop picture is up: a bar with a golden edge, the speaker gets a lighter edge.

**Shading.** The setting *Shading of the conversation stage* (soft, dark or none) was called *Backdrop* before. It darkens the screen behind the portraits and stays under the picture of a backdrop.

**Your own pictures.** The module ships no backdrops. Any picture works, wide ones in a ratio of about 16 to 9 fill the screen best. The picture is scaled to cover the whole screen, so the edges may be cut.

## Every figure looks different

Five bandits placed from one actor should not look alike. For a character with unlinked tokens (the usual NPC), the button *Every figure different* in the wardrobe window opens its settings:

* **Take the looks from:** *Off*, *The outfits marked with the dice* or *All outfits*. The dice mark on each card takes an outfit into the first choice. An outfit without an image is never picked.
* **Also mirror the token image at random:** each token is mirrored or not, on top of the mirror setting of its outfit. The old scale is kept like with any mirrored outfit.

**When a token is placed.** Whenever an unlinked token of the character is created, by dragging the actor onto the scene (once or several times), by a group of saved encounters or by a macro, the client which creates it picks a look. The look is written into the new token before it is created (hook `preCreateToken`), so there is no second update and no flicker. The token gets the image, the scale, the disguise name of the outfit, the portrait of the outfit in its own actor data and the flags `current` and `manual` like any outfit that was put on. A token that already comes with a look of its own, for example a copy of a token, keeps it. Linked tokens are never changed.

**Spread.** The pick favors the outfits used the least on the unlinked tokens of this character on the scene, so five tokens placed one after the other show every look before one repeats. Tokens created in the same batch count too.

**A new look.** In the token HUD palette of an unlinked token the dice button rolls a new look for this token, other than the one it has now. Without the character having the setting on, or for a linked token, the button is not there. `api.variety.reroll(token)` does the same.

## Feelings of the players

A player shows a feeling for the own character: happy, angry, worried, sad, surprised or thoughtful. A symbol floats over the token on every screen and over the portrait on the conversation stage. If the character has an outfit with a matching mood, the look switches to it.

**How to show a feeling.**

* In the palette of the token HUD and in the palette at the sheet portrait: a row of six faces and a cross that takes the feeling away.
* With keys: *Shift+Alt+1* to *Shift+Alt+6* for the six feelings and *Shift+Alt+0* to take it away (Alt with a digit already switches the hotbar page in Foundry). They act on the controlled tokens the user may use, or on the character of the user. All seven keys can be changed in Foundry’s key settings.
* With the macro API: `api.feel(actor or token, "happy")`, and `api.feel(actor, null)` takes it away.

**What happens.** The symbol travels over the module socket. Every client checks that the sender owns the character before it draws anything, so a forged message shows nothing. Nothing is written to the world for the symbol itself. It lasts as long as *How long a feeling lasts* says (30 seconds by default, 0 keeps it until the feeling is changed). A reload of a screen forgets running symbols.

**The outfit.** The feeling looks for an outfit of the character with a matching mood, the first mood in the list wins: happy (happy, then friendly), angry (angry), worried (worried, then afraid), sad (sad, then hurt), surprised (surprised), thoughtful (thoughtful, then neutral). If there is one, the player puts it on with the same rights as for any outfit, so *Players put outfits on* must be on. The outfit that was on before is remembered (flag `feelBack`) and comes back when the time is over or the feeling is taken away. A second feeling keeps the first memory. If the player chooses an outfit by hand or the automation puts one on, the feeling ends and nothing comes back. The outfit a user chose by hand stays the chosen one, so the automation returns to it as usual. A linked token on other scenes follows through the GM’s browser like any outfit. An unlinked token changes alone.

**Rights.** The GM can always show feelings. Players need the setting *Players show feelings* (on by default) and the ownership of the character. The outfit also needs *Players put outfits on*. Without that right the symbol still shows and no outfit goes on, and the palette in the HUD and at the sheet shows only the feelings. With the feelings switched off the buttons of players who may not put on outfits disappear as before.

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
* while armor of the chosen kinds is equipped (D&D 5e and Pathfinder 2e): no armor, light, medium, heavy or a shield. Only equipped armor counts, and a shield does not count as armor for *No armor*.
* while one of the linked items is equipped, see [Equipment as trigger](#equipment-as-trigger)

Only the active GM’s browser runs the rules, so they need a GM at the table. The first matching outfit in the order of the window wins. When the situation ends, the outfit you chose by hand comes back. If you choose another outfit by hand during the fight, it stays until the situation changes. Nothing is written when nothing differs, so tokens do not flicker.

## Equipment as trigger

An outfit can be linked to items: the outfit goes on while the character has one of them equipped, and the look comes back when it is unequipped. It is part of the automation of the outfit (the lightning button) and works the same way, with the same order, the same memory of the look chosen by hand and the same rule that only the active GM writes.

**Linking.**

* Drop an item from the item sidebar, a compendium or another sheet onto the card of the outfit. The link remembers the name and, for an item from the sidebar or a compendium, its UUID. An item of the character itself is linked by its name and by the source it was made from, if it has one.
* Or open the lightning dialog and type names, separated by commas, into *Add by name*. Ticked links stay, unticked ones are removed.

**Matching.** A link matches an equipped item with the same name (ignoring case and extra blanks), or an equipped item that was made from the linked source. So a copy of a compendium item that the player renamed still matches. The card shows the linked names under its fields.

**What counts as equipped.** The module reads it per game system:

| System | Rule |
| --- | --- |
| D&D 5e | `system.equipped` is on |
| Pathfinder 2e | the item reports itself as equipped (worn in its slot, or held with enough hands), dropped and stowed items do not count |
| SWADE | `system.equipStatus` is above carried (off hand, equipped, main hand and more) |
| Crucible | `system.equipped` is on |
| any other system | the first sign of an equipped state on the item: `isEquipped`, then `system.equipped`, `isEquipped`, `equipStatus`, `equip`, `worn`, `isWorn`, `equipment.equipped`, `equipment.worn`, `state.equipped`. A boolean is taken as it is, a number above 1 counts as equipped, words like worn or held count, an object is read through `carryType`, `equipped`, `value` or `state`. |

An item with no sign of an equipped state counts as not equipped, so a system with an unusual field needs its items linked through a macro hook or stays without this rule. The armor rule (armor kinds in the lightning dialog) uses the same reading, so it now works in Pathfinder 2e too. Armor kinds exist only in D&D 5e and Pathfinder 2e.

**When it is checked.** When an item of a character is created, deleted or changed in its data, after a short pause that gathers several changes. Only characters whose outfits have linked items or armor kinds are looked at. Deleting an equipped item counts as unequipping it. A change which is no equip change writes nothing. Items of an unlinked token count for that token only.

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
| Shading of the conversation stage | How dark the screen is behind the portraits of a new stage: soft, dark or none. |
| Backdrop sounds | Plays the ambient sound of a backdrop on this device. This device only. |
| Players show feelings | Lets players who own a character show a feeling over the token and on the stage. World setting. |
| How long a feeling lasts | Seconds a feeling stays before the look from before comes back, 0 keeps it until it is changed. World setting. |
| Stage expressions put the outfit on | Off: an expression on the stage only changes the stage. On: the character also puts the outfit on. |
| Show the conversation stage | Show the stage on this device. This device only. |
| Size of the stage portraits | Small, normal or large on this device. This device only. |

The keys *Next backdrop of the stage* and *Previous backdrop of the stage* (GM) and the seven keys of the feelings are set in Foundry’s key settings.

The settings tab also has *Wardrobe* (opens the wardrobe of the selected token or your character) and *Conversation stage* (opens the stage controls, GM only).

## Self test

*Run self test* in the module settings (GM) checks after a Foundry or game system update that everything the module relies on is still there: the file functions, the token HUD palette, the sheet class, the token bars, the token transitions, the socket and the texts. The result appears as a message and in the chat. It also checks the rules of the stage, the disguises and the places, that the Region behavior is registered, the rules of random looks, backdrops, feelings and equipment, and that Foundry can draw the symbols and play sound.

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
| `stage.flip(id)`, `stage.backdrop(name)` | Another side for a portrait (by its id in `stage.state()`), another shading, `soft`, `dark` or `none` (GM). |
| `stage.place(actor, place)` | Puts a portrait at `left`, `center` or `right` (GM). |
| `stage.depth(actor, depth)` | How far back a portrait stands: 0 front, 1 middle, 2 back, or `"next"` (GM). |
| `backdrops.list()` | A copy of the library. |
| `backdrops.add(paths)` | Adds pictures or videos to the library, known files are skipped (GM). Returns the new backdrops. |
| `backdrops.update(id, changes)`, `backdrops.remove(id)` | Changes a backdrop (`name`, `img`, `sound`, `playlist`, `tint`, `pan`) or removes it (GM). |
| `backdrops.show(ref)` | Shows a backdrop by id, name or position from 1, `null` takes the picture away (GM). |
| `backdrops.next()`, `backdrops.previous()` | Steps through the library (GM). |
| `backdrops.tint(name)`, `backdrops.pan(on)` | The time of day, `none`, `dawn`, `dusk` or `night`, and the panning of the shown picture (GM). |
| `variety.get(actor)`, `variety.set(actor, {mode, mirror})` | Reads or sets the random looks of a character, `mode` is `off`, `marked` or `all`. |
| `variety.reroll(token)`, `variety.canReroll(token)` | Rolls a new look for an unlinked token, and tells whether that is possible. |
| `feel(target, feeling)` | Shows a feeling (`happy`, `angry`, `worried`, `sad`, `surprised`, `thoughtful` or a number from 1) for an actor or a token, `null` takes it away. Returns `{feeling, outfit}` or `null`. |
| `stage.open()` | Opens the stage controls (GM). |
| `stage.state()` | A copy of the stage as it is now. |
| `runSelfTest()` | Runs the self test (GM). |
| `saveDebugFile()` | Saves the debug file (GM). |

The hook `sephrals-token-wardrobe.worn` fires on the client that put an outfit on, with `{actor, token, outfit, source}`. `source` is `user`, `auto`, `place` (a Region or scene asked for it), `variety` (a random look) or `feeling`. The hook `sephrals-token-wardrobe.stage` fires on every client when the stage changes, with the stage. The hook `sephrals-token-wardrobe.feeling` fires on every client when a feeling is shown or taken away, with `{actorId, tokenUuid, feeling}`. Every call that takes an actor or a token also takes a UUID or the id or name of a world actor.

```js
const api = game.modules.get("sephrals-token-wardrobe").api;
await api.wear(canvas.tokens.controlled[0], "Battle gear");
await api.next(game.user.character);

// A talk: the innkeeper on the left, the own character on the right, the innkeeper speaks
await api.stage.show([{actor: "Innkeeper", side: "left"}, {actor: game.user.character, side: "right"}], {speaker: "Innkeeper"});
await api.stage.setExpression("Innkeeper", "angry");
await api.stage.hide();

// The same talk in a tavern, in the light of the evening
const [tavern] = await api.backdrops.add(["worlds/mine/tavern.webp"]);
await api.stage.show(["Innkeeper", game.user.character], {scenery: tavern.id});
await api.backdrops.tint("dusk");

// Five different bandits, then a feeling
await api.variety.set("Bandit", {mode: "all", mirror: true});
await api.feel(game.user.character, "worried");
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
* how often outfits are put on (in total, through the token HUD, through a key and by the automation), how often the sheet palette and the window are opened, how often portraits are brought onto the stage and expressions changed, how often a Region or scene puts an outfit on, and how often outfits are added, uploaded, copied, imported from a folder, found as variants or taken from wildcard images, how often the quick start and the automation dialog are used, how often random looks are set, given to new tokens and rolled again, how often backdrops are added, shown and adjusted (time of day, panning), how often portraits are placed or moved back, how often feelings are shown and put an outfit on, and how often items are linked to outfits and put an outfit on by being equipped
* the settings *Look*, *Button on the sheet portrait*, *Button in the token HUD*, *Players put outfits on*, *Players manage the wardrobe*, *Linked tokens on all scenes*, *Change of the token image*, *Automatic outfits* the settings of the conversation stage and the settings *Backdrop sounds*, *Players show feelings* and *How long a feeling lasts* (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, notes, pictures or other content of the world are sent.
