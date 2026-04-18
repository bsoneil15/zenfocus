import { type Soundscape, type InsertSoundscape, type PomodoroSession, type InsertPomodoroSession, soundscapes, pomodoroSessions } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  getSoundscape(id: string): Promise<Soundscape | undefined>;
  getSoundscapes(): Promise<Soundscape[]>;
  getSoundscapesByOwner(ownerId: string): Promise<Soundscape[]>;
  createSoundscape(soundscape: InsertSoundscape): Promise<Soundscape>;
  
  getPomodoroSession(id: string): Promise<PomodoroSession | undefined>;
  getPomodoroSessions(): Promise<PomodoroSession[]>;
  createPomodoroSession(session: InsertPomodoroSession): Promise<PomodoroSession>;
}

export class MemStorage implements IStorage {
  private soundscapes: Map<string, Soundscape>;
  private pomodoroSessions: Map<string, PomodoroSession>;

  constructor() {
    this.soundscapes = new Map();
    this.pomodoroSessions = new Map();
    
    this.initializeDefaultSoundscapes();
  }

  private initializeDefaultSoundscapes() {
    const cityPark: Soundscape = {
      id: "city-park",
      name: "City park",
      prompt: "Peaceful city park with birds chirping and gentle breeze",
      audioUrl: "@assets/City_Park_in_Spring.-#2-1757109841851_1757110354748.mp3",
      duration: 30,
      isPublic: true,
      ownerId: null,
      createdAt: new Date()
    };
    
    const distantThunder: Soundscape = {
      id: "distant-thunder",
      name: "Distant thunder",
      prompt: "Distant thunderstorm with gentle rain and rolling thunder",
      audioUrl: "@assets/Distant_Thunderstorm-#1-1757110020986_1757110354747.mp3",
      duration: 30,
      isPublic: true,
      ownerId: null,
      createdAt: new Date()
    };
    
    const jazzBar: Soundscape = {
      id: "jazz-bar",
      name: "Jazz bar",
      prompt: "Cozy jazz bar atmosphere with smooth background music",
      audioUrl: "@assets/Old_school_Jazz_Bar_-#2-1757110326316_1757110354746.mp3",
      duration: 30,
      isPublic: true,
      ownerId: null,
      createdAt: new Date()
    };
    
    this.soundscapes.set(cityPark.id, cityPark);
    this.soundscapes.set(distantThunder.id, distantThunder);
    this.soundscapes.set(jazzBar.id, jazzBar);
  }

  async getSoundscape(id: string): Promise<Soundscape | undefined> {
    return this.soundscapes.get(id);
  }

  async getSoundscapes(): Promise<Soundscape[]> {
    return Array.from(this.soundscapes.values());
  }

  async getSoundscapesByOwner(ownerId: string): Promise<Soundscape[]> {
    return Array.from(this.soundscapes.values()).filter(s => s.ownerId === ownerId);
  }

  async createSoundscape(insertSoundscape: InsertSoundscape): Promise<Soundscape> {
    const id = randomUUID();
    const soundscape: Soundscape = { 
      ...insertSoundscape, 
      id,
      duration: insertSoundscape.duration ?? 30,
      isPublic: insertSoundscape.isPublic ?? false,
      ownerId: insertSoundscape.ownerId ?? null,
      createdAt: new Date() 
    };
    this.soundscapes.set(id, soundscape);
    return soundscape;
  }

  async getPomodoroSession(id: string): Promise<PomodoroSession | undefined> {
    return this.pomodoroSessions.get(id);
  }

  async getPomodoroSessions(): Promise<PomodoroSession[]> {
    return Array.from(this.pomodoroSessions.values());
  }

  async createPomodoroSession(insertSession: InsertPomodoroSession): Promise<PomodoroSession> {
    const id = randomUUID();
    const session: PomodoroSession = { 
      ...insertSession, 
      id,
      isBreak: insertSession.isBreak ?? false,
      completed: insertSession.completed ?? false,
      soundscapeId: insertSession.soundscapeId ?? null,
      createdAt: new Date() 
    };
    this.pomodoroSessions.set(id, session);
    return session;
  }
}

export class DatabaseStorage implements IStorage {
  private initialized = false;

  private async ensureInitialized() {
    if (this.initialized) return;
    
    try {
      await this.initializeDefaultData();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize database storage:", error);
      throw error;
    }
  }

  private async initializeDefaultData() {
    try {
      const existingSoundscapes = await db.select().from(soundscapes);
      if (existingSoundscapes.some(s => s.id === "city-park")) return;

      await db.insert(soundscapes).values({
        id: "city-park",
        name: "City park",
        prompt: "Peaceful city park with birds chirping and gentle breeze",
        audioUrl: "@assets/City_Park_in_Spring.-#2-1757109841851_1757110354748.mp3",
        duration: 30,
        isPublic: true,
      }).onConflictDoNothing();

      await db.insert(soundscapes).values({
        id: "distant-thunder",
        name: "Distant thunder",
        prompt: "Distant thunderstorm with gentle rain and rolling thunder",
        audioUrl: "@assets/Distant_Thunderstorm-#1-1757110020986_1757110354747.mp3",
        duration: 30,
        isPublic: true,
      }).onConflictDoNothing();

      await db.insert(soundscapes).values({
        id: "jazz-bar",
        name: "Jazz bar",
        prompt: "Cozy jazz bar atmosphere with smooth background music",
        audioUrl: "@assets/Old_school_Jazz_Bar_-#2-1757110326316_1757110354746.mp3",
        duration: 30,
        isPublic: true,
      }).onConflictDoNothing();
      
      console.log("Default soundscapes initialized");
    } catch (error) {
      console.error("Failed to initialize default data:", error);
    }
  }

  async getSoundscape(id: string): Promise<Soundscape | undefined> {
    await this.ensureInitialized();
    const [soundscape] = await db.select().from(soundscapes).where(eq(soundscapes.id, id));
    return soundscape || undefined;
  }

  async getSoundscapes(): Promise<Soundscape[]> {
    await this.ensureInitialized();
    return await db.select().from(soundscapes);
  }

  async getSoundscapesByOwner(ownerId: string): Promise<Soundscape[]> {
    await this.ensureInitialized();
    return await db
      .select()
      .from(soundscapes)
      .where(eq(soundscapes.ownerId, ownerId))
      .orderBy(desc(soundscapes.createdAt));
  }

  async createSoundscape(insertSoundscape: InsertSoundscape): Promise<Soundscape> {
    await this.ensureInitialized();
    const [soundscape] = await db
      .insert(soundscapes)
      .values(insertSoundscape)
      .returning();
    return soundscape;
  }

  async getPomodoroSession(id: string): Promise<PomodoroSession | undefined> {
    await this.ensureInitialized();
    const [session] = await db.select().from(pomodoroSessions).where(eq(pomodoroSessions.id, id));
    return session || undefined;
  }

  async getPomodoroSessions(): Promise<PomodoroSession[]> {
    await this.ensureInitialized();
    return await db.select().from(pomodoroSessions);
  }

  async createPomodoroSession(insertSession: InsertPomodoroSession): Promise<PomodoroSession> {
    await this.ensureInitialized();
    const [session] = await db
      .insert(pomodoroSessions)
      .values(insertSession)
      .returning();
    return session;
  }
}

export const storage = new DatabaseStorage();
