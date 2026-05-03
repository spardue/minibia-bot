window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.createBot = function createBot() {
  const cleanups = [];
  const defaultAlarmAudioSrc = "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3f/ACA_Allertor_125_video.ogv/ACA_Allertor_125_video.ogv.480p.vp9.webm";
  const alarmAudioSrcStorageKey = "minibiaBot.audio.alarmSrc";
  let alarmAudio = null;

  function addCleanup(fn) {
    if (typeof fn === "function") {
      cleanups.push(fn);
    }
  }

  function runCleanups() {
    while (cleanups.length) {
      const fn = cleanups.pop();
      try {
        fn();
      } catch (error) {
        console.error("[minibia-bot] cleanup failed", error);
      }
    }
  }

  function getStoredAlarmAudioSrc() {
    try {
      const value = window.localStorage.getItem(alarmAudioSrcStorageKey);
      return value == null ? defaultAlarmAudioSrc : JSON.parse(value);
    } catch (error) {
      return defaultAlarmAudioSrc;
    }
  }

  function setStoredAlarmAudioSrc(src) {
    window.localStorage.setItem(alarmAudioSrcStorageKey, JSON.stringify(src));
    return src;
  }

  function destroyAlarmAudio() {
    if (!alarmAudio) {
      return;
    }

    try {
      alarmAudio.pause();
      alarmAudio.removeAttribute("src");
      alarmAudio.load();
    } catch (error) {
      console.error("[minibia-bot] audio cleanup failed", error);
    }

    alarmAudio = null;
  }

  function getAlarmAudio() {
    const src = getStoredAlarmAudioSrc();
    if (!src) {
      return null;
    }

    if (!alarmAudio) {
      alarmAudio = new Audio(src);
      alarmAudio.preload = "auto";
    } else if (alarmAudio.src !== src) {
      alarmAudio.pause();
      alarmAudio = new Audio(src);
      alarmAudio.preload = "auto";
    }

    return alarmAudio;
  }

  return {
    version: "0.2.0",
    addCleanup,
    destroy() {
      if (this.panic?.stop) {
        this.panic.stop();
      }

      if (this.rune?.stop) {
        this.rune.stop();
      }

      if (this.eat?.stop) {
        this.eat.stop();
      }

      if (this.ui?.destroy) {
        this.ui.destroy();
      }

      destroyAlarmAudio();
      runCleanups();
    },
    log(...args) {
      console.log("[minibia-bot]", ...args);
    },
    storage: {
      get(key, fallback = null) {
        try {
          const value = window.localStorage.getItem(key);
          return value == null ? fallback : JSON.parse(value);
        } catch (error) {
          return fallback;
        }
      },
      set(key, value) {
        window.localStorage.setItem(key, JSON.stringify(value));
        return value;
      },
      remove(key) {
        window.localStorage.removeItem(key);
      },
    },
    getPlayerPosition() {
      return window.gameClient?.player?.getPosition?.() || null;
    },
    getPlayerState() {
      return window.gameClient?.player?.state || null;
    },
    sendChat(text) {
      const channelManager = window.gameClient?.interface?.channelManager;
      if (!channelManager || !text) {
        return false;
      }

      channelManager.sendMessageText(text);
      this.log("sent chat:", text);
      return true;
    },
    clickHotbar(index) {
      const button = window.gameClient?.interface?.hotbarManager?.slots?.[index]?.canvas?.canvas;
      if (!button) {
        return false;
      }

      button.click();
      return true;
    },
    getAlarmAudioSrc() {
      return getStoredAlarmAudioSrc();
    },
    setAlarmAudioSrc(src) {
      const nextSrc = String(src || "").trim();
      if (!nextSrc) {
        return false;
      }

      setStoredAlarmAudioSrc(nextSrc);
      destroyAlarmAudio();
      this.log("alarm audio updated", nextSrc);
      return true;
    },
    unlockAudio() {
      try {
        const audio = getAlarmAudio();
        if (!audio) {
          return false;
        }

        audio.muted = true;
        const playResult = audio.play();

        if (playResult && typeof playResult.then === "function") {
          playResult
            .then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = false;
            })
            .catch((error) => {
              audio.muted = false;
              this.log("audio unlock failed", error?.message || error);
            });
        } else {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }

        return true;
      } catch (error) {
        console.error("[minibia-bot] audio unlock failed", error);
        return false;
      }
    },
    playAlarm() {
      try {
        const audio = getAlarmAudio();
        if (!audio) {
          return false;
        }

        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        const playResult = audio.play();

        if (playResult && typeof playResult.catch === "function") {
          playResult.catch((error) => {
            this.log("alarm playback failed", error?.message || error);
          });
        }

        return true;
      } catch (error) {
        console.error("[minibia-bot] alarm failed", error);
        return false;
      }
    },
  };
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPzModule = function installPzModule(bot) {
  const homeStorageKey = "minibiaBot.pz.home";

  function getLoadedTiles() {
    const chunks = window.gameClient?.world?.chunks || [];
    const tiles = [];

    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;

      for (const tile of chunk.tiles) {
        if (tile?.__position) {
          tiles.push(tile);
        }
      }
    }

    return tiles;
  }

  function hasPzFlag(tile) {
    return !!tile && ((tile.flags || 0) & 1) !== 0;
  }

  function getPzCandidates() {
    const me = bot.getPlayerPosition();
    if (!me) return [];

    return getLoadedTiles()
      .filter((tile) => hasPzFlag(tile) && tile.__position?.z === me.z)
      .map((tile) => {
        const p = tile.__position;
        return {
          tile,
          x: p.x,
          y: p.y,
          z: p.z,
          flags: tile.flags || 0,
          dist: Math.abs(p.x - me.x) + Math.abs(p.y - me.y),
        };
      })
      .sort((a, b) => a.dist - b.dist);
  }

  function goToTile(tile) {
    if (!tile?.__position) return false;

    const from = bot.getPlayerPosition();
    if (!from) return false;

    const p = tile.__position;
    const to = new Position(p.x, p.y, p.z);

    try {
      window.gameClient?.world?.pathfinder?.findPath?.(from, to);
      bot.log("pathing to", { x: p.x, y: p.y, z: p.z, flags: tile.flags });
      return true;
    } catch (error) {
      bot.log("pathing failed", { x: p.x, y: p.y, z: p.z, error: error?.message });
      return false;
    }
  }

  function goToNearestPz(maxAttempts = 20) {
    const candidates = getPzCandidates().slice(0, maxAttempts);

    if (!candidates.length) {
      bot.log("No PZ candidates found");
      return false;
    }

    for (const candidate of candidates) {
      if (goToTile(candidate.tile)) {
        bot.log("selected PZ", {
          x: candidate.x,
          y: candidate.y,
          z: candidate.z,
          flags: candidate.flags,
          dist: candidate.dist,
        });
        return true;
      }
    }

    bot.log("No PZ candidate accepted by pathfinder");
    return false;
  }

  function setHomePz(x, y, z) {
    const home = { x, y, z };
    bot.storage.set(homeStorageKey, home);
    bot.log("home PZ set", home);
    return home;
  }

  function setHomePzCurrentSpot() {
    const pos = bot.getPlayerPosition();
    if (!pos) {
      bot.log("Could not read current position");
      return null;
    }

    return setHomePz(pos.x, pos.y, pos.z);
  }

  function getHomePz() {
    return bot.storage.get(homeStorageKey, null);
  }

  function clearHomePz() {
    bot.storage.remove(homeStorageKey);
    bot.log("home PZ cleared");
  }

  function getNearestPzTo(x, y, z) {
    const candidates = getLoadedTiles()
      .filter((tile) => hasPzFlag(tile) && tile.__position?.z === z)
      .map((tile) => {
        const p = tile.__position;
        return {
          tile,
          x: p.x,
          y: p.y,
          z: p.z,
          flags: tile.flags || 0,
          dist: Math.abs(p.x - x) + Math.abs(p.y - y),
        };
      })
      .sort((a, b) => a.dist - b.dist);

    return candidates[0] || null;
  }

  function goToHomePz() {
    const home = getHomePz();
    if (!home) {
      bot.log("No home PZ set");
      return false;
    }

    const candidate = getNearestPzTo(home.x, home.y, home.z);
    if (!candidate) {
      bot.log("No loaded PZ found near saved home", home);
      return false;
    }

    bot.log("home candidate", {
      x: candidate.x,
      y: candidate.y,
      z: candidate.z,
      flags: candidate.flags,
      distFromHome: candidate.dist,
    });

    return goToTile(candidate.tile);
  }

  function printPzCandidates(limit = 10) {
    const rows = getPzCandidates()
      .slice(0, limit)
      .map((candidate) => ({
        x: candidate.x,
        y: candidate.y,
        z: candidate.z,
        flags: candidate.flags,
        dist: candidate.dist,
      }));

    console.table(rows);
    return rows;
  }

  bot.pz = {
    getLoadedTiles,
    getPzCandidates,
    goToTile,
    goToNearestPz,
    setHomePz,
    setHomePzCurrentSpot,
    getHomePz,
    clearHomePz,
    getNearestPzTo,
    goToHomePz,
    printPzCandidates,
  };

  bot.goToNearestPz = goToNearestPz;
  bot.setHomePz = setHomePz;
  bot.setHomePzCurrentSpot = setHomePzCurrentSpot;
  bot.getHomePz = getHomePz;
  bot.clearHomePz = clearHomePz;
  bot.goToHomePz = goToHomePz;
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPanicModule = function installPanicModule(bot) {
  const configStorageKey = "minibiaBot.panic.config";
  const state = {
    running: false,
    timerId: null,
    lastHealth: null,
    lastTriggerAt: 0,
    lastDamageEventKey: null,
  };

  const config = Object.assign(
    {
      tickMs: 1000,
      triggerCooldownMs: 4000,
      unknownPlayerEnabled: false,
      healthLossEnabled: false,
      trustedNames: [],
      gameMasterNames: [],
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function getTrustedNames() {
    return Array.from(
      new Set(
        (config.trustedNames || [])
          .map((name) => normalizeName(name))
          .filter(Boolean)
      )
    );
  }

  function getGameMasterNames() {
    return Array.from(
      new Set(
        (config.gameMasterNames || [])
          .map((name) => normalizeName(name))
          .filter(Boolean)
      )
    );
  }

  function isWithinVisibleRange(me, pos) {
    if (!me || !pos) {
      return false;
    }

    const dx = Math.abs(pos.x - me.x);
    const dy = Math.abs(pos.y - me.y);
    return dx <= 8 && dy <= 6;
  }

  function getVisibleCreatures() {
    const me = bot.getPlayerPosition();
    const myState = bot.getPlayerState();
    const myId = window.gameClient?.player?.id;
    const myName = normalizeName(myState?.name);

    if (!me) {
      return [];
    }

    return Object.values(window.gameClient?.world?.activeCreatures || {}).filter((creature) => {
      if (!creature) return false;
      if (creature.id === myId) return false;

      const name = normalizeName(creature.name);
      if (name && name === myName) return false;

      const pos = creature.__position;
      return isWithinVisibleRange(me, pos);
    });
  }

  function getVisiblePlayers() {
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getVisibleCreatures().filter(
      (creature) => creature?.type === 0 && creature.__position?.z === me.z
    );
  }

  function getUnknownVisiblePlayers() {
    const trusted = new Set(getTrustedNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && !trusted.has(name);
    });
  }

  function getTrustedVisiblePlayers() {
    const trusted = new Set(getTrustedNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && trusted.has(name);
    });
  }

  function getVisibleGameMasters() {
    const gameMasters = new Set(getGameMasterNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && gameMasters.has(name);
    });
  }

  function getRecentChannelMessages() {
    return (window.gameClient?.interface?.channelManager?.channels || []).flatMap((channel) =>
      (channel?.__contents || []).map((entry) => ({
        channelName: channel?.name || null,
        message: String(entry?.message || ""),
        time: entry?.__time || null,
      }))
    );
  }

  function parseDamageMessage(entry) {
    const match = entry.message.match(
      /^You lose\s+(\d+)\s+hitpoints\s+due to an attack by\s+(.+?)\.$/i
    );

    if (!match) {
      return null;
    }

    return {
      amount: Number(match[1]),
      attackerName: match[2].trim(),
      time: entry.time,
      channelName: entry.channelName,
      key: `${entry.time || "no-time"}|${entry.message}`,
      message: entry.message,
    };
  }

  function getLatestDamageEvent() {
    const messages = getRecentChannelMessages()
      .map(parseDamageMessage)
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = a.time ? Date.parse(a.time) : 0;
        const bTime = b.time ? Date.parse(b.time) : 0;
        return bTime - aTime;
      });

    return messages[0] || null;
  }

  function triggerPanic(reason, details = {}) {
    if (Date.now() - state.lastTriggerAt < config.triggerCooldownMs) {
      return false;
    }

    state.lastTriggerAt = Date.now();
    bot.playAlarm?.();
    bot.log("panic triggered", { reason, ...details });
    return !!bot.pz?.goToHomePz?.();
  }

  function triggerGameMasterKillSwitch(players) {
    const detectedPlayers = (players || []).map((player) => player?.name).filter(Boolean);

    bot.playAlarm?.();
    bot.log("game master kill switch triggered", { players: detectedPlayers });

    if (bot.rune?.stop) {
      bot.rune.stop();
    }

    if (bot.eat?.stop) {
      bot.eat.stop();
    }

    config.unknownPlayerEnabled = false;
    config.healthLossEnabled = false;
    persistConfig();
    stop();

    bot.ui?.refreshPanicStatus?.();
    bot.ui?.refreshRuneStatus?.();
    bot.ui?.refreshAutoEatStatus?.();
    return true;
  }

  function checkGameMasters() {
    if (!getGameMasterNames().length) {
      return false;
    }

    const visibleGameMasters = getVisibleGameMasters();
    if (!visibleGameMasters.length) {
      return false;
    }

    return triggerGameMasterKillSwitch(visibleGameMasters);
  }

  function checkUnknownPlayers() {
    if (!config.unknownPlayerEnabled) {
      return false;
    }

    const unknownPlayers = getUnknownVisiblePlayers();
    if (!unknownPlayers.length) {
      return false;
    }

    return triggerPanic("unknown-player", {
      players: unknownPlayers.map((player) => player.name),
    });
  }

  function checkHealthLoss() {
    if (!config.healthLossEnabled) {
      return false;
    }

    const playerState = bot.getPlayerState();
    const currentHealth = Number(playerState?.health ?? 0);

    if (state.lastHealth == null) {
      state.lastHealth = currentHealth;
      return false;
    }

    const lostHealth = currentHealth < state.lastHealth;
    state.lastHealth = currentHealth;

    if (!lostHealth) {
      return false;
    }

    const latestDamageEvent = getLatestDamageEvent();
    if (latestDamageEvent && latestDamageEvent.key !== state.lastDamageEventKey) {
      state.lastDamageEventKey = latestDamageEvent.key;

      const trustedNames = new Set(getTrustedNames());
      const attackerName = normalizeName(latestDamageEvent.attackerName);

      if (attackerName && trustedNames.has(attackerName)) {
        bot.log("ignored health-loss panic because attacker is trusted", {
          attacker: latestDamageEvent.attackerName,
          amount: latestDamageEvent.amount,
          currentHealth,
        });
        return false;
      }

      return triggerPanic("health-loss", {
        currentHealth,
        attacker: latestDamageEvent.attackerName,
        amount: latestDamageEvent.amount,
      });
    }

    const unknownPlayers = getUnknownVisiblePlayers();
    if (!unknownPlayers.length) {
      const trustedPlayers = getTrustedVisiblePlayers();
      if (trustedPlayers.length) {
        bot.log("ignored health-loss panic because only trusted players are nearby", {
          players: trustedPlayers.map((player) => player.name),
          currentHealth,
        });
        return false;
      }
    }

    return triggerPanic("health-loss", { currentHealth });
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      checkGameMasters() || checkUnknownPlayers() || checkHealthLoss();
    } finally {
      scheduleNextTick();
    }
  }

  function shouldRun() {
    return !!(getGameMasterNames().length || config.unknownPlayerEnabled || config.healthLossEnabled);
  }

  function start() {
    if (state.running) {
      return false;
    }

    state.running = true;
    state.lastHealth = Number(bot.getPlayerState()?.health ?? 0);
    state.lastDamageEventKey = getLatestDamageEvent()?.key || null;
    bot.log("panic runner started", { ...config });
    tick();
    return true;
  }

  function stop() {
    if (!state.running && state.timerId == null) {
      state.lastHealth = null;
      return false;
    }

    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    state.lastHealth = null;
    state.lastDamageEventKey = null;
    bot.log("panic runner stopped");
    return true;
  }

  function syncRunningState() {
    if (shouldRun()) {
      start();
    } else {
      stop();
    }
  }

  function updateConfig(nextConfig = {}) {
    const next = { ...nextConfig };

    if (Array.isArray(next.trustedNames)) {
      next.trustedNames = next.trustedNames
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    if (Array.isArray(next.gameMasterNames)) {
      next.gameMasterNames = next.gameMasterNames
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    Object.assign(config, next);
    persistConfig();
    syncRunningState();
    bot.log("panic runner config updated", { ...config });
    return { ...config };
  }

  function status() {
    return {
      running: state.running,
      config: {
        ...config,
        trustedNames: [...config.trustedNames],
        gameMasterNames: [...config.gameMasterNames],
      },
      visibleCreatures: getVisibleCreatures().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      visiblePlayers: getVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      unknownVisiblePlayers: getUnknownVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      trustedVisiblePlayers: getTrustedVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visibleGameMasters: getVisibleGameMasters().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      latestDamageEvent: getLatestDamageEvent(),
      lastTriggerAt: state.lastTriggerAt,
    };
  }

  if (shouldRun()) {
    start();
  }

  bot.panic = {
    start,
    stop,
    status,
    updateConfig,
    getVisibleCreatures,
    getVisiblePlayers,
    getUnknownVisiblePlayers,
    getTrustedVisiblePlayers,
    getVisibleGameMasters,
    getTrustedNames,
    getGameMasterNames,
    config,
  };
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installRuneModule = function installRuneModule(bot) {
  const configStorageKey = "minibiaBot.rune.config";
  const state = {
    running: false,
    timerId: null,
    lastRuneAt: 0,
  };

  const config = Object.assign(
    {
      tickMs: 1000,
      minHpPercent: 50,
      minFoodSeconds: 30,
      runeSpellWords: "adori vita vis",
      runeManaCost: 600,
      runeCooldownMs: 3500,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function readStats() {
    const playerState = bot.getPlayerState();

    const hp = playerState
      ? { current: playerState.health ?? 0, max: playerState.maxHealth ?? 0 }
      : null;

    const mana = playerState
      ? { current: playerState.mana ?? 0, max: playerState.maxMana ?? 0 }
      : null;

    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    let food = null;
    if (foodText) {
      const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
      food = match
        ? {
            text: foodText,
            seconds: Number(match[1]) * 60 + Number(match[2]),
          }
        : { text: foodText, seconds: null };
    }

    return { hp, mana, food };
  }

  function canMakeRune() {
    const { hp, mana, food } = readStats();
    if (!hp || !mana) return false;

    const hpPercent = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    const enoughHp = hpPercent >= config.minHpPercent;
    const enoughMana = mana.current >= config.runeManaCost;
    const enoughFood = food?.seconds == null || food.seconds >= config.minFoodSeconds;
    const cooldownReady = Date.now() - state.lastRuneAt >= config.runeCooldownMs;

    return enoughHp && enoughMana && enoughFood && cooldownReady;
  }

  function tryMakeRune() {
    if (!canMakeRune()) {
      return false;
    }

    const sent = bot.sendChat(config.runeSpellWords);
    if (sent) {
      state.lastRuneAt = Date.now();
    }

    return sent;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    tryMakeRune();
    scheduleNextTick();
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();

    if (state.running) {
      bot.log("rune maker already running");
      return false;
    }

    state.running = true;
    bot.log("rune maker started", { ...config });
    tick();
    return true;
  }

  function stop() {
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    config.enabled = false;
    persistConfig();
    bot.log("rune maker stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      stats: readStats(),
      lastRuneAt: state.lastRuneAt,
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("rune config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.rune = {
    start,
    stop,
    status,
    readStats,
    canMakeRune,
    tryMakeRune,
    config,
    updateConfig,
  };

  bot.startRuneLoop = start;
  bot.stopRuneLoop = stop;
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoEatModule = function installAutoEatModule(bot) {
  const configStorageKey = "minibiaBot.eat.config";
  const state = {
    running: false,
    timerId: null,
    lastFoodAt: 0,
  };

  const config = Object.assign(
    {
      tickMs: 1000,
      eatCooldownMs: 60000,
      eatHotbarSlot: 10,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function readFoodTimer() {
    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    if (!foodText) return null;

    const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
    return match
      ? {
          text: foodText,
          seconds: Number(match[1]) * 60 + Number(match[2]),
        }
      : { text: foodText, seconds: null };
  }

  function isSated() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;

    if (conditions?.has && conditions.SATED != null) {
      return conditions.has(conditions.SATED);
    }

    const food = readFoodTimer();
    if (food?.seconds != null) {
      return food.seconds > 0;
    }

    return true;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDefinition(item) {
    if (!item) return null;

    return (
      window.gameClient?.itemDefinitionsBySid?.[item.sid] ||
      window.gameClient?.itemDefinitions?.[item.id] ||
      null
    );
  }

  function getItemName(item) {
    const definition = getItemDefinition(item);
    return definition?.properties?.name || item?.name || "";
  }

  function isFoodItem(item) {
    const name = getItemName(item).toLowerCase();
    return /(ham|meat|mushroom|fish|egg|pear|toast|shrimp|food)/i.test(name);
  }

  function getFoodSlots() {
    return getOpenContainers().flatMap((container) =>
      (container?.slots || [])
        .filter((slot) => slot?.item && slot?.element && isFoodItem(slot.item))
        .map((slot) => ({
          container,
          slot,
          item: slot.item,
          name: getItemName(slot.item),
          count: slot.item.count || 0,
        }))
    );
  }

  function openSlotContextMenu(slot) {
    if (!slot?.element) return false;

    const rect = slot.element.getBoundingClientRect();
    slot.element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: rect.left + 5,
        clientY: rect.top + 5,
      })
    );

    return true;
  }

  function clickContainerUse() {
    const menu = window.gameClient?.interface?.menuManager?.menus?.["container-menu"];
    const root = menu?.element;
    if (!root) return false;

    const useEntry = Array.from(root.querySelectorAll("*")).find((element) =>
      /^use$/i.test((element.textContent || "").trim())
    );

    if (!useEntry) {
      return false;
    }

    useEntry.click();
    return true;
  }

  function eatFromOpenContainers() {
    const foodSlots = getFoodSlots().sort((a, b) => a.count - b.count);
    const target = foodSlots[0];

    if (!target) {
      return false;
    }

    if (!openSlotContextMenu(target.slot)) {
      return false;
    }

    const used = clickContainerUse();
    if (used) {
      state.lastFoodAt = Date.now();
      bot.log("used food from open container", {
        name: target.name,
        count: target.count,
        sid: target.item.sid,
      });
    }

    return used;
  }

  function tryEat() {
    if (!config.enabled) {
      return false;
    }

    if (isSated()) {
      return false;
    }

    if (Date.now() - state.lastFoodAt < config.eatCooldownMs) {
      return false;
    }

    if (eatFromOpenContainers()) {
      return true;
    }

    const slotIndex = Math.max(0, Number(config.eatHotbarSlot) - 1);
    const clicked = bot.clickHotbar(slotIndex);

    if (clicked) {
      state.lastFoodAt = Date.now();
      bot.log("clicked food hotbar slot", config.eatHotbarSlot);
    }

    return clicked;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    tryEat();
    scheduleNextTick();
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();

    if (state.running) {
      bot.log("auto eat already running");
      return false;
    }

    state.running = true;
    bot.log("auto eat started", { eatCooldownMs: config.eatCooldownMs });
    tick();
    return true;
  }

  function stop() {
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    config.enabled = false;
    persistConfig();
    bot.log("auto eat stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      lastFoodAt: state.lastFoodAt,
      isSated: isSated(),
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("auto eat config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.eat = {
    start,
    stop,
    status,
    updateConfig,
    isSated,
    tryEat,
    getOpenContainers,
    getFoodSlots,
    eatFromOpenContainers,
    config,
  };

  bot.startAutoEat = start;
  bot.stopAutoEat = stop;

  if (bot.rune) {
    bot.rune.startAutoEat = start;
    bot.rune.stopAutoEat = stop;
    bot.rune.tryEat = tryEat;
    bot.rune.getOpenContainers = getOpenContainers;
    bot.rune.getFoodSlots = getFoodSlots;
    bot.rune.eatFromOpenContainers = eatFromOpenContainers;
    bot.rune.isSated = isSated;
  }
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPanel = function installPanel(bot) {
  const panelPositionKey = "minibiaBot.ui.panelPosition";
  const panelCollapsedKey = "minibiaBot.ui.panelCollapsed";

  function destroy() {
    document.getElementById("minibia-bot-panel")?.remove();
    document.getElementById("minibia-bot-style")?.remove();
  }

  function savePanelPosition(position) {
    bot.storage.set(panelPositionKey, position);
  }

  function getSavedPanelPosition() {
    return bot.storage.get(panelPositionKey, null);
  }

  function savePanelCollapsed(collapsed) {
    bot.storage.set(panelCollapsedKey, !!collapsed);
  }

  function getSavedPanelCollapsed() {
    return !!bot.storage.get(panelCollapsedKey, false);
  }

  function refreshHomeLabel() {
    const homeLabel = document.getElementById("minibia-bot-home");
    if (!homeLabel) return;

    const home = bot.pz?.getHomePz?.();
    homeLabel.textContent = home
      ? `Panic Runner Home: ${home.x}, ${home.y}, ${home.z}`
      : "Panic Runner Home: not set";
  }

  function refreshPanicStatus() {
    const unknownToggle = document.getElementById("minibia-bot-panic-unknown");
    const healthToggle = document.getElementById("minibia-bot-panic-health");
    const status = bot.panic?.status?.();

    if (unknownToggle) {
      unknownToggle.checked = !!status?.config?.unknownPlayerEnabled;
    }

    if (healthToggle) {
      healthToggle.checked = !!status?.config?.healthLossEnabled;
    }
  }

  function renderTrustedNames() {
    const list = document.getElementById("minibia-bot-panic-trusted-list");
    if (!list) return;

    const trustedNames = bot.panic?.config?.trustedNames || [];
    list.innerHTML = "";

    if (!trustedNames.length) {
      const empty = document.createElement("div");
      empty.className = "mb-small-note";
      empty.textContent = "No trusted names saved.";
      list.appendChild(empty);
      return;
    }

    trustedNames.forEach((name, index) => {
      const row = document.createElement("div");
      row.className = "mb-list-row";

      const label = document.createElement("span");
      label.textContent = name;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mb-small-button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        const nextNames = trustedNames.filter((_, currentIndex) => currentIndex !== index);
        bot.panic.updateConfig({ trustedNames: nextNames });
        renderTrustedNames();
      });

      row.appendChild(label);
      row.appendChild(removeButton);
      list.appendChild(row);
    });
  }

  function renderGameMasterNames() {
    const list = document.getElementById("minibia-bot-panic-gm-list");
    if (!list) return;

    const gameMasterNames = bot.panic?.config?.gameMasterNames || [];
    list.innerHTML = "";

    if (!gameMasterNames.length) {
      const empty = document.createElement("div");
      empty.className = "mb-small-note";
      empty.textContent = "No game master names saved.";
      list.appendChild(empty);
      return;
    }

    gameMasterNames.forEach((name, index) => {
      const row = document.createElement("div");
      row.className = "mb-list-row";

      const label = document.createElement("span");
      label.textContent = name;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mb-small-button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        const nextNames = gameMasterNames.filter((_, currentIndex) => currentIndex !== index);
        bot.panic.updateConfig({ gameMasterNames: nextNames });
        renderGameMasterNames();
      });

      row.appendChild(label);
      row.appendChild(removeButton);
      list.appendChild(row);
    });
  }

  function refreshRuneStatus() {
    const runeToggle = document.getElementById("minibia-bot-rune-enabled");
    const running = !!bot.rune?.status?.().running;

    if (runeToggle) {
      runeToggle.checked = running;
    }
  }

  function refreshAutoEatStatus() {
    const autoEatToggle = document.getElementById("minibia-bot-auto-eat-enabled");
    if (!autoEatToggle) return;

    autoEatToggle.checked = !!bot.eat?.status?.().running;
  }

  function refreshVisibleCreatures() {
    const list = document.getElementById("minibia-bot-visible-creatures-list");
    if (!list) return;

    const me = bot.getPlayerPosition?.();
    const creatures = bot.panic?.status?.().visibleCreatures || [];
    list.innerHTML = "";

    if (!me) {
      const empty = document.createElement("div");
      empty.className = "mb-small-note";
      empty.textContent = "Current position unavailable.";
      list.appendChild(empty);
      return;
    }

    const getFloorOffset = (creature) => (creature.position?.z || 0) - me.z;
    const getFloorDistance = (creature) => Math.abs(getFloorOffset(creature));

    const visibleCreatures = [...creatures].sort((a, b) => {
      const floorDistanceDiff = getFloorDistance(a) - getFloorDistance(b);
      if (floorDistanceDiff !== 0) return floorDistanceDiff;

      const floorOffsetDiff = getFloorOffset(a) - getFloorOffset(b);
      if (floorOffsetDiff !== 0) return floorOffsetDiff;

      const aDist = Math.abs((a.position?.x || 0) - me.x) + Math.abs((a.position?.y || 0) - me.y);
      const bDist = Math.abs((b.position?.x || 0) - me.x) + Math.abs((b.position?.y || 0) - me.y);
      return aDist - bDist;
    });

    if (!visibleCreatures.length) {
      const empty = document.createElement("div");
      empty.className = "mb-small-note";
      empty.textContent = "No visible creatures.";
      list.appendChild(empty);
      return;
    }

    let currentFloor = null;

    visibleCreatures.forEach((creature) => {
      const floor = creature.position?.z;
      if (floor !== currentFloor) {
        currentFloor = floor;
        const floorOffset = me.z - floor;
        const floorOffsetLabel =
          floorOffset === 0 ? "0" : floorOffset > 0 ? `+${floorOffset}` : `${floorOffset}`;

        const floorLabel = document.createElement("div");
        floorLabel.className = "mb-floor-label";
        floorLabel.textContent =
          floorOffset === 0 ? `Floor ${floor} (0, current)` : `Floor ${floor} (${floorOffsetLabel})`;
        list.appendChild(floorLabel);
      }

      const row = document.createElement("div");
      row.className = "mb-creature-row";

      const name = document.createElement("div");
      name.className = "mb-creature-name";
      name.textContent = creature.name || (creature.type === 0 ? "Player" : "Mob");

      const meta = document.createElement("div");
      meta.className = "mb-small-note";
      meta.textContent = `${creature.type === 0 ? "Player" : "Mob"} at ${creature.position.x}, ${creature.position.y}, ${creature.position.z}`;

      row.appendChild(name);
      row.appendChild(meta);
      list.appendChild(row);
    });
  }

  function setPanelCollapsed(panel, collapsed) {
    if (!panel) return;

    const body = panel.querySelector(".mb-body");
    const toggle = panel.querySelector("#minibia-bot-collapse");
    const nextCollapsed = !!collapsed;

    panel.dataset.collapsed = nextCollapsed ? "true" : "false";

    if (body) {
      body.hidden = nextCollapsed;
    }

    if (toggle) {
      toggle.textContent = nextCollapsed ? "+" : "−";
      toggle.setAttribute("aria-label", nextCollapsed ? "Maximize panel" : "Minimize panel");
      toggle.setAttribute("title", nextCollapsed ? "Maximize" : "Minimize");
    }

    savePanelCollapsed(nextCollapsed);
  }

  function applySavedPanelPosition(panel) {
    const position = getSavedPanelPosition();
    if (!position) return;

    if (typeof position.top === "number") {
      panel.style.top = `${position.top}px`;
    }

    if (typeof position.left === "number") {
      panel.style.left = `${position.left}px`;
      panel.style.right = "auto";
    }
  }

  function clampPanelPosition(panel, left, top) {
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);

    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  }

  function enableDrag(panel) {
    const handle = panel.querySelector(".mb-title");
    if (!handle) return;

    let dragState = null;

    const onMouseMove = (event) => {
      if (!dragState) return;

      const next = clampPanelPosition(
        panel,
        event.clientX - dragState.offsetX,
        event.clientY - dragState.offsetY
      );

      panel.style.left = `${next.left}px`;
      panel.style.top = `${next.top}px`;
      panel.style.right = "auto";
    };

    const onMouseUp = () => {
      if (!dragState) return;

      dragState = null;
      const rect = panel.getBoundingClientRect();
      savePanelPosition({ left: rect.left, top: rect.top });
    };

    handle.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;

      const rect = panel.getBoundingClientRect();
      dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };

      event.preventDefault();
    });

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    bot.addCleanup(() => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    });
  }

  function inject() {
    destroy();

    const style = document.createElement("style");
    style.id = "minibia-bot-style";
    style.textContent = `
      #minibia-bot-panel {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 999999;
        width: 640px;
        max-width: calc(100vw - 32px);
        padding: 12px;
        border: 1px solid rgba(224, 200, 148, 0.45);
        border-radius: 10px;
        background: linear-gradient(180deg, rgba(30, 23, 15, 0.95), rgba(15, 11, 8, 0.97));
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        color: #f1e2b8;
        font: 12px/1.35 Verdana, sans-serif;
        user-select: none;
      }

      #minibia-bot-panel .mb-title {
        margin: 0;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: move;
      }

      #minibia-bot-panel .mb-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin: 0 0 8px;
      }

      #minibia-bot-panel .mb-icon-button {
        width: 24px;
        min-width: 24px;
        padding: 2px 0;
        border-radius: 6px;
        font-weight: 700;
        line-height: 1;
      }

      #minibia-bot-panel[data-collapsed="true"] .mb-titlebar {
        margin-bottom: 0;
      }

      #minibia-bot-panel .mb-body {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr);
        gap: 12px;
        align-items: start;
      }

      #minibia-bot-panel .mb-side-column,
      #minibia-bot-panel .mb-main-column {
        display: grid;
        gap: 10px;
      }

      #minibia-bot-panel .mb-section {
        padding-top: 10px;
        border-top: 1px solid rgba(224, 200, 148, 0.16);
      }

      #minibia-bot-panel .mb-column-section:first-child {
        padding-top: 0;
        border-top: 0;
      }

      #minibia-bot-panel .mb-label {
        margin: 0 0 8px;
        color: #d3c49d;
        word-break: break-word;
      }

      #minibia-bot-panel .mb-actions {
        display: grid;
        gap: 6px;
      }

      #minibia-bot-panel button {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid rgba(224, 200, 148, 0.35);
        border-radius: 8px;
        background: linear-gradient(180deg, #635133, #3f321f);
        color: #f7eccf;
        font: inherit;
        cursor: pointer;
      }

      #minibia-bot-panel button:hover {
        background: linear-gradient(180deg, #755f3d, #4f4028);
      }

      #minibia-bot-panel input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid rgba(224, 200, 148, 0.35);
        border-radius: 8px;
        background: rgba(16, 12, 8, 0.88);
        color: #f7eccf;
        font: inherit;
      }

      #minibia-bot-panel .mb-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #d3c49d;
      }

      #minibia-bot-panel .mb-toggle input[type="checkbox"] {
        width: auto;
        margin: 0;
      }

      #minibia-bot-panel .mb-row {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 8px;
      }

      #minibia-bot-panel .mb-row .mb-toggle {
        white-space: nowrap;
      }

      #minibia-bot-panel .mb-row input[type="text"] {
        min-width: 0;
      }

      #minibia-bot-panel .mb-row-three {
        display: grid;
        grid-template-columns: auto minmax(120px, 1fr) 72px;
        align-items: center;
        gap: 8px;
      }

      #minibia-bot-panel .mb-row-three input[type="text"],
      #minibia-bot-panel .mb-row-three input[type="number"] {
        min-width: 0;
      }

      #minibia-bot-panel .mb-stack {
        display: grid;
        gap: 8px;
      }

      #minibia-bot-panel .mb-inline {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 6px;
        align-items: center;
      }

      #minibia-bot-panel .mb-list {
        display: grid;
        gap: 6px;
      }

      #minibia-bot-panel .mb-list-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 6px;
        align-items: center;
        color: #d3c49d;
      }

      #minibia-bot-panel .mb-creature-row {
        padding: 6px 8px;
        border: 1px solid rgba(224, 200, 148, 0.14);
        border-radius: 8px;
        background: rgba(255, 244, 212, 0.04);
      }

      #minibia-bot-panel .mb-creature-name {
        color: #f7eccf;
        word-break: break-word;
      }

      #minibia-bot-panel .mb-floor-label {
        margin-top: 4px;
        color: #e2cf9c;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      #minibia-bot-panel .mb-side-column .mb-list {
        max-height: 340px;
        overflow-y: auto;
        padding-right: 2px;
      }

      #minibia-bot-panel .mb-small-button {
        width: auto;
        padding: 4px 8px;
        border-radius: 6px;
      }

      #minibia-bot-panel .mb-small-note {
        color: #b7a67d;
        font-size: 11px;
      }

      #minibia-bot-panel .mb-note {
        margin-top: 8px;
        color: #b7a67d;
        font-size: 11px;
      }

      @media (max-width: 760px) {
        #minibia-bot-panel {
          width: min(420px, calc(100vw - 32px));
        }

        #minibia-bot-panel .mb-body {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement("div");
    panel.id = "minibia-bot-panel";
    panel.innerHTML = `
        <div class="mb-titlebar">
        <div class="mb-title">Minibia Bot</div>
        <button type="button" class="mb-icon-button" id="minibia-bot-collapse" aria-label="Minimize panel" title="Minimize">−</button>
      </div>
      <div class="mb-body">
        <div class="mb-side-column">
          <div class="mb-section mb-column-section">
            <div class="mb-label">Visible Creatures</div>
            <div class="mb-list" id="minibia-bot-visible-creatures-list"></div>
          </div>
        </div>
        <div class="mb-main-column">
          <div class="mb-actions mb-column-section">
            <button type="button" id="minibia-bot-reload">Reload Bot</button>
          </div>
          <div class="mb-section mb-column-section">
            <div class="mb-label" id="minibia-bot-home">Panic Runner Home: not set</div>
            <div class="mb-stack">
              <button type="button" id="minibia-bot-set-home">Set Home</button>
              <label class="mb-toggle">
                <input type="checkbox" id="minibia-bot-panic-unknown" />
                <span>Unknown Player</span>
              </label>
              <label class="mb-toggle">
                <input type="checkbox" id="minibia-bot-panic-health" />
                <span>Lose Health</span>
              </label>
              <div class="mb-inline">
                <input type="text" id="minibia-bot-panic-trusted-input" placeholder="Trusted name" />
                <button type="button" class="mb-small-button" id="minibia-bot-panic-trusted-add">Add</button>
              </div>
              <div class="mb-list" id="minibia-bot-panic-trusted-list"></div>
            </div>
          </div>
          <div class="mb-section mb-column-section">
            <div class="mb-label">GM Kill Switch</div>
            <div class="mb-stack">
              <div class="mb-inline">
                <input type="text" id="minibia-bot-panic-gm-input" placeholder="Game master name" />
                <button type="button" class="mb-small-button" id="minibia-bot-panic-gm-add">Add</button>
              </div>
              <div class="mb-list" id="minibia-bot-panic-gm-list"></div>
            </div>
          </div>
          <div class="mb-section mb-column-section">
            <div class="mb-actions">
              <div class="mb-row-three">
                <label class="mb-toggle">
                  <input type="checkbox" id="minibia-bot-rune-enabled" />
                  <span>Magic Level Trainer</span>
                </label>
                <input type="text" id="minibia-bot-rune-spell" placeholder="Spell words" />
                <input type="number" id="minibia-bot-rune-mana" min="0" placeholder="Mana" />
              </div>
              <div class="mb-row">
                <label class="mb-toggle">
                  <input type="checkbox" id="minibia-bot-auto-eat-enabled" />
                  <span>Auto Eat</span>
                </label>
                <div></div>
              </div>
            </div>
          </div>
          <div class="mb-note">Loaded routines: Panic Runner, magic level trainer, and auto eat.</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const unlockAudio = () => {
      bot.unlockAudio?.();
    };

    panel.addEventListener("pointerdown", unlockAudio, { passive: true });
    panel.addEventListener("keydown", unlockAudio);

    bot.addCleanup(() => {
      panel.removeEventListener("pointerdown", unlockAudio);
      panel.removeEventListener("keydown", unlockAudio);
    });

    applySavedPanelPosition(panel);
    enableDrag(panel);
    setPanelCollapsed(panel, getSavedPanelCollapsed());

    const spellInput = panel.querySelector("#minibia-bot-rune-spell");
    const manaInput = panel.querySelector("#minibia-bot-rune-mana");
    const runeEnabledInput = panel.querySelector("#minibia-bot-rune-enabled");
    const autoEatEnabledInput = panel.querySelector("#minibia-bot-auto-eat-enabled");
    const panicGmNameInput = panel.querySelector("#minibia-bot-panic-gm-input");
    const panicGmAddButton = panel.querySelector("#minibia-bot-panic-gm-add");
    const panicUnknownInput = panel.querySelector("#minibia-bot-panic-unknown");
    const panicHealthInput = panel.querySelector("#minibia-bot-panic-health");
    const panicTrustedInput = panel.querySelector("#minibia-bot-panic-trusted-input");
    const panicTrustedAddButton = panel.querySelector("#minibia-bot-panic-trusted-add");
    const collapseButton = panel.querySelector("#minibia-bot-collapse");
    const reloadButton = panel.querySelector("#minibia-bot-reload");

    if (collapseButton) {
      collapseButton.addEventListener("click", () => {
        const isCollapsed = panel.dataset.collapsed === "true";
        setPanelCollapsed(panel, !isCollapsed);
      });
    }

    if (reloadButton) {
      reloadButton.addEventListener("click", () => {
        window.minibiaBotReload?.();
      });
    }

    function addTrustedName() {
      const rawName = panicTrustedInput?.value?.trim() || "";
      if (!rawName) {
        return;
      }

      const currentNames = bot.panic?.config?.trustedNames || [];
      const exists = currentNames.some(
        (name) => String(name).trim().toLowerCase() === rawName.toLowerCase()
      );

      if (!exists) {
        bot.panic.updateConfig({ trustedNames: [...currentNames, rawName] });
      }

      if (panicTrustedInput) {
        panicTrustedInput.value = "";
      }

      renderTrustedNames();
    }

    function addGameMasterName() {
      const rawName = panicGmNameInput?.value?.trim() || "";
      if (!rawName) {
        return;
      }

      const currentNames = bot.panic?.config?.gameMasterNames || [];
      const exists = currentNames.some(
        (name) => String(name).trim().toLowerCase() === rawName.toLowerCase()
      );

      if (!exists) {
        bot.panic.updateConfig({ gameMasterNames: [...currentNames, rawName] });
      }

      if (panicGmNameInput) {
        panicGmNameInput.value = "";
      }

      renderGameMasterNames();
    }

    if (panicGmAddButton) {
      panicGmAddButton.addEventListener("click", addGameMasterName);
    }

    if (panicGmNameInput) {
      panicGmNameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addGameMasterName();
        }
      });
    }

    if (panicTrustedAddButton) {
      panicTrustedAddButton.addEventListener("click", addTrustedName);
    }

    if (panicTrustedInput) {
      panicTrustedInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addTrustedName();
        }
      });
    }

    if (spellInput) {
      spellInput.value = bot.rune?.config?.runeSpellWords || "";
      spellInput.addEventListener("change", () => {
        bot.rune.updateConfig({ runeSpellWords: spellInput.value.trim() });
      });
    }

    if (manaInput) {
      manaInput.value = String(bot.rune?.config?.runeManaCost ?? 0);
      manaInput.addEventListener("change", () => {
        const runeManaCost = Math.max(0, Number(manaInput.value) || 0);
        manaInput.value = String(runeManaCost);
        bot.rune.updateConfig({ runeManaCost });
      });
    }

    if (runeEnabledInput) {
      runeEnabledInput.checked = !!bot.rune?.status?.().running;
      runeEnabledInput.addEventListener("change", () => {
        const runeSpellWords = spellInput?.value?.trim() || bot.rune.config.runeSpellWords;
        const runeManaCost = Math.max(0, Number(manaInput?.value) || bot.rune.config.runeManaCost || 0);

        if (runeEnabledInput.checked) {
          bot.rune.start({ runeSpellWords, runeManaCost });
        } else {
          bot.rune.stop();
        }

        refreshRuneStatus();
      });
    }

    if (autoEatEnabledInput) {
      autoEatEnabledInput.checked = !!bot.eat?.status?.().running;
      autoEatEnabledInput.addEventListener("change", () => {
        if (autoEatEnabledInput.checked) {
          bot.eat.start();
        } else {
          bot.eat.stop();
        }

        refreshAutoEatStatus();
      });
    }

    if (panicUnknownInput) {
      panicUnknownInput.checked = !!bot.panic?.status?.().config?.unknownPlayerEnabled;
      panicUnknownInput.addEventListener("change", () => {
        bot.panic.updateConfig({ unknownPlayerEnabled: panicUnknownInput.checked });
        refreshPanicStatus();
      });
    }

    if (panicHealthInput) {
      panicHealthInput.checked = !!bot.panic?.status?.().config?.healthLossEnabled;
      panicHealthInput.addEventListener("change", () => {
        bot.panic.updateConfig({ healthLossEnabled: panicHealthInput.checked });
        refreshPanicStatus();
      });
    }

    panel.querySelector("#minibia-bot-set-home")?.addEventListener("click", () => {
      bot.pz.setHomePzCurrentSpot();
      refreshHomeLabel();
    });

    refreshHomeLabel();
    refreshPanicStatus();
    renderGameMasterNames();
    renderTrustedNames();
    refreshRuneStatus();
    refreshAutoEatStatus();
    refreshVisibleCreatures();

    const visibleCreaturesTimerId = window.setInterval(refreshVisibleCreatures, 1000);
    bot.addCleanup(() => {
      window.clearInterval(visibleCreaturesTimerId);
    });
  }

  bot.ui = {
    inject,
    destroy,
    refreshHomeLabel,
    refreshPanicStatus,
    refreshRuneStatus,
    refreshAutoEatStatus,
    refreshVisibleCreatures,
    getSavedPanelPosition,
    getSavedPanelCollapsed,
    setPanelCollapsed: (collapsed) => {
      const panel = document.getElementById("minibia-bot-panel");
      setPanelCollapsed(panel, collapsed);
    },
  };
};
(() => {
  const bundle = window.__minibiaBotBundle || window.__minibiaBotReloadBundle || {};

  function boot(currentBundle = bundle) {
    if (window.minibiaBot?.destroy) {
      window.minibiaBot.destroy();
    }

    const bot = currentBundle.createBot();

    currentBundle.installPzModule(bot);
    currentBundle.installPanicModule(bot);
    currentBundle.installRuneModule(bot);
    currentBundle.installAutoEatModule(bot);
    currentBundle.installPanel(bot);

    bot.ui.inject();

    bot.start = (...args) => bot.rune.start(...args);
    bot.stop = (...args) => bot.rune.stop(...args);
    bot.reload = () => window.minibiaBotReload?.();
    bot.status = () => ({
      version: bot.version,
      pz: {
        home: bot.pz.getHomePz(),
      },
      panic: bot.panic.status(),
      rune: bot.rune.status(),
      eat: bot.eat.status(),
    });

    window.minibiaBot = bot;
    window.pzBot = bot.pz;

    console.log("[minibia-bot] ready", {
      version: bot.version,
      modules: ["pz", "panic", "rune", "eat", "ui"],
    });
    console.log("minibiaBot.reload()");
    console.log("minibiaBot.panic.status()");
    console.log("minibiaBot.pz.goToNearestPz()");
    console.log("minibiaBot.pz.setHomePzCurrentSpot()");
    console.log("minibiaBot.pz.goToHomePz()");
    console.log("minibiaBot.rune.start()");
    console.log("minibiaBot.rune.stop()");
    console.log("minibiaBot.eat.start()");
    console.log("minibiaBot.eat.stop()");

    return bot;
  }

  window.__minibiaBotReloadBundle = bundle;
  window.minibiaBotReload = () => boot(window.__minibiaBotReloadBundle || bundle);
  delete window.__minibiaBotBundle;
  boot(bundle);
})();
