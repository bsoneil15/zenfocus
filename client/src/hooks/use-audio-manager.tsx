import { useState, useEffect, useRef, useCallback } from "react";
import { createAudioBuffer, createLoopingAudio } from "@/lib/audio-utils";
import { apiRequest } from "@/lib/queryClient";

export type SoundscapeType = "none" | "rain" | "coffee" | "custom" | "pack";

export interface CustomSoundscape {
  id: string;
  name: string;
  audioUrl: string;
  prompt: string;
}

export interface PackSoundscape {
  id: string;
  name: string;
  audioUrl: string;
  prompt: string;
  packId: string;
}

export function useAudioManager() {
  const [currentSoundscape, setCurrentSoundscape] = useState<SoundscapeType>("none");
  const [currentSoundscapeId, setCurrentSoundscapeId] = useState<string | null>(null);
  const [customSoundscapes, setCustomSoundscapes] = useState<CustomSoundscape[]>([]);
  const [packSoundscapes, setPackSoundscapes] = useState<PackSoundscape[]>([]);
  const [volume, setVolume] = useState(0.3);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Initialize audio context
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

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  const stopCurrentAudio = useCallback(() => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const playAudioBuffer = useCallback(async (audioBuffer: AudioBuffer) => {
    if (!audioContextRef.current || !gainNodeRef.current) return;

    stopCurrentAudio();

    try {
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      source.connect(gainNodeRef.current);
      source.start(0);
      
      audioSourceRef.current = source;
      setIsPlaying(true);

      source.onended = () => {
        setIsPlaying(false);
      };
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  }, [stopCurrentAudio]);

  const playPredefinedSoundscape = useCallback(async (type: "rain" | "coffee") => {
    const audioData = type === "rain" ? "/audio/rain.mp3" : "/audio/coffee.mp3";
    
    try {
      const audioBuffer = await createAudioBuffer(audioData, audioContextRef.current!);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error(`Failed to load ${type} soundscape:`, error);
    }
  }, [playAudioBuffer]);

  const playCustomSoundscape = useCallback(async (soundscape: CustomSoundscape) => {
    try {
      const audioBuffer = await createAudioBuffer(soundscape.audioUrl, audioContextRef.current!);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error("Failed to play custom soundscape:", error);
    }
  }, [playAudioBuffer]);

  const playPackSoundscape = useCallback(async (soundscape: PackSoundscape) => {
    try {
      // Convert @assets path to API endpoint
      let audioUrl = soundscape.audioUrl;
      if (audioUrl.startsWith('@assets/')) {
        const filename = audioUrl.replace('@assets/', '');
        audioUrl = `/api/audio/${encodeURIComponent(filename)}`;
      }
      
      console.log('Attempting to play pack soundscape from URL:', audioUrl);
      const audioBuffer = await createAudioBuffer(audioUrl, audioContextRef.current!);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error("Failed to play pack soundscape:", error);
    }
  }, [playAudioBuffer]);

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
    } else if (type === "pack" && customId) {
      const packSoundscape = packSoundscapes.find(s => s.id === customId);
      if (packSoundscape) {
        await playPackSoundscape(packSoundscape);
      }
    }
  }, [stopCurrentAudio, playPredefinedSoundscape, playCustomSoundscape, playPackSoundscape, customSoundscapes, packSoundscapes]);

  const addCustomSoundscape = useCallback((soundscape: CustomSoundscape) => {
    setCustomSoundscapes(prev => [...prev, soundscape]);
    // Store in localStorage
    const updated = [...customSoundscapes, soundscape];
    localStorage.setItem("custom-soundscapes", JSON.stringify(updated));
  }, [customSoundscapes]);

  // Load custom soundscapes from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("custom-soundscapes");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCustomSoundscapes(parsed);
      } catch (error) {
        console.error("Failed to load custom soundscapes:", error);
      }
    }
  }, []);

  // Load pack soundscapes from API
  const loadPackSoundscapes = useCallback(async () => {
    try {
      // Check which packs are unlocked first
      const packsResponse = await apiRequest("GET", "/api/soundscape-packs");
      const packsData = await packsResponse.json();
      const unlockedPackIds = packsData.packs.filter((p: any) => p.isUnlocked).map((p: any) => p.id);
      
      if (unlockedPackIds.length === 0) {
        setPackSoundscapes([]);
        return;
      }
      
      const response = await apiRequest("GET", "/api/soundscapes");
      const data = await response.json();
      const packSounds: PackSoundscape[] = data.soundscapes
        .filter((s: any) => s.isPublic)
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          audioUrl: s.audioUrl,
          prompt: s.prompt,
          packId: 'pack-1' // For now, assume they're all in pack-1
        }));
      setPackSoundscapes(packSounds);
    } catch (error) {
      console.error("Failed to load pack soundscapes:", error);
    }
  }, []);

  useEffect(() => {
    loadPackSoundscapes();
  }, [loadPackSoundscapes]);

  const playNotificationSound = useCallback(async () => {
    if (!audioContextRef.current) return;

    try {
      // Try to play the custom notification sound first
      const audioBuffer = await createAudioBuffer("/audio/notification.mp3", audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
    } catch (error) {
      // Fallback to generated beep if custom sound fails
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
    packSoundscapes,
    volume,
    isPlaying,
    setVolume,
    setSoundscape,
    addCustomSoundscape,
    playNotificationSound,
    stopCurrentAudio,
    loadPackSoundscapes,
  };
}
