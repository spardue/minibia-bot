window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installTalkModule = function installTalkModule(bot) {
  const configStorageKey = "minibiaBot.talk.config";
  const defaultSystemPrompt =
    "You are a real player on a Tibia OT server called Minibia chatting in-game. Reply like a normal Tibia OT player with short, slightly broken grammar and casual wording. Always keep replies to one short sentence under 180 characters, plain text only, and no emojis. Never say or imply that you are an AI, assistant, language model, automation, script, or bot under any circumstances. If someone asks whether you are a bot, deny it briefly and stay in character as a player.";
  const minPollMs = 20000;
  const state = {
    running: false,
    timerId: null,
    pending: false,
    lastApiRequestAt: 0,
    lastReplyAt: 0,
    seenMessageKeys: [],
  };

  const config = Object.assign(
    {
      enabled: false,
      provider: "gemini",
      apiKey: "",
      model: "gemini-2.5-flash",
      pollMs: minPollMs,
      replyCooldownMs: 15000,
      systemPrompt: defaultSystemPrompt,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getTrustedNames() {
    return new Set(
      (bot.panic?.config?.trustedNames || [])
        .map((name) => normalizeName(name))
        .filter(Boolean)
    );
  }

  function sanitizeConfig() {
    config.provider = "gemini";
    config.apiKey = String(config.apiKey || "").trim();
    config.model = String(config.model || "gemini-2.5-flash").trim() || "gemini-2.5-flash";
    config.pollMs = Math.max(minPollMs, Number(config.pollMs) || minPollMs);
    config.replyCooldownMs = Math.max(0, Number(config.replyCooldownMs) || 15000);
    config.systemPrompt = String(config.systemPrompt || "").trim() || defaultSystemPrompt;
  }

  function trimSeenKeys() {
    const maxSeenKeys = 200;
    if (state.seenMessageKeys.length > maxSeenKeys) {
      state.seenMessageKeys = state.seenMessageKeys.slice(-maxSeenKeys);
    }
  }

  function rememberSeenKey(key) {
    if (!key || state.seenMessageKeys.includes(key)) {
      return;
    }

    state.seenMessageKeys.push(key);
    trimSeenKeys();
  }

  function hasSeenKey(key) {
    return !!key && state.seenMessageKeys.includes(key);
  }

  function extractSenderFromMessage(message) {
    const text = String(message || "").trim();
    if (!text) {
      return { sender: null, body: "" };
    }

    const patterns = [
      /^\[[^\]]+\]\s*([^:\n]{2,40}):\s+(.+)$/i,
      /^([^:\n]{2,40}):\s+(.+)$/i,
      /^([^:\n]{2,40})\s+says:\s+(.+)$/i,
      /^From\s+([^:\n]{2,40}):\s+(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          sender: String(match[1] || "").trim() || null,
          body: String(match[2] || "").trim(),
        };
      }
    }

    return { sender: null, body: text };
  }

  function getRawChatEntries() {
    return (window.gameClient?.interface?.channelManager?.channels || []).flatMap((channel) =>
      (channel?.__contents || []).map((entry, index) => ({
        channelName: channel?.name || null,
        entry,
        index,
      }))
    );
  }

  function toChatMessage(rawEntry) {
    const entry = rawEntry?.entry || {};
    const rawMessage = String(entry?.message || entry?.text || "").trim();
    const parsed = extractSenderFromMessage(rawMessage);
    const sender =
      String(entry?.author || entry?.sender || entry?.name || parsed.sender || "").trim() || null;
    const body = String(entry?.text || parsed.body || rawMessage).trim();
    const time = entry?.__time || entry?.time || null;
    const key = [
      rawEntry?.channelName || "",
      time || "",
      sender || "",
      rawMessage || "",
      rawEntry?.index || 0,
    ].join("|");

    return {
      key,
      channelName: rawEntry?.channelName || null,
      sender,
      body,
      rawMessage,
      time,
    };
  }

  function getChatMessages() {
    return getRawChatEntries().map(toChatMessage).filter((entry) => entry.body);
  }

  function isSelfMessage(message) {
    const selfNames = new Set(["you", normalizeName(bot.getPlayerName?.())].filter(Boolean));
    return selfNames.has(normalizeName(message?.sender));
  }

  function isTrustedMessage(message) {
    const senderName = normalizeName(message?.sender);
    if (!senderName) {
      return false;
    }

    return getTrustedNames().has(senderName);
  }

  function isBotRecentMessage(message) {
    const candidates = [message?.body, message?.rawMessage];
    return candidates.some((text) => bot.isRecentSentChat?.(text, 45000));
  }

  function looksLikeSpellCast(text) {
    const normalizedText = normalizeName(text);
    if (!normalizedText) {
      return false;
    }

    if (/^[a-z]{2,10}(?:\s+[a-z]{2,10}){0,4}[!.,]?$/i.test(normalizedText)) {
      const spellWords = [
        "exura",
        "exori",
        "exevo",
        "adori",
        "utani",
        "utura",
        "utana",
        "exana",
        "exeta",
        "utevo",
        "adevo",
        "adura"
      ];

      if (spellWords.some((word) => normalizedText.includes(word))) {
        return true;
      }
    }

    return false;
  }

  function looksLikeFoodMessage(text) {
    const normalizedText = normalizeName(text);
    if (!normalizedText) {
      return false;
    }

    if (/^(?:munch|chomp|gulp|nom|slurp)[!.,]?$/.test(normalizedText)) {
      return true;
    }

    return (
      /\b(ate|eating|eat|drinking|drink|used|use|chomp|munch)\b/.test(normalizedText) &&
      /\b(food|ham|meat|fish|mushroom|egg|pear|shrimp|mana fluid|health potion|potion)\b/.test(normalizedText)
    );
  }

  function shouldReplyToMessage(message) {
    if (!message?.body || !message?.key) {
      return false;
    }

    if (hasSeenKey(message.key)) {
      return false;
    }

    if (isSelfMessage(message)) {
      rememberSeenKey(message.key);
      return false;
    }

    if (isBotRecentMessage(message)) {
      rememberSeenKey(message.key);
      return false;
    }

    if (isTrustedMessage(message)) {
      rememberSeenKey(message.key);
      return false;
    }

    if (!message.sender) {
      rememberSeenKey(message.key);
      return false;
    }

    if (looksLikeSpellCast(message.body) || looksLikeFoodMessage(message.body)) {
      rememberSeenKey(message.key);
      return false;
    }

    return true;
  }

  function getRecentContextMessages(targetMessage) {
    return getChatMessages()
      .filter((message) => message.channelName === targetMessage.channelName)
      .slice(-8);
  }

  function buildPrompt(targetMessage, contextMessages) {
    const transcript = contextMessages
      .map((message) => `${message.sender || "system"}: ${message.body}`)
      .join("\n");

    return [
      config.systemPrompt,
      "",
      "Reply to the newest message in this in-game chat.",
      "Rules:",
      "- Sound human and casual.",
      "- Stay in character as a Tibia OT player.",
      "- Use slightly broken grammar like a normal fast in-game player.",
      "- Reply with exactly one short sentence.",
      "- Keep it under 180 characters.",
      "- Plain text only.",
      "- Never say or imply that you are an AI, assistant, bot, prompt, policy, script, or automation.",
      "",
      `Channel: ${targetMessage.channelName || "default"}`,
      "Recent chat:",
      transcript,
      "",
      `Newest message from ${targetMessage.sender}: ${targetMessage.body}`,
      "Reply text only:",
    ].join("\n");
  }

  async function generateGeminiReply(prompt) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 80,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return (
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => String(part?.text || ""))
        .join(" ")
        .trim() || ""
    );
  }

  function sanitizeReply(text) {
    const singleLine = String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();

    if (!singleLine) {
      return "";
    }

    return singleLine.slice(0, 180).trim();
  }

  async function maybeRespond() {
    if (!state.running || state.pending || !config.enabled || !config.apiKey) {
      return false;
    }

    if (Date.now() - state.lastReplyAt < config.replyCooldownMs) {
      return false;
    }

    if (Date.now() - state.lastApiRequestAt < minPollMs) {
      return false;
    }

    const candidate = getChatMessages().slice().reverse().find(shouldReplyToMessage);
    if (!candidate) {
      return false;
    }

    state.pending = true;

    try {
      state.lastApiRequestAt = Date.now();
      const contextMessages = getRecentContextMessages(candidate);
      const prompt = buildPrompt(candidate, contextMessages);
      const reply = sanitizeReply(await generateGeminiReply(prompt));

      rememberSeenKey(candidate.key);

      if (!reply) {
        bot.log("talk module skipped empty reply", candidate);
        return false;
      }

      const sent = bot.sendChat(reply);
      if (sent) {
        state.lastReplyAt = Date.now();
        bot.log("talk module replied", {
          channelName: candidate.channelName,
          sender: candidate.sender,
          message: candidate.body,
          reply,
        });
      }

      return sent;
    } finally {
      state.pending = false;
    }
  }

  function scheduleNextTick() {
    if (!state.running) {
      return;
    }

    state.timerId = window.setTimeout(async () => {
      try {
        await tick();
      } catch (error) {
        console.error("[minibia-bot] talk tick failed", error);
      }
    }, config.pollMs);
  }

  async function tick() {
    if (!state.running) {
      return;
    }

    try {
      await maybeRespond();
    } catch (error) {
      bot.log("talk module request failed", error?.message || error);
    }

    scheduleNextTick();
  }

  function seedSeenMessages() {
    getChatMessages().forEach((message) => rememberSeenKey(message.key));
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    sanitizeConfig();
    persistConfig();

    if (!config.apiKey) {
      bot.log("talk module requires a Gemini API key");
      return false;
    }

    if (state.running) {
      bot.log("talk module already running");
      return false;
    }

    state.running = true;
    seedSeenMessages();
    bot.log("talk module started", {
      model: config.model,
      playerName: bot.getPlayerName?.(),
    });
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
    bot.log("talk module stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      pending: state.pending,
      lastReplyAt: state.lastReplyAt,
      config: {
        ...config,
        apiKey: config.apiKey ? "***configured***" : "",
      },
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    sanitizeConfig();
    persistConfig();
    bot.log("talk config updated", {
      ...config,
      apiKey: config.apiKey ? "***configured***" : "",
    });
    return status().config;
  }

  sanitizeConfig();

  if (config.enabled && config.apiKey) {
    start();
  }

  bot.talk = {
    start,
    stop,
    status,
    updateConfig,
    getChatMessages,
    config,
  };
};
