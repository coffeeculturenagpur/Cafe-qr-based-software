/** Attention cues - respects `soundPreferences` (mute / volume). */

import { getSoundPreferences } from "./soundPreferences";

let sharedAudioContext = null;
let soundSystemPrimed = false;
let unlockListenersAttached = false;
let lastVibrationAt = 0;
let kitchenAlertAudio = null;
let kitchenAlertSourceNode = null;
let kitchenAlertGainNode = null;
let kitchenAlertCompressorNode = null;
let kitchenAlertPrefsListenerAttached = false;

function effectiveGain(baseGain) {
  const { muted, volume } = getSoundPreferences();
  if (muted) return 0;
  return baseGain * volume;
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    try {
      sharedAudioContext = new Ctx();
    } catch {
      sharedAudioContext = null;
    }
  }
  return sharedAudioContext;
}

function isDesktopClassDevice() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(pointer: fine)").matches;
  } catch {
    return false;
  }
}

function ensureKitchenAlertNodes(audio) {
  const ctx = getAudioContext();
  if (!ctx || !audio) return null;
  if (!kitchenAlertSourceNode) {
    try {
      kitchenAlertSourceNode = ctx.createMediaElementSource(audio);
      kitchenAlertGainNode = ctx.createGain();
      kitchenAlertCompressorNode = ctx.createDynamicsCompressor();
      kitchenAlertCompressorNode.threshold.value = -24;
      kitchenAlertCompressorNode.knee.value = 18;
      kitchenAlertCompressorNode.ratio.value = 10;
      kitchenAlertCompressorNode.attack.value = 0.003;
      kitchenAlertCompressorNode.release.value = 0.2;
      kitchenAlertSourceNode.connect(kitchenAlertGainNode);
      kitchenAlertGainNode.connect(kitchenAlertCompressorNode);
      kitchenAlertCompressorNode.connect(ctx.destination);
    } catch {
      kitchenAlertSourceNode = null;
      kitchenAlertGainNode = null;
      kitchenAlertCompressorNode = null;
    }
  }
  return { ctx, gainNode: kitchenAlertGainNode };
}

function syncKitchenAlertVolume() {
  const { muted, volume } = getSoundPreferences();
  if (kitchenAlertAudio) {
    kitchenAlertAudio.volume = muted ? 0 : Math.min(1, Math.max(0.85, volume));
  }
  if (kitchenAlertGainNode) {
    const boost = isDesktopClassDevice() ? 2.35 : 1.2;
    kitchenAlertGainNode.gain.value = muted ? 0 : Math.max(0.0001, volume * boost);
  }
}

function resumeAudioContext() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state === "running") return Promise.resolve(ctx);
  return ctx.resume().then(() => ctx).catch(() => ctx);
}

function scheduleOscillator(ctx, freq, durationMs, type, gainValue) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startAt = ctx.currentTime + 0.001;
    const endAt = startAt + durationMs / 1000;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    gain.gain.setValueAtTime(Math.max(gainValue, 0.0001), startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(endAt);
  } catch {
    // ignore
  }
}

function removeUnlockListeners() {
  if (typeof window === "undefined" || !unlockListenersAttached) return;
  unlockListenersAttached = false;
  window.removeEventListener("pointerdown", unlockSoundSystem, true);
  window.removeEventListener("touchstart", unlockSoundSystem, true);
  window.removeEventListener("keydown", unlockSoundSystem, true);
  window.removeEventListener("click", unlockSoundSystem, true);
}

function unlockSoundSystem() {
  const ctx = getAudioContext();
  if (!ctx) {
    removeUnlockListeners();
    return;
  }
  resumeAudioContext().finally(() => {
    if (ctx.state === "running") removeUnlockListeners();
  });
}

export function primeSoundSystem() {
  if (typeof window === "undefined" || soundSystemPrimed) return;
  soundSystemPrimed = true;
  getAudioContext();
  if (unlockListenersAttached) return;
  unlockListenersAttached = true;
  window.addEventListener("pointerdown", unlockSoundSystem, true);
  window.addEventListener("touchstart", unlockSoundSystem, true);
  window.addEventListener("keydown", unlockSoundSystem, true);
  window.addEventListener("click", unlockSoundSystem, true);
}

function playOscillator(freq, durationMs, type = "sine", gainValue = 0.06) {
  if (typeof window === "undefined") return;
  primeSoundSystem();
  const g = effectiveGain(gainValue);
  if (g <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "running") {
    scheduleOscillator(ctx, freq, durationMs, type, g);
    return;
  }
  resumeAudioContext().then((resumedCtx) => {
    if (!resumedCtx || resumedCtx.state !== "running") return;
    scheduleOscillator(resumedCtx, freq, durationMs, type, g);
  });
}

