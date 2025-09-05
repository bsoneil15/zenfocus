import { useState, useEffect, useRef, useCallback } from "react";
import { createAudioBuffer, createLoopingAudio } from "@/lib/audio-utils";

export type SoundscapeType = "none" | "rain" | "coffee" | "custom";

export interface CustomSoundscape {
  id: string;
  name: string;
  audioUrl: string;
  prompt: string;
}

export function useAudioManager() {
  const [currentSoundscape, setCurrentSoundscape] = useState<SoundscapeType>("none");
  const [customSoundscapes, setCustomSoundscapes] = useState<CustomSoundscape[]>([]);
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
    // Import the local audio files using @assets alias
    const audioData = type === "rain" 
      ? "/attached_assets/rainfall_in_a_jungle-1757090030727_1757091361689.mp3"
      : "/attached_assets/coffee_shop_in_nyc,_-#3-1757090374207_1757091361687.mp3";
    
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

  const setSoundscape = useCallback(async (type: SoundscapeType, customId?: string) => {
    setCurrentSoundscape(type);

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
    }
  }, [stopCurrentAudio, playPredefinedSoundscape, playCustomSoundscape, customSoundscapes]);

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

  const playNotificationSound = useCallback(async () => {
    if (!audioContextRef.current) return;

    try {
      // Create a simple notification beep using Web Audio API
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
    } catch (error) {
      console.error("Failed to play notification sound:", error);
    }
  }, []);

  return {
    currentSoundscape,
    customSoundscapes,
    volume,
    isPlaying,
    setVolume,
    setSoundscape,
    addCustomSoundscape,
    playNotificationSound,
    stopCurrentAudio,
  };
}
