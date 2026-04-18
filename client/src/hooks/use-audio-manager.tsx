import { useState, useEffect, useRef, useCallback } from "react";
import { createAudioBuffer, createLoopingAudio } from "@/lib/audio-utils";
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
  const reportedMissingRef = useRef<Set<string>>(new Set());
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  useEffect(() => {
    const initAudioContext = async () => {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
        gainNodeRef.current.gain.value = volume;
      } catch (error) {
        console.error("Failed to initialize audio context:", error);
      }
    };

    initAudioContext();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
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
    if (!audioContextRef.current || !gainNodeRef.current) {
      console.error('Audio context or gain node not initialized');
      return;
    }

    if (audioContextRef.current.state === 'closed') {
      console.error('Audio context has been closed');
      return;
    }

    stopCurrentAudio();

    try {
      if (audioContextRef.current.state === "suspended") {
        console.log('Resuming suspended audio context');
        try {
          await audioContextRef.current.resume();
          console.log('Audio context resumed successfully');
        } catch (resumeError) {
          console.error('Failed to resume audio context:', resumeError);
          setIsPlaying(false);
          throw new Error(`Cannot play audio - audio context resume failed: ${resumeError instanceof Error ? resumeError.message : 'Unknown error'}`);
        }
      }
      
      if (audioContextRef.current.state !== "running") {
        const error = `Audio context is not running. Current state: ${audioContextRef.current.state}`;
        console.error(error);
        setIsPlaying(false);
        throw new Error(error);
      }

      const source = audioContextRef.current.createBufferSource();
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
    }
  }, [stopCurrentAudio]);

  const playPredefinedSoundscape = useCallback(async (type: "rain" | "coffee") => {
    const filenames: Record<string, string> = {
      rain: "rainfall_in_a_jungle-1757090030727_1757091361689.mp3",
      coffee: "coffee_shop_in_nyc,_-#3-1757090374207_1757091361687.mp3",
    };
    const filename = filenames[type];
    const audioData = `/attached_assets/${encodeURIComponent(filename)}`;
    
    try {
      const audioBuffer = await createAudioBuffer(audioData, audioContextRef.current!);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error(`Failed to load ${type} soundscape:`, error);
    }
  }, [playAudioBuffer]);

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
      if (!audioContextRef.current) {
        throw new Error('Audio context not initialized');
      }
      
      console.log('Attempting to play custom soundscape:', soundscape.name, 'from URL:', soundscape.audioUrl);
      const audioBuffer = await createAudioBuffer(soundscape.audioUrl, audioContextRef.current);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error("Failed to play custom soundscape:", {
        soundscape: soundscape.name,
        url: soundscape.audioUrl,
        error: error instanceof Error ? error.message : error
      });
      const message = error instanceof Error ? error.message : String(error);
      if (/404|not found/i.test(message)) {
        reportUnavailable(soundscape);
      } else {
        toast({
          title: "Couldn't play soundscape",
          description: `"${soundscape.name}" failed to play: ${message}`,
          variant: "destructive",
        });
      }
    }
  }, [playAudioBuffer, reportUnavailable, toast]);

  const playBonusSoundscape = useCallback(async (soundscape: BonusSoundscape) => {
    try {
      if (!audioContextRef.current) {
        throw new Error('Audio context not initialized');
      }
      
      let audioUrl = soundscape.audioUrl;
      if (audioUrl.startsWith('@assets/')) {
        const filename = audioUrl.replace('@assets/', '');
        audioUrl = `/attached_assets/${encodeURIComponent(filename)}`;
      }
      
      console.log('Attempting to play bonus soundscape from URL:', audioUrl);
      const audioBuffer = await createAudioBuffer(audioUrl, audioContextRef.current);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error("Failed to play bonus soundscape:", {
        soundscape: soundscape.name,
        url: soundscape.audioUrl,
        error: error instanceof Error ? error.message : error
      });
      const message = error instanceof Error ? error.message : String(error);
      if (/404|not found/i.test(message)) {
        reportUnavailable(soundscape);
      } else {
        toast({
          title: "Couldn't play soundscape",
          description: `"${soundscape.name}" failed to play: ${message}`,
          variant: "destructive",
        });
      }
    }
  }, [playAudioBuffer, reportUnavailable, toast]);

  const setSoundscape = useCallback(async (type: SoundscapeType, customId?: string) => {
    setCurrentSoundscape(type);
    setCurrentSoundscapeId(customId || null);

    if (type === "none") {
      stopCurrentAudio();
      return;
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
  }, [customSoundscapes, currentSoundscape, currentSoundscapeId, stopCurrentAudio, isAuthenticated, toast]);

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
          const response = await apiRequest("GET", "/api/soundscapes/mine");
          const data = await response.json();
          if (cancelled) return;
          const mine: CustomSoundscape[] = (data.soundscapes || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            audioUrl: s.audioUrl,
            prompt: s.prompt,
          }));
          // Merge with any soundscapes already added optimistically this
          // session so a slow /mine response can't drop a fresh generation.
          setCustomSoundscapes(prev => {
            const byId = new Map<string, CustomSoundscape>();
            for (const s of mine) byId.set(s.id, s);
            for (const s of prev) if (!byId.has(s.id)) byId.set(s.id, s);
            return Array.from(byId.values());
          });
          // We have a durable server-side list now; clear the legacy local copy.
          try { localStorage.removeItem("custom-soundscapes"); } catch {}
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
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;

    try {
      const audioBuffer = await createAudioBuffer("/audio/notification.mp3", audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (error) {
      try {
        const oscillator = audioContextRef.current.createOscillator();
        const gainNode = audioContextRef.current.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContextRef.current.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContextRef.current.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + 0.3);
        
        oscillator.start(audioContextRef.current.currentTime);
        oscillator.stop(audioContextRef.current.currentTime + 0.3);
      } catch (fallbackError) {
        console.error("Failed to play notification sound:", fallbackError);
      }
    }
  }, []);

  return {
    currentSoundscape,
    currentSoundscapeId,
    customSoundscapes,
    bonusSoundscapes,
    unavailableIds,
    volume,
    isPlaying,
    setVolume,
    setSoundscape,
    addCustomSoundscape,
    deleteCustomSoundscape,
    playNotificationSound,
    stopCurrentAudio,
  };
}
