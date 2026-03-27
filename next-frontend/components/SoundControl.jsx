"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX, Smartphone } from "lucide-react";
import { getSoundPreferences, setSoundPreferences } from "../lib/soundPreferences";

export default function SoundControl({ className = "" }) {
  // Use a deterministic default for the first render to prevent hydration mismatches.
  const [prefs, setPrefs] = useState({ muted: true, volume: 0.65, vibrate: true });

  useEffect(() => {
    setPrefs(getSoundPreferences());
    const onChange = () => setPrefs(getSoundPreferences());
    window.addEventListener("qrdine-sound-prefs", onChange);
    return () => window.removeEventListener("qrdine-sound-prefs", onChange);
  }, []);

  const toggleMute = () => {
    setSoundPreferences({ muted: !prefs.muted });
    setPrefs(getSoundPreferences());
  };

  const toggleVibrate = () => {
    setSoundPreferences({ vibrate: !prefs.vibrate });
    setPrefs(getSoundPreferences());
  };

  return (
    <div
      className={`menu-control flex items-center gap-1 rounded-full px-1.5 py-1 ${className}`}
      role="group"
      aria-label="Sound and vibration"
    >
      <button
        type="button"
        onClick={toggleMute}
        className="menu-muted flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10"
        aria-pressed={!prefs.muted}
        aria-label={prefs.muted ? "Turn sound on" : "Mute sound"}
      >
        {prefs.muted ? (
          <VolumeX size={18} strokeWidth={2.2} className="menu-text" />
        ) : (
          <Volume2 size={18} strokeWidth={2.2} className="menu-text" />
        )}
      </button>
      <button
        type="button"
        onClick={toggleVibrate}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10 ${
          prefs.vibrate ? "menu-text" : "menu-muted"
        }`}
        aria-pressed={prefs.vibrate}
        aria-label={prefs.vibrate ? "Vibration on" : "Vibration off"}
      >
        <Smartphone size={18} strokeWidth={2.2} className={prefs.vibrate ? "menu-text" : "menu-muted"} />
      </button>
    </div>
  );
}
