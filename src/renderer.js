// --- Render window: pure view (SVG rendering + eye tracking) ---
// All input (pointer/drag/click) is handled by the hit window (hit-renderer.js).
// Reactions are triggered via IPC from main (relayed from hit window).

const container = document.getElementById("pet-container");

// --- Reaction state (visual side) ---
const REACT_DRAG_SVG = "clawd-react-drag.svg";
let isReacting = false;
let isDragReacting = false;
let reactTimer = null;
let currentIdleSvg = null;    // tracks which SVG is currently showing
let dndEnabled = false;

window.electronAPI.onDndChange((enabled) => { dndEnabled = enabled; });

function getObjectSvgName(objectEl) {
  if (!objectEl) return null;
  const data = objectEl.getAttribute("data") || objectEl.data || "";
  if (!data) return null;
  const clean = data.split(/[?#]/)[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || null;
}

const SVG_IDLE_FOLLOW = "clawd-idle-follow.svg";

function shouldTrackEyes(state, svg) {
  return (state === "idle" && svg === SVG_IDLE_FOLLOW) || state === "mini-idle";
}

// --- IPC-triggered reactions (from hit window via main relay) ---
window.electronAPI.onStartDragReaction(() => startDragReaction());
window.electronAPI.onEndDragReaction(() => endDragReaction());
window.electronAPI.onPlayClickReaction((svg, duration) => playReaction(svg, duration));

function playReaction(svgFile, durationMs) {
  isReacting = true;
  detachEyeTracking();
  window.electronAPI.pauseCursorPolling();

  // Reuse existing swap pattern
  if (pendingNext) {
    pendingNext.remove();
    pendingNext = null;
  }

  const next = document.createElement("object");
  next.type = "image/svg+xml";
  next.id = "clawd";
  next.style.opacity = "0";

  const swap = () => {
    if (pendingNext !== next) return;
    next.style.transition = "none";
    next.style.opacity = "1";
    for (const child of [...container.querySelectorAll("object")]) {
      // ── Clawd Pet Plugin: preserve thinkingEl ──
      if (child !== next && child !== thinkingEl) child.remove();
    }
    pendingNext = null;
    clawdEl = next;
    currentDisplayedSvg = svgFile;
  };

  next.addEventListener("load", swap, { once: true });
  next.data = `../assets/svg/${svgFile}`;
  container.appendChild(next);
  pendingNext = next;
  setTimeout(() => {
    if (pendingNext !== next) return;
    // If SVG failed to load, abandon swap and keep current display
    try { if (!next.contentDocument) { next.remove(); pendingNext = null; return; } } catch {}
    swap();
  }, 3000);

  reactTimer = setTimeout(() => endReaction(), durationMs);
}

function endReaction() {
  if (!isReacting) return;
  isReacting = false;
  reactTimer = null;
  window.electronAPI.resumeFromReaction();
}

function cancelReaction() {
  // Click timers are now in hit-renderer.js — only clear local reaction state
  if (isReacting) {
    if (reactTimer) { clearTimeout(reactTimer); reactTimer = null; }
    isReacting = false;
  }
  if (isDragReacting) {
    isDragReacting = false;
  }
}

// --- Drag reaction (loops while dragging, idle-follow only) ---
function swapToSvg(svgFile) {
  if (pendingNext) { pendingNext.remove(); pendingNext = null; }
  const next = document.createElement("object");
  next.type = "image/svg+xml";
  next.id = "clawd";
  next.style.opacity = "0";
  const swap = () => {
    if (pendingNext !== next) return;
    next.style.transition = "none";
    next.style.opacity = "1";
    for (const child of [...container.querySelectorAll("object")]) {
      // ── Clawd Pet Plugin: preserve thinkingEl ──
      if (child !== next && child !== thinkingEl) child.remove();
    }
    pendingNext = null;
    clawdEl = next;
    currentDisplayedSvg = svgFile;
  };
  next.addEventListener("load", swap, { once: true });
  next.data = `../assets/svg/${svgFile}`;
  container.appendChild(next);
  pendingNext = next;
  setTimeout(() => {
    if (pendingNext !== next) return;
    try { if (!next.contentDocument) { next.remove(); pendingNext = null; return; } } catch {}
    swap();
  }, 3000);
}

function startDragReaction() {
  if (isDragReacting) return;
  if (dndEnabled) return;  // DND: just move the window, no reaction animation

  // Drag interrupts click reaction if active
  if (isReacting) {
    if (reactTimer) { clearTimeout(reactTimer); reactTimer = null; }
    isReacting = false;
  }

  isDragReacting = true;
  detachEyeTracking();
  window.electronAPI.pauseCursorPolling();
  swapToSvg(REACT_DRAG_SVG);
}

function endDragReaction() {
  if (!isDragReacting) return;
  isDragReacting = false;
  window.electronAPI.resumeFromReaction();
}

// --- State change → switch SVG animation (preload + instant swap) ---
let clawdEl = document.getElementById("clawd");
// ── Clawd Pet Plugin: thinking element for chat input overlay ──
let thinkingEl = null;
let pendingNext = null;
let currentDisplayedSvg = getObjectSvgName(clawdEl);
currentIdleSvg = currentDisplayedSvg;

window.electronAPI.onStateChange((state, svg) => {
  // Main process state change → cancel any active click reaction
  cancelReaction();

  if (pendingNext) {
    pendingNext.remove();
    pendingNext = null;
  }
  if (clawdEl && clawdEl.isConnected && currentDisplayedSvg === svg) {
    if (shouldTrackEyes(state, svg) && !eyeTarget) {
      attachEyeTracking(clawdEl);
    } else if (!shouldTrackEyes(state, svg)) {
      detachEyeTracking();
    }
    currentIdleSvg = svg;
    return;
  }
  detachEyeTracking();

  const next = document.createElement("object");
  next.type = "image/svg+xml";
  next.id = "clawd";
  next.style.opacity = "0";

  const swap = () => {
    if (pendingNext !== next) return;
    next.style.transition = "none";
    next.style.opacity = "1";
    for (const child of [...container.querySelectorAll("object")]) {
      // ── Clawd Pet Plugin: preserve thinkingEl ──
      if (child !== next && child !== thinkingEl) child.remove();
    }
    pendingNext = null;
    clawdEl = next;
    currentDisplayedSvg = svg;

    // ── Clawd Pet Plugin: hide Clawd when chat input is visible ──
    if (chatInputVisible && thinkingEl && thinkingEl.isConnected) {
      clawdEl.style.display = "none";
      thinkingEl.style.opacity = "1";
    }

    if (shouldTrackEyes(state, svg)) {
      attachEyeTracking(next);
    }

    // Track current SVG for click reaction gating
    currentIdleSvg = svg;
  };

  next.addEventListener("load", swap, { once: true });
  next.data = `../assets/svg/${svg}`;
  container.appendChild(next);
  pendingNext = next;
  setTimeout(() => {
    if (pendingNext !== next) return;
    try { if (!next.contentDocument) { next.remove(); pendingNext = null; return; } } catch {}
    swap();
  }, 3000);
});

// --- Eye tracking (idle state only) ---
let eyeTarget = null;
let bodyTarget = null;
let shadowTarget = null;
let lastEyeDx = 0;
let lastEyeDy = 0;
let eyeAttachToken = 0;

function applyEyeMove(dx, dy) {
  if (eyeTarget) {
    eyeTarget.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  if (bodyTarget || shadowTarget) {
    const bdx = Math.round(dx * 0.33 * 2) / 2;
    const bdy = Math.round(dy * 0.33 * 2) / 2;
    if (bodyTarget) bodyTarget.style.transform = `translate(${bdx}px, ${bdy}px)`;
    if (shadowTarget) {
      // Shadow stretches toward lean direction (feet stay anchored)
      const absDx = Math.abs(bdx);
      const scaleX = 1 + absDx * 0.15;
      const shiftX = Math.round(bdx * 0.3 * 2) / 2;
      shadowTarget.style.transform = `translate(${shiftX}px, 0) scaleX(${scaleX})`;
    }
  }
}

function attachEyeTracking(objectEl) {
  const token = ++eyeAttachToken;
  eyeTarget = null;
  bodyTarget = null;
  shadowTarget = null;

  const tryAttach = (attempt) => {
    if (token !== eyeAttachToken) return;
    if (!objectEl || !objectEl.isConnected) return;

    try {
      const svgDoc = objectEl.contentDocument;
      const eyes = svgDoc && svgDoc.getElementById("eyes-js");
      if (eyes) {
        eyeTarget = eyes;
        bodyTarget = svgDoc.getElementById("body-js");
        shadowTarget = svgDoc.getElementById("shadow-js");
        applyEyeMove(lastEyeDx, lastEyeDy);
        return;
      }
    } catch (e) {
      console.warn("Cannot access SVG contentDocument for eye tracking:", e.message);
      return;
    }

    if (attempt >= 60) {
      console.warn("Timed out waiting for SVG eye targets");
      return;
    }
    // setTimeout fallback — rAF may be throttled in unfocused windows
    setTimeout(() => tryAttach(attempt + 1), 16);
  };

  tryAttach(0);
}

function detachEyeTracking() {
  eyeAttachToken++;
  eyeTarget = null;
  bodyTarget = null;
  shadowTarget = null;
}

window.electronAPI.onEyeMove((dx, dy) => {
  lastEyeDx = dx;
  lastEyeDy = dy;
  // Detect stale eye targets (e.g. after DWM z-order recovery invalidates contentDocument)
  if (eyeTarget && !eyeTarget.ownerDocument?.defaultView) {
    eyeTarget = null;
    bodyTarget = null;
    shadowTarget = null;
    if (clawdEl && clawdEl.isConnected) attachEyeTracking(clawdEl);
    return;
  }
  applyEyeMove(dx, dy);
});

// --- Wake from doze (smooth eye opening) ---
window.electronAPI.onWakeFromDoze(() => {
  if (clawdEl && clawdEl.contentDocument) {
    try {
      const eyes = clawdEl.contentDocument.getElementById("eyes-doze");
      if (eyes) eyes.style.transform = "scaleY(1)";
    } catch (e) {}
  }
});

// ── Clawd Pet Plugin: chat bubble UI ──────────────────────────────────────────
let chatInputVisible = false;
let wsConnected = false;
let chatInputEl = null;
let chatInputBlurHandler = null;
let chatBubble = null;

function createSpeechBubble(text, duration) {
  removeSpeechBubble();
  chatBubble = document.createElement("div");
  chatBubble.id = "chat-bubble";
  Object.assign(chatBubble.style, {
    position: "absolute", top: "5%", left: "50%", transform: "translateX(-50%)",
    background: "#ffffff", border: "2.5px solid #e74c3c", borderRadius: "16px",
    padding: "10px 14px", width: "190px", maxHeight: "50%", overflowY: "hidden",
    fontSize: "13px", color: "#333", zIndex: 99999,
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)", fontFamily: "monospace",
    lineHeight: "1.4", textAlign: "center", opacity: "0",
    transition: "opacity 0.3s ease", whiteSpace: "pre-wrap",
    wordBreak: "break-word", pointerEvents: "auto",
  });
  const msg = document.createElement("span");
  msg.textContent = text;
  chatBubble.appendChild(msg);
  container.appendChild(chatBubble);
  requestAnimationFrame(() => { chatBubble.style.opacity = "1"; });
  setTimeout(() => removeSpeechBubble(), duration);
}

function removeSpeechBubble() {
  if (chatBubble) { chatBubble.remove(); chatBubble = null; }
}

function showChatInput() {
  if (chatInputEl) return;

  chatInputVisible = true;
  window.electronAPI.setFocusable(true);

  if (clawdEl) clawdEl.style.display = "none";
  if (!thinkingEl || !thinkingEl.isConnected) {
    thinkingEl = document.createElement("object");
    thinkingEl.type = "image/svg+xml";
    thinkingEl.id = "clawd-thinking";
    thinkingEl.data = "../assets/svg/clawd-working-thinking.svg";
    Object.assign(thinkingEl.style, {
      width: "190%", height: "130%", position: "absolute",
      left: "-45%", top: "-25%", pointerEvents: "none", opacity: "0",
    });
    thinkingEl.addEventListener("load", () => { thinkingEl.style.opacity = "1"; }, { once: true });
    container.appendChild(thinkingEl);
  } else {
    thinkingEl.style.opacity = "1";
  }
  thinkingEl.style.display = "";

  // Chat input overlay (simplified, like 0.5.0)
  chatInputEl = document.createElement("div");
  chatInputEl.id = "chat-input-overlay";
  Object.assign(chatInputEl.style, {
    position: "absolute",
    top: "12%",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#fff",
    border: "2px solid #3498db",
    borderRadius: "16px",
    padding: "6px 10px",
    zIndex: 999999,
    display: "flex",
    gap: "6px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
    opacity: "0",
    transition: "opacity 0.2s ease",
    pointerEvents: "auto",
  });

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Say something...";
  Object.assign(input.style, {
    border: "none",
    outline: "none",
    fontSize: "13px",
    fontFamily: "system-ui, sans-serif",
    width: "140px",
    background: "transparent",
    color: "#333",
    pointerEvents: "auto",
  });

  const btn = document.createElement("button");
  btn.textContent = "→";
  btn.style.cssText = "background:#3498db;color:#fff;border:none;border-radius:8px;padding:2px 8px;cursor:pointer;font-size:13px;pointer-events:auto;";
  btn.addEventListener("click", (e) => { e.stopPropagation(); submitChat(input.value); });
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submitChat(input.value); if (e.key === "Escape") hideChatInput(); });
  chatInputEl.addEventListener("pointerdown", (e) => e.stopPropagation());

  chatInputEl.appendChild(input);
  chatInputEl.appendChild(btn);
  container.appendChild(chatInputEl);
  requestAnimationFrame(() => { chatInputEl.style.opacity = "1"; });
  setTimeout(() => input.focus(), 200);

  // Dismiss on click outside input (pet body or anywhere outside the app)
  chatInputBlurHandler = (e) => {
    if (chatInputEl && !chatInputEl.contains(e.target)) {
      hideChatInput();
    }
  };
  container.addEventListener("pointerdown", chatInputBlurHandler);
}

