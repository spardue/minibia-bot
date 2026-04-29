# Minibia Bot

This repo now has a simple source layout for browser-loaded Minibia routines, while still serving a single `pz-bot.js` bundle that you can reload from DevTools.

**Layout**

- [pz-bot.js](/home/yuno/minibia-bot/pz-bot.js): built browser bundle you load in game
- [src/core.js](/home/yuno/minibia-bot/src/core.js): shared runtime helpers
- [src/modules/pz.js](/home/yuno/minibia-bot/src/modules/pz.js): PZ/home navigation module
- [src/modules/rune.js](/home/yuno/minibia-bot/src/modules/rune.js): rune loop module
- [src/ui/panel.js](/home/yuno/minibia-bot/src/ui/panel.js): draggable in-game panel
- [src/main.js](/home/yuno/minibia-bot/src/main.js): bundle entrypoint
- [build.sh](/home/yuno/minibia-bot/build.sh): rebuilds `pz-bot.js` from `src/`

**Reload In Game**

```js
fetch("http://127.0.0.1:8000/pz-bot.js")
  .then((r) => r.text())
  .then((code) => eval(code));
```

**Main API**

```js
minibiaBot.status()

minibiaBot.pz.setHomePzCurrentSpot()
minibiaBot.pz.goToHomePz()
minibiaBot.pz.goToNearestPz()

minibiaBot.rune.start()
minibiaBot.rune.stop()
minibiaBot.rune.status()
```

Backward-compatible alias:

```js
pzBot.goToNearestPz()
```

**Rebuild After Editing `src/`**

```bash
./build.sh
```

**Notes**

- The panel is draggable and saves its position in `localStorage`.
- Reloading the bundle destroys the existing panel and stops the existing loops before installing the new one.
- The served runtime is `pz-bot.js`; source lives under `src/`.
