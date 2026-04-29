window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPanel = function installPanel(bot) {
  const panelPositionKey = "minibiaBot.ui.panelPosition";

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

  function refreshHomeLabel() {
    const homeLabel = document.getElementById("minibia-bot-home");
    if (!homeLabel) return;

    const home = bot.pz?.getHomePz?.();
    homeLabel.textContent = home
      ? `Home PZ: ${home.x}, ${home.y}, ${home.z}`
      : "Home PZ: not set";
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

    autoEatToggle.checked = !!bot.rune?.status?.().autoEatRunning;
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
        width: 240px;
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
        margin: 0 0 8px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: move;
      }

      #minibia-bot-panel .mb-section {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid rgba(224, 200, 148, 0.16);
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

      #minibia-bot-panel .mb-note {
        margin-top: 8px;
        color: #b7a67d;
        font-size: 11px;
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement("div");
    panel.id = "minibia-bot-panel";
    panel.innerHTML = `
      <div class="mb-title">Minibia Bot</div>
      <div class="mb-section">
        <div class="mb-label" id="minibia-bot-home">Home PZ: not set</div>
        <div class="mb-actions">
          <button type="button" id="minibia-bot-set-home">Set Home PZ Here</button>
          <button type="button" id="minibia-bot-go-home">Go Home PZ</button>
          <button type="button" id="minibia-bot-go-nearest">Go Nearest PZ</button>
          <button type="button" id="minibia-bot-clear-home">Clear Home PZ</button>
        </div>
      </div>
      <div class="mb-section">
        <div class="mb-actions">
          <div class="mb-row">
            <label class="mb-toggle">
              <input type="checkbox" id="minibia-bot-rune-enabled" />
              <span>Rune Maker</span>
            </label>
            <input type="text" id="minibia-bot-rune-spell" placeholder="Spell words" />
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
      <div class="mb-note">Loaded routines: PZ navigation, rune maker, and auto eat.</div>
    `;
    document.body.appendChild(panel);

    applySavedPanelPosition(panel);
    enableDrag(panel);

    const spellInput = panel.querySelector("#minibia-bot-rune-spell");
    const runeEnabledInput = panel.querySelector("#minibia-bot-rune-enabled");
    const autoEatEnabledInput = panel.querySelector("#minibia-bot-auto-eat-enabled");

    if (spellInput) {
      spellInput.value = bot.rune?.config?.runeSpellWords || "";
      spellInput.addEventListener("change", () => {
        bot.rune.updateConfig({ runeSpellWords: spellInput.value.trim() });
      });
    }

    if (runeEnabledInput) {
      runeEnabledInput.checked = !!bot.rune?.status?.().running;
      runeEnabledInput.addEventListener("change", () => {
        const runeSpellWords = spellInput?.value?.trim() || bot.rune.config.runeSpellWords;

        if (runeEnabledInput.checked) {
          bot.rune.start({ runeSpellWords });
        } else {
          bot.rune.stop();
        }

        refreshRuneStatus();
      });
    }

    if (autoEatEnabledInput) {
      autoEatEnabledInput.checked = !!bot.rune?.status?.().autoEatRunning;
      autoEatEnabledInput.addEventListener("change", () => {
        if (autoEatEnabledInput.checked) {
          bot.rune.startAutoEat();
        } else {
          bot.rune.stopAutoEat();
        }

        refreshAutoEatStatus();
      });
    }

    panel.querySelector("#minibia-bot-set-home")?.addEventListener("click", () => {
      bot.pz.setHomePzCurrentSpot();
      refreshHomeLabel();
    });

    panel.querySelector("#minibia-bot-go-home")?.addEventListener("click", () => {
      bot.pz.goToHomePz();
    });

    panel.querySelector("#minibia-bot-go-nearest")?.addEventListener("click", () => {
      bot.pz.goToNearestPz();
    });

    panel.querySelector("#minibia-bot-clear-home")?.addEventListener("click", () => {
      bot.pz.clearHomePz();
      refreshHomeLabel();
    });

    refreshHomeLabel();
    refreshRuneStatus();
    refreshAutoEatStatus();
  }

  bot.ui = {
    inject,
    destroy,
    refreshHomeLabel,
    refreshRuneStatus,
    refreshAutoEatStatus,
    getSavedPanelPosition,
  };
};