function submitChat(text) {
  text = text.trim();
  if (!text) { hideChatInput(); return; }
  window.electronAPI.submitChat(text);
  hideChatInput();
}

function hideChatInput() {
  if (!chatInputEl) return;

  chatInputVisible = false;
  window.electronAPI.setFocusable(false);
  if (chatInputBlurHandler) {
    container.removeEventListener("pointerdown", chatInputBlurHandler);
    chatInputBlurHandler = null;
  }
  chatInputEl.style.opacity = "0";
  if (chatInputEl) { chatInputEl.remove(); chatInputEl = null; }

  // Restore original SVG
  if (thinkingEl) thinkingEl.style.opacity = "0";
  if (clawdEl) clawdEl.style.display = "";
}

// Listen for open-chat-input from hit window (double-click)
window.electronAPI?.onOpenChatInput?.(() => {
  showChatInput();
});

// Listen for dismiss-chat from hit window (single click on pet)
window.electronAPI?.onDismissChat?.(() => {
  if (chatInputVisible) hideChatInput();
});

// Listen for pet state changes from OpenClaw (thinking, working, idle)
window.electronAPI?.onPetState?.((state) => {
  console.log("[ClawdPet] Pet state:", state);
});

// Listen for speech bubble events from main process
window.electronAPI?.onSpeechBubble?.((text, timeout) => {
  createSpeechBubble(text, timeout);
});

// Listen for WebSocket connection status
window.electronAPI?.onWsStatus?.((status) => {
  wsConnected = status === "connected";
  window.electronAPI?.wsConnectedUpdate?.(wsConnected);
});

// Listen for outbound chat
window.electronAPI?.onChatOutbound?.((text) => {
  console.log("[ClawdPet] User sent:", text);
});

// Global blur listener (main process handles win.focus() side effects)
window.electronAPI?.onWindowBlur?.(() => {
  if (chatInputVisible) {
    hideChatInput();
  }
});

