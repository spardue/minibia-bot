(() => {
  if (window.minibiaBot?.destroy) {
    window.minibiaBot.destroy();
  }

  const bundle = window.__minibiaBotBundle || {};
  const bot = bundle.createBot();

  bundle.installPzModule(bot);
  bundle.installRuneModule(bot);
  bundle.installPanel(bot);

  bot.ui.inject();

  bot.start = (...args) => bot.rune.start(...args);
  bot.stop = (...args) => bot.rune.stop(...args);
  bot.status = () => ({
    version: bot.version,
    pz: {
      home: bot.pz.getHomePz(),
    },
    rune: bot.rune.status(),
  });

  window.minibiaBot = bot;
  window.pzBot = bot.pz;
  delete window.__minibiaBotBundle;

  console.log("[minibia-bot] ready", {
    version: bot.version,
    modules: ["pz", "rune", "ui"],
  });
  console.log("minibiaBot.pz.goToNearestPz()");
  console.log("minibiaBot.pz.setHomePzCurrentSpot()");
  console.log("minibiaBot.pz.goToHomePz()");
  console.log("minibiaBot.rune.start()");
  console.log("minibiaBot.rune.stop()");
})();
