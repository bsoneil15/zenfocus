import { useState, useEffect, useRef, useCallback } from "react";
import { createAudioBuffer, createLoopingAudio } from "@/lib/audio-utils";
import { apiRequest } from "@/lib/queryClient";

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
  const [currentSoundscape, setCurrentSoundscape] = useState<SoundscapeType>("none");
  const [currentSoundscapeId, setCurrentSoundscapeId] = useState<string | null>(null);
  const [customSoundscapes, setCustomSoundscapes] = useState<CustomSoundscape[]>([]);
  const [bonusSoundscapes, setBonusSoundscapes] = useState<BonusSoundscape[]>([]);
  const [volume, setVolume] = useState(0.3);
  const [isPlaying, setIsPlaying] = useState(false);
  
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
    const audioData = `/api/audio/${encodeURIComponent(filename)}`;
    
    try {
      const audioBuffer = await createAudioBuffer(audioData, audioContextRef.current!);
      await playAudioBuffer(audioBuffer);
    } catch (error) {
      console.error(`Failed to load ${type} soundscape:`, error);
    }
  }, [playAudioBuffer]);

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
    }
  }, [playAudioBuffer]);

  const playBonusSoundscape = useCallback(async (soundscape: BonusSoundscape) => {
    try {
      if (!audioContextRef.current) {
        throw new Error('Audio context not initialized');
      }
      
      let audioUrl = soundscape.audioUrl;
      if (audioUrl.startsWith('@assets/')) {
        const filename = audioUrl.replace('@assets/', '');
        audioUrl = `/api/audio/${encodeURIComponent(filename)}`;
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
    } else if (type === "bonus" && customId) {
      const bonusSoundscape = bonusSoundscapes.find(s => s.id === customId);
      if (bonusSoundscape) {
        await playBonusSoundscape(bonusSoundscape);
      }
    }
  }, [stopCurrentAudio, playPredefinedSoundscape, playCustomSoundscape, playBonusSoundscape, customSoundscapes, bonusSoundscapes]);

  const addCustomSoundscape = useCallback((soundscape: CustomSoundscape) => {
    setCustomSoundscapes(prev => {
      const updated = [...prev, soundscape];
      try {
        localStorage.setItem("custom-soundscapes", JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save custom soundscapes to localStorage:", error);
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("custom-soundscapes");
      if (saved) {
        const parsed = JSON.parse(saved);
        setCustomSoundscapes(parsed);
      }
    } catch (error) {
      console.error("Failed to load custom soundscapes from localStorage:", error);
    }
  }, []);

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
    volume,
    isPlaying,
    setVolume,
    setSoundscape,
    addCustomSoundscape,
    playNotificationSound,
    stopCurrentAudio,
  };
}
