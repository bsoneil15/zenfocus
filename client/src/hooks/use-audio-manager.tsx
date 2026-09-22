import { useState, useEffect, useRef, useCallback } from "react";
import { createAudioBuffer, generateNotificationSound } from "@/lib/audio-utils";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export type SoundscapeType = "none" | "rain" | "coffee" | "custom" | "bonus";

export interface CustomSoundscape {
  id: string;
  name: string;
  audioUrl: string;
  prompt: string;
}

export interface BonusSoundscape {
  id: string;
  name: string;
  audioUrl: string;
  prompt: string;
}

export function useAudioManager() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [currentSoundscape, setCurrentSoundscape] = useState<SoundscapeType>("none");
  const [currentSoundscapeId, setCurrentSoundscapeId] = useState<string | null>(null);
  const [customSoundscapes, setCustomSoundscapes] = useState<CustomSoundscape[]>([]);
  const [bonusSoundscapes, setBonusSoundscapes] = useState<BonusSoundscape[]>([]);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  const [volume, setVolume] = useState(0.3);
  const [isPlaying, setIsPlaying] = useState(false);

  // Persist the audio-unlock decision across visits so the mobile "Tap to
  // enable audio" prompt only has to appear the first time. We seed initial
  // state from localStorage; if the browser has actually revoked the
  // permission, the next play attempt will fail and we'll clear the flag
  // (see reportLockedAudio).
  const AUDIO_UNLOCK_STORAGE_KEY = "audio-unlocked-v1";
  const readStoredUnlock = () => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(AUDIO_UNLOCK_STORAGE_KEY) === "1"; }
    catch { return false; }
  };
  const writeStoredUnlock = (value: boolean) => {
    if (typeof window === "undefined") return;
    try {
      if (value) window.localStorage.setItem(AUDIO_UNLOCK_STORAGE_KEY, "1");
      else window.localStorage.removeItem(AUDIO_UNLOCK_STORAGE_KEY);
    } catch {}
  };

  const [audioUnlocked, _setAudioUnlocked] = useState<boolean>(() => readStoredUnlock());
  // Only persist `true` from the generic setter — transient transitions to
  // "suspended" (e.g. backgrounded tab) shouldn't wipe the remembered unlock.
  // Genuine failures call writeStoredUnlock(false) explicitly.
  const setAudioUnlocked = useCallback((value: boolean) => {
    _setAudioUnlocked(value);
    if (value) writeStoredUnlock(true);
  }, []);
  const reportedMissingRef = useRef<Set<string>>(new Set());

  const isMobileViewport = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(max-width: 767px)").matches ?? false;
  };
  const reportLockedAudio = (soundscapeName?: string) => {
    _setAudioUnlocked(false);
    writeStoredUnlock(false);
    if (!isMobileViewport()) {
      toast({
        title: "Tap to enable audio",
        description: soundscapeName
          ? `Click anywhere on the page, then try playing "${soundscapeName}" again.`
          : "Click anywhere on the page, then try again — your browser is blocking audio until you interact with it.",
        variant: "destructive",
      });
    }
  };
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const volumeRef = useRef(volume);
  // Decoded buffers are reused across play/stop/switch so we do not re-fetch
  // and re-decode the same ~700KB MP3. Cleared whenever the AudioContext is
  // recreated (buffers are tied to a specific context).
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const pendingAudioLoadsRef = useRef<Map<string, Promise<AudioBuffer>>>(new Map());

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Lazily create the AudioContext. iOS Safari refuses to leave the
  // "suspended" state for a context that was constructed without a user
  // gesture, so we MUST defer creation until a tap/click actually happens.
  // Returns the live context (or null if construction failed).
  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      return audioContextRef.current;
    }
    try {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) {
        console.error("Web Audio API is not supported in this browser");
        return null;
      }
      // New context → decoded buffers from a previous context are unusable.
      audioBufferCacheRef.current.clear();
      pendingAudioLoadsRef.current.clear();
      const ctx = new Ctor();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.value = volumeRef.current;
      audioContextRef.current = ctx;
      gainNodeRef.current = gain;
      const syncUnlocked = () => setAudioUnlocked(ctx.state === "running");
      syncUnlocked();
      ctx.addEventListener?.("statechange", syncUnlocked);
      return ctx;
    } catch (error) {
      console.error("Failed to initialize audio context:", error);
      return null;
    }
  }, []);

  const getOrLoadAudioBuffer = useCallback(
    async (url: string, ctx: AudioContext): Promise<AudioBuffer> => {
      const cached = audioBufferCacheRef.current.get(url);
      if (cached) {
        return cached;
      }

      const pending = pendingAudioLoadsRef.current.get(url);
      if (pending) {
        return pending;
      }

      const loadPromise = createAudioBuffer(url, ctx)
        .then((buffer) => {
          audioBufferCacheRef.current.set(url, buffer);
          pendingAudioLoadsRef.current.delete(url);
          return buffer;
        })
        .catch((error) => {
          pendingAudioLoadsRef.current.delete(url);
          throw error;
        });

      pendingAudioLoadsRef.current.set(url, loadPromise);
      return loadPromise;
    },
    []
  );

  const evictAudioBuffer = useCallback((url: string) => {
    audioBufferCacheRef.current.delete(url);
    pendingAudioLoadsRef.current.delete(url);
  }, []);

  // Explicit one-tap unlock for the "Enable audio" prompt. Returns true once
  // the AudioContext is in the "running" state.
  //
  // iOS Safari quirks this works around:
  // 1. resume() alone is sometimes insufficient — the state can stay
  //    "suspended" even after the promise resolves on some iOS versions.
  // 2. The global capture-phase handler fires before this button's onClick,
  //    so resume() may already be in-flight when we arrive here. Calling it
  //    again is safe but the state check right after may still show "suspended".
  // 3. Playing a tiny silent buffer is the most reliable way to force the
  //    context into "running" on iOS — starting a BufferSource node triggers
  //    the audio session in a way that resume() alone sometimes doesn't.
  const unlockAudio = useCallback(async (): Promise<boolean> => {
    const ctx = ensureAudioContext();
    if (!ctx) return false;

    if (ctx.state === "running") {
      setAudioUnlocked(true);
      return true;
    }

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (err) {
        console.error("Audio resume failed:", err);
      }
    }

    // Play a 1-sample silent buffer — the classic iOS AudioContext unlock.
    // Starting any BufferSource forces the audio session open more reliably
    // than resume() alone on older iOS Safari versions.
    if (ctx.state !== "closed") {
      try {
        const silentBuffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        const source = ctx.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch (err) {
        console.error("Silent-buffer unlock failed:", err);
      }
    }

    // Give iOS up to 200 ms to settle the state transition before we
    // decide whether the unlock succeeded.
    await new Promise<void>((resolve) => {
      if (ctx.state === "running") { resolve(); return; }
      const timeout = setTimeout(resolve, 200);
      const onStateChange = () => {
        if (ctx.state === "running") {
          clearTimeout(timeout);
          ctx.removeEventListener("statechange", onStateChange);
          resolve();
        }
      };
      ctx.addEventListener("statechange", onStateChange);
    });

    // Re-read state after async resume/silent-buffer — TypeScript's control
    // flow still thinks we're in suspended|closed from earlier branches.
    const finalState = ctx.state as AudioContextState;
    const running = finalState === ("running" as AudioContextState);
    setAudioUnlocked(running);
    return running;
  }, [ensureAudioContext, setAudioUnlocked]);

  // Global one-shot unlock: on the very first user interaction anywhere on
  // the page, create + resume the AudioContext so subsequent async play
  // calls (which happen *after* a fetch) are still allowed to start audio
  // on iOS.
  useEffect(() => {
    let unlocked = false;
    const events: (keyof WindowEventMap)[] = ["pointerdown", "touchend", "click", "keydown"];
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    const cleanup = () => {
      for (const evt of events) window.removeEventListener(evt, unlock, opts);
    };
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      cleanup();
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume()
          .then(() => setAudioUnlocked(ctx.state === "running"))
          .catch(err => console.error("Initial audio unlock failed:", err));
      } else if (ctx && ctx.state === "running") {
        setAudioUnlocked(true);
      }
    }
    for (const evt of events) window.addEventListener(evt, unlock, opts);
    return cleanup;
  }, [ensureAudioContext]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  const stopCurrentAudio = useCallback(() => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      } catch (error) {
        console.error("Error stopping audio source:", error);
      }
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const playAudioBuffer = useCallback(async (audioBuffer: AudioBuffer) => {
    const ctx = ensureAudioContext();
    if (!ctx || !gainNodeRef.current) {
      console.error('Audio context or gain node not initialized');
      throw new Error("Audio isn't ready yet — tap anywhere on the page first, then try again.");
    }

    if (ctx.state === 'closed') {
      console.error('Audio context has been closed');
      throw new Error("Audio system was closed. Please reload the page.");
    }

    stopCurrentAudio();

    try {
      if (ctx.state === "suspended") {
        console.log('Resuming suspended audio context');
        try {
          await ctx.resume();
          console.log('Audio context resumed successfully');
        } catch (resumeError) {
          console.error('Failed to resume audio context:', resumeError);
          setIsPlaying(false);
          throw new Error("Tap the screen and try again — your browser is blocking audio until you interact with the page.");
        }
      }

      if (ctx.state !== "running") {
        const error = `Audio context is not running. Current state: ${ctx.state}`;
        console.error(error);
        setIsPlaying(false);
        throw new Error("Tap the screen and try again — your browser is blocking audio until you interact with the page.");
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      source.connect(gainNodeRef.current);
      
      source.onended = () => {
        if (audioSourceRef.current === source) {
          console.log('Audio source ended (manual stop)');
          setIsPlaying(false);
        }
      };
      
      source.start(0);
      audioSourceRef.current = source;
      setIsPlaying(true);
      
      console.log('Audio playback started successfully');
    } catch (error) {
      console.error("Failed to play audio:", {
        error: error instanceof Error ? error.message : error,
        audioContextState: audioContextRef.current?.state,
        bufferDuration: audioBuffer?.duration
      });
      setIsPlaying(false);
      throw error;
    }
  }, [ensureAudioContext, stopCurrentAudio]);

  const playPredefinedSoundscape = useCallback(async (type: "rain" | "coffee") => {
    // Preset audio is uploaded to durable object storage at server startup
    // (see server/preset_audio.ts) and served via the public /objects/...
    // route. We deliberately do NOT fall back to /attached_assets/ here so
    // that any production breakage surfaces loudly instead of silently
    // depending on the ephemeral attached_assets/ folder.
    const urls: Record<string, string> = {
      rain: "/objects/soundscape-presets/rain.mp3",
      coffee: "/objects/soundscape-presets/coffee.mp3",
    };
    const audioData = urls[type];

    try {
      const ctx = ensureAudioContext();
      if (!ctx) {
        throw new Error("Audio isn't ready yet — tap anywhere on the page first, then try again.");
      }
      const audioBuffer = await getOrLoadAudioBuffer(audioData, ctx);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error(`Failed to load ${type} soundscape:`, error);
      const message = error instanceof Error ? error.message : String(error);
      if (/tap|interact|browser is blocking|isn't ready/i.test(message)) {
        reportLockedAudio(type === "rain" ? "Rain" : "Coffee Shop");
      } else {
        toast({
          title: "Couldn't play soundscape",
          description: `The ${type === "rain" ? "Rain" : "Coffee Shop"} preset failed to load.`,
          variant: "destructive",
        });
      }
    }
  }, [ensureAudioContext, getOrLoadAudioBuffer, playAudioBuffer, toast]);

  const reportUnavailable = useCallback((soundscape: { id: string; name: string }) => {
    setUnavailableIds(prev => {
      if (prev.has(soundscape.id)) return prev;
      const next = new Set(prev);
      next.add(soundscape.id);
      return next;
    });
    if (!reportedMissingRef.current.has(soundscape.id)) {
      reportedMissingRef.current.add(soundscape.id);
      toast({
        title: "Soundscape unavailable",
        description: `"${soundscape.name}" couldn't be loaded — its audio file is missing on the server.`,
        variant: "destructive",
      });
    }
  }, [toast]);

  const playCustomSoundscape = useCallback(async (soundscape: CustomSoundscape) => {
    try {
      const ctx = ensureAudioContext();
      if (!ctx) {
        throw new Error("Audio isn't ready yet — tap anywhere on the page first, then try again.");
      }

      console.log('Attempting to play custom soundscape:', soundscape.name, 'from URL:', soundscape.audioUrl);
      const audioBuffer = await getOrLoadAudioBuffer(soundscape.audioUrl, ctx);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error("Failed to play custom soundscape:", {
        soundscape: soundscape.name,
        url: soundscape.audioUrl,
        error: error instanceof Error ? error.message : error
      });
      const message = error instanceof Error ? error.message : String(error);
      if (/404|410|not found|gone/i.test(message)) {
        evictAudioBuffer(soundscape.audioUrl);
        reportUnavailable(soundscape);
      } else if (/tap|interact|browser is blocking|isn't ready/i.test(message)) {
        // Locked audio — surfaced via the persistent "Enable audio" banner
        // on mobile, or a fallback toast on desktop.
        reportLockedAudio(soundscape.name);
      } else {
        toast({
          title: "Couldn't play soundscape",
          description: `"${soundscape.name}" failed to play: ${message}`,
          variant: "destructive",
        });
      }
    }
  }, [ensureAudioContext, getOrLoadAudioBuffer, playAudioBuffer, evictAudioBuffer, reportUnavailable, toast]);

  const playBonusSoundscape = useCallback(async (soundscape: BonusSoundscape) => {
    try {
      const ctx = ensureAudioContext();
      if (!ctx) {
        throw new Error("Audio isn't ready yet — tap anywhere on the page first, then try again.");
      }

      const audioUrl = soundscape.audioUrl;
      console.log('Attempting to play bonus soundscape from URL:', audioUrl);
      const audioBuffer = await getOrLoadAudioBuffer(audioUrl, ctx);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error("Failed to play bonus soundscape:", {
        soundscape: soundscape.name,
        url: soundscape.audioUrl,
        error: error instanceof Error ? error.message : error
      });
      const message = error instanceof Error ? error.message : String(error);
      if (/404|410|not found|gone/i.test(message)) {
        evictAudioBuffer(soundscape.audioUrl);
        reportUnavailable(soundscape);
      } else if (/tap|interact|browser is blocking|isn't ready/i.test(message)) {
        reportLockedAudio(soundscape.name);
      } else {
        toast({
          title: "Couldn't play soundscape",
          description: `"${soundscape.name}" failed to play: ${message}`,
          variant: "destructive",
        });
      }
    }
  }, [ensureAudioContext, getOrLoadAudioBuffer, playAudioBuffer, evictAudioBuffer, reportUnavailable, toast]);

  const setSoundscape = useCallback(async (type: SoundscapeType, customId?: string, options?: { playAudio?: boolean }) => {
    const shouldPlay = options?.playAudio !== false;
    setCurrentSoundscape(type);
    setCurrentSoundscapeId(customId || null);

    if (type === "none") {
      stopCurrentAudio();
      return;
    }

    // When the caller explicitly opts out of playback (e.g. "audio follows
    // timer" mode and the timer is currently paused), just update the
    // selection state and stop whatever is playing so the new soundscape
    // will start on the next timer tick.
    if (!shouldPlay) {
      stopCurrentAudio();
      return;
    }

    // Synchronously (no await yet) create + resume the AudioContext so the
    // user-gesture credit is consumed before we hand off to the network. On
    // iOS this is the difference between audio playing and silently failing.
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume()
        .then(() => setAudioUnlocked(ctx.state === "running"))
        .catch(err => console.error("Audio context resume failed:", err));
    } else if (ctx && ctx.state === "running") {
      setAudioUnlocked(true);
    }

    if (type === "rain" || type === "coffee") {
      await playPredefinedSoundscape(type);
    } else if (type === "custom" && customId) {
      const customSoundscape = customSoundscapes.find(s => s.id === customId);
      if (customSoundscape) {
        await playCustomSoundscape(customSoundscape);
      }
    } else if (type === "bonus" && customId) {
      const bonusSoundscape = bonusSoundscapes.find(s => s.id === customId);
      if (bonusSoundscape) {
        await playBonusSoundscape(bonusSoundscape);
      }
    }
  }, [stopCurrentAudio, playPredefinedSoundscape, playCustomSoundscape, playBonusSoundscape, customSoundscapes, bonusSoundscapes]);

  const deleteCustomSoundscape = useCallback(async (id: string) => {
    const target = customSoundscapes.find(s => s.id === id);
    try {
      await apiRequest("DELETE", `/api/soundscapes/${id}`);

      // If the deleted one is currently playing, stop it.
      if (currentSoundscape === "custom" && currentSoundscapeId === id) {
        stopCurrentAudio();
        setCurrentSoundscape("none");
        setCurrentSoundscapeId(null);
      }

      if (target?.audioUrl) {
        evictAudioBuffer(target.audioUrl);
      }

      setCustomSoundscapes(prev => {
        const updated = prev.filter(s => s.id !== id);
        if (!isAuthenticated) {
          try {
            localStorage.setItem("custom-soundscapes", JSON.stringify(updated));
          } catch (error) {
            console.error("Failed to update custom soundscapes in localStorage:", error);
          }
        }
        return updated;
      });

      setUnavailableIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      reportedMissingRef.current.delete(id);

      toast({
        title: "Soundscape deleted",
        description: target ? `"${target.name}" was removed.` : "Soundscape was removed.",
      });
    } catch (error) {
      console.error("Failed to delete custom soundscape:", error);
      toast({
        title: "Couldn't delete soundscape",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  }, [customSoundscapes, currentSoundscape, currentSoundscapeId, stopCurrentAudio, isAuthenticated, evictAudioBuffer, toast]);

  const addCustomSoundscape = useCallback((soundscape: CustomSoundscape) => {
    setCustomSoundscapes(prev => {
      if (prev.some(s => s.id === soundscape.id)) return prev;
      const updated = [...prev, soundscape];
      // Anonymous users keep a local fallback so they don't lose what they
      // generated this session. Signed-in users get their list from the server.
      if (!isAuthenticated) {
        try {
          localStorage.setItem("custom-soundscapes", JSON.stringify(updated));
        } catch (error) {
          console.error("Failed to save custom soundscapes to localStorage:", error);
        }
      }
      return updated;
    });
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    // Reset reported-missing tracking on auth transitions so a re-login can
    // re-toast about a still-missing file.
    reportedMissingRef.current = new Set();
    setUnavailableIds(new Set());

    if (isAuthenticated) {
      (async () => {
        try {
          // Read whatever the user accumulated as a guest BEFORE we hit
          // the server. We need this so the sign-in moment carries those
          // entries forward — either by having the server adopt them
          // (best case, durable) or, failing that, by merging them into
          // the in-memory list so they don't silently disappear this
          // session.
          let localGuestSoundscapes: CustomSoundscape[] = [];
          try {
            const saved = localStorage.getItem("custom-soundscapes");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) {
                localGuestSoundscapes = parsed.filter(
                  (s: any) => s && typeof s.id === "string"
                );
              }
            }
          } catch (err) {
            console.error("Failed to read guest custom soundscapes from localStorage:", err);
          }

          // Track which guest IDs we have *confirmed* are now durably
          // owned by this account. Anything not in this set must stay in
          // localStorage so a reload (or a retry on the next sign-in)
          // can still recover it.
          const claimedIds = new Set<string>();

          if (localGuestSoundscapes.length > 0) {
            try {
              const adoptResponse = await apiRequest("POST", "/api/soundscapes/adopt", {
                ids: localGuestSoundscapes.map(s => s.id),
              });
              const adoptData = await adoptResponse.json().catch(() => ({}));
              const adopted: any[] = Array.isArray(adoptData?.adopted) ? adoptData.adopted : [];
              for (const row of adopted) {
                if (row && typeof row.id === "string") claimedIds.add(row.id);
              }
            } catch (err) {
              // Non-fatal: the merge below still keeps the entries
              // visible this session, and because we won't add their
              // IDs to claimedIds, they stay in localStorage so a
              // reload (or the next sign-in attempt) can recover them.
              console.error("Failed to adopt guest soundscapes on sign-in:", err);
            }
          }

          const response = await apiRequest("GET", "/api/soundscapes/mine");
          const data = await response.json();
          if (cancelled) return;
          const mine: CustomSoundscape[] = (data.soundscapes || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            audioUrl: s.audioUrl,
            prompt: s.prompt,
          }));
          // Anything /mine returns is, by definition, durable for this
          // account — even if adopt didn't claim it (e.g. the row was
          // already owned by this user from a previous session).
          for (const s of mine) claimedIds.add(s.id);

          // Merge with any soundscapes already added optimistically this
          // session AND with anything we read from the guest's local
          // storage above, so a slow /mine response can't drop a fresh
          // generation and a failed adopt call can't silently abandon
          // pre-sign-in history.
          setCustomSoundscapes(prev => {
            const byId = new Map<string, CustomSoundscape>();
            for (const s of mine) byId.set(s.id, s);
            for (const s of prev) if (!byId.has(s.id)) byId.set(s.id, s);
            for (const s of localGuestSoundscapes) if (!byId.has(s.id)) byId.set(s.id, s);
            return Array.from(byId.values());
          });

          // Only forget the guest entries we've confirmed are durably
          // available on the server. Keep everything else in
          // localStorage so a reload (or the next sign-in retry) can
          // still adopt them. If nothing remains, drop the key
          // entirely so we don't keep poking at empty state.
          try {
            const remaining = localGuestSoundscapes.filter(s => !claimedIds.has(s.id));
            if (remaining.length === 0) {
              localStorage.removeItem("custom-soundscapes");
            } else {
              localStorage.setItem("custom-soundscapes", JSON.stringify(remaining));
            }
          } catch (err) {
            console.error("Failed to update guest soundscape localStorage after adoption:", err);
          }
        } catch (error) {
          console.error("Failed to load saved soundscapes:", error);
        }
      })();
    } else {
      // Anonymous: load whatever is in localStorage, otherwise start empty.
      try {
        const saved = localStorage.getItem("custom-soundscapes");
        if (cancelled) return;
        setCustomSoundscapes(saved ? JSON.parse(saved) : []);
      } catch (error) {
        console.error("Failed to load custom soundscapes from localStorage:", error);
        if (!cancelled) setCustomSoundscapes([]);
      }
    }

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const loadBonusSoundscapes = useCallback(async () => {
    try {
      const response = await apiRequest("GET", "/api/soundscapes");
      if (!response.ok) {
        throw new Error(`Soundscapes API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      const bonusSounds: BonusSoundscape[] = data.soundscapes
        .filter((s: any) => s.isPublic)
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          audioUrl: s.audioUrl,
          prompt: s.prompt,
        }));
      
      setBonusSoundscapes(bonusSounds);
    } catch (error) {
      console.error("Failed to load bonus soundscapes:", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      setBonusSoundscapes([]);
    }
  }, []);

  useEffect(() => {
    loadBonusSoundscapes();
  }, [loadBonusSoundscapes]);

  const playNotificationSound = useCallback(async () => {
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {}
    }

    try {
      const audioBuffer = generateNotificationSound(ctx);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
    } catch (error) {
      console.error("Failed to play notification sound:", error);
    }
  }, [ensureAudioContext]);

  return {
    currentSoundscape,
    currentSoundscapeId,
    customSoundscapes,
    bonusSoundscapes,
    unavailableIds,
    volume,
    isPlaying,
    audioUnlocked,
    setVolume,
    setSoundscape,
    unlockAudio,
    addCustomSoundscape,
    deleteCustomSoundscape,
    playNotificationSound,
    stopCurrentAudio,
  };
}
