const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // State sync from main
  onStateChange: (callback) => ipcRenderer.on("state-change", (_, state, svg) => callback(state, svg)),
  onEyeMove: (callback) => ipcRenderer.on("eye-move", (_, dx, dy) => callback(dx, dy)),
  onWakeFromDoze: (callback) => ipcRenderer.on("wake-from-doze", () => callback()),
  onDndChange: (callback) => ipcRenderer.on("dnd-change", (_, enabled) => callback(enabled)),
  onMiniModeChange: (cb) => ipcRenderer.on("mini-mode-change", (_, enabled) => cb(enabled)),
  // Reaction control (from main, relayed from hit window)
  onStartDragReaction: (cb) => ipcRenderer.on("start-drag-reaction", () => cb()),
  onEndDragReaction: (cb) => ipcRenderer.on("end-drag-reaction", () => cb()),
  onPlayClickReaction: (cb) => ipcRenderer.on("play-click-reaction", (_, svg, duration) => cb(svg, duration)),
  // Render window → main (cursor polling control during reactions)
  pauseCursorPolling: () => ipcRenderer.send("pause-cursor-polling"),
  resumeFromReaction: () => ipcRenderer.send("resume-from-reaction"),

  // ── Clawd Pet Plugin: chat bubble bridge ──
  onSpeechBubble: (cb) => ipcRenderer.on("speech-bubble", (_, text, timeout) => cb(text, timeout)),
  onChatOutbound: (cb) => ipcRenderer.on("chat-outbound", (_, text) => cb(text)),
  submitChat: (text) => ipcRenderer.send("chat-submit", text),
  setFocusable: (focusable) => ipcRenderer.send("set-focusable", focusable),
  onWindowBlur: (cb) => ipcRenderer.on("window-blur", cb),
  onPetState: (cb) => ipcRenderer.on("pet-state", (_, state) => cb(state)),
  onWsStatus: (cb) => ipcRenderer.on("ws-status", (_, status) => cb(status)),
  onOpenChatInput: (cb) => ipcRenderer.on("open-chat-input", () => cb()),
  onDismissChat: (cb) => ipcRenderer.on("dismiss-chat", () => cb()),
  wsConnectedUpdate: (connected) => ipcRenderer.send("ws-connected-update", connected),
});
