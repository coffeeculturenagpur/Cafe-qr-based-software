"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX, Smartphone } from "lucide-react";
import { getSoundPreferences, setSoundPreferences } from "../lib/soundPreferences";

export default function SoundControl({ className = "", showVibrate = true }) {
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
      className={`flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 px-1.5 py-1 shadow-sm backdrop-blur ${className}`}
      role="group"
      aria-label="Sound and vibration"
    >
      <button
        type="button"
        onClick={toggleMute}
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
        aria-pressed={!prefs.muted}
        aria-label={prefs.muted ? "Turn sound on" : "Mute sound"}
      >
        {prefs.muted ? (
          <VolumeX size={18} strokeWidth={2.2} className="text-slate-700" />
        ) : (
          <Volume2 size={18} strokeWidth={2.2} className="text-slate-700" />
        )}
      </button>
      {showVibrate && (
        <button
          type="button"
          onClick={toggleVibrate}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-slate-100 ${
            prefs.vibrate ? "text-slate-700" : "text-slate-400"
          }`}
          aria-pressed={prefs.vibrate}
          aria-label={prefs.vibrate ? "Vibration on" : "Vibration off"}
        >
          <Smartphone size={18} strokeWidth={2.2} className={prefs.vibrate ? "text-slate-700" : "text-slate-400"} />
        </button>
      )}
    </div>
  );
}