function vibrate(pattern) {
  const { vibrate } = getSoundPreferences();
  if (!vibrate || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const now = Date.now();
  if (now - lastVibrationAt < 150) return;
  lastVibrationAt = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

export function playKitchenNewOrder() {
  playOscillator(740, 170, "triangle", 0.14);
  setTimeout(() => playOscillator(1040, 150, "triangle", 0.12), 120);
  vibrate([90, 50, 90]);
}

export function startKitchenOrderAlertLoop() {
  if (typeof window === "undefined") return Promise.resolve(false);
  primeSoundSystem();
  const { muted } = getSoundPreferences();
  if (muted) return Promise.resolve(false);
  if (!kitchenAlertAudio) {
    try {
      kitchenAlertAudio = new Audio("/preview.mp3");
      kitchenAlertAudio.loop = true;
      kitchenAlertAudio.preload = "auto";
      kitchenAlertAudio.playsInline = true;
    } catch {
      kitchenAlertAudio = null;
    }
  }
  if (!kitchenAlertAudio) return Promise.resolve(false);
  syncKitchenAlertVolume();
  const nodeBundle = ensureKitchenAlertNodes(kitchenAlertAudio);
  if (!nodeBundle?.ctx || nodeBundle.ctx.state === "running") {
    return kitchenAlertAudio.play().then(() => true).catch(() => false);
  }
  return resumeAudioContext()
    .then(() => {
      syncKitchenAlertVolume();
      return kitchenAlertAudio.play().then(() => true).catch(() => false);
    })
    .catch(() => false);
}

export function stopKitchenOrderAlertLoop() {
  if (!kitchenAlertAudio) return;
  try {
    kitchenAlertAudio.pause();
    kitchenAlertAudio.currentTime = 0;
  } catch {
    // ignore
  }
}

export function playKitchenOrderAlertPreview() {
  if (typeof window === "undefined") return Promise.resolve(false);
  const hadLoopingAlert = Boolean(kitchenAlertAudio && !kitchenAlertAudio.paused);
  return startKitchenOrderAlertLoop().then((started) => {
    if (!started || hadLoopingAlert || !kitchenAlertAudio) return started;
    window.setTimeout(() => {
      if (!hadLoopingAlert) {
        stopKitchenOrderAlertLoop();
      }
    }, 4000);
    return started;
  });
}

export function playWaiterReady() {
  playOscillator(880, 120, "sine", 0.13);
  setTimeout(() => playOscillator(1175, 200, "sine", 0.13), 90);
  vibrate([70, 35, 70, 35, 140]);
}

export function playCustomerStatus() {
  playOscillator(660, 110, "sine", 0.11);
  vibrate(60);
}

/** Quick blip when adding to cart */
export function playAddToCart() {
  playOscillator(660, 55, "sine", 0.07);
  setTimeout(() => playOscillator(880, 45, "sine", 0.05), 45);
  vibrate(25);
}

export function playSuccess() {
  playOscillator(659, 110, "sine", 0.12);
  setTimeout(() => playOscillator(880, 120, "sine", 0.13), 70);
  setTimeout(() => playOscillator(1175, 150, "sine", 0.12), 160);
  vibrate([40, 25, 55]);
}

export function playSoftError() {
  playOscillator(240, 150, "triangle", 0.1);
  setTimeout(() => playOscillator(180, 180, "triangle", 0.09), 95);
  vibrate([55, 45, 60]);
}

export function playTabSwitch() {
  playOscillator(440, 45, "sine", 0.04);
}

export function testSoundAndVibration() {
  playOscillator(784, 140, "triangle", 0.14);
  setTimeout(() => playOscillator(988, 160, "sine", 0.14), 130);
  setTimeout(() => playOscillator(1319, 220, "sine", 0.14), 300);
  vibrate([70, 40, 70]);
}

/**
 * Optional short UI clip from /sounds/*.mp3 - only if file exists and unmuted.
 * Falls back silently if missing.
 */
export function playUiSound(filename) {
  if (typeof window === "undefined") return;
  primeSoundSystem();
  const g = effectiveGain(0.08);
  if (g <= 0) return;
  try {
    const audio = new Audio(`/sounds/${filename}`);
    audio.volume = Math.min(1, g / 0.08);
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

export function maybeNotifyBrowser(title, body) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  const { vibrate } = getSoundPreferences();
  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        silent: false,
        vibrate: vibrate ? [120, 60, 120] : undefined,
      });
    } catch {
      // ignore
    }
  }
}

export function requestNotificationPermission() {
  primeSoundSystem();
  unlockSoundSystem();
  if (typeof window === "undefined" || typeof Notification === "undefined") return Promise.resolve("unsupported");
  if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
  return Notification.requestPermission();
}

if (typeof window !== "undefined" && !kitchenAlertPrefsListenerAttached) {
  kitchenAlertPrefsListenerAttached = true;
  window.addEventListener("qrdine-sound-prefs", syncKitchenAlertVolume);
}
