import { type User, type InsertUser, type Soundscape, type InsertSoundscape, type PomodoroSession, type InsertPomodoroSession, type NewsletterSubscriber, type InsertNewsletterSubscriber, type SoundscapePack, type InsertSoundscapePack, users, soundscapes, pomodoroSessions, newsletterSubscribers, soundscapePacks } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getSoundscape(id: string): Promise<Soundscape | undefined>;
  getSoundscapes(): Promise<Soundscape[]>;
  createSoundscape(soundscape: InsertSoundscape): Promise<Soundscape>;
  
  getPomodoroSession(id: string): Promise<PomodoroSession | undefined>;
  getPomodoroSessions(): Promise<PomodoroSession[]>;
  createPomodoroSession(session: InsertPomodoroSession): Promise<PomodoroSession>;

  getNewsletterSubscriber(email: string): Promise<NewsletterSubscriber | undefined>;
  createNewsletterSubscriber(subscriber: InsertNewsletterSubscriber): Promise<NewsletterSubscriber>;
  
  getSoundscapePacks(): Promise<SoundscapePack[]>;
  getSoundscapePack(id: string): Promise<SoundscapePack | undefined>;
  createSoundscapePack(pack: InsertSoundscapePack): Promise<SoundscapePack>;
  updateSoundscapePackUnlocked(id: string, isUnlocked: boolean): Promise<SoundscapePack | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private soundscapes: Map<string, Soundscape>;
  private pomodoroSessions: Map<string, PomodoroSession>;
  private newsletterSubscribers: Map<string, NewsletterSubscriber>;
  private soundscapePacks: Map<string, SoundscapePack>;

  constructor() {
    this.users = new Map();
    this.soundscapes = new Map();
    this.pomodoroSessions = new Map();
    this.newsletterSubscribers = new Map();
    this.soundscapePacks = new Map();
    
    // Initialize with some default soundscape packs
    this.initializeDefaultPacks();
  }

  private initializeDefaultPacks() {
    // Create the individual soundscapes for Pack 1
    const cityPark: Soundscape = {
      id: "city-park",
      name: "City park",
      prompt: "Peaceful city park with birds chirping and gentle breeze",
      audioUrl: "@assets/City_Park_in_Spring.-#2-1757109841851_1757110354748.mp3",
      duration: 30,
      isPublic: true,
      createdAt: new Date()
    };
    
    const distantThunder: Soundscape = {
      id: "distant-thunder",
      name: "Distant thunder",
      prompt: "Distant thunderstorm with gentle rain and rolling thunder",
      audioUrl: "@assets/Distant_Thunderstorm-#1-1757110020986_1757110354747.mp3",
      duration: 30,
      isPublic: true,
      createdAt: new Date()
    };
    
    const jazzBar: Soundscape = {
      id: "jazz-bar",
      name: "Jazz bar",
      prompt: "Cozy jazz bar atmosphere with smooth background music",
      audioUrl: "@assets/Old_school_Jazz_Bar_-#2-1757110326316_1757110354746.mp3",
      duration: 30,
      isPublic: true,
      createdAt: new Date()
    };
    
    // Store the soundscapes
    this.soundscapes.set(cityPark.id, cityPark);
    this.soundscapes.set(distantThunder.id, distantThunder);
    this.soundscapes.set(jazzBar.id, jazzBar);
    
    const pack1: SoundscapePack = {
      id: "pack-1",
      name: "Pack 1",
      description: "Premium soundscape collection featuring city park, distant thunder, and jazz bar ambience",
      isUnlocked: false, // Start locked, unlock after email submission
      unlockedBy: "newsletter",
      soundscapeIds: ["city-park", "distant-thunder", "jazz-bar"],
      createdAt: new Date()
    };
    
    const pack2: SoundscapePack = {
      id: "pack-2", 
      name: "Pack 2",
      description: "Coming Soon - Exciting new soundscapes in development",
      isUnlocked: false,
      unlockedBy: "coming-soon", 
      soundscapeIds: [],
      createdAt: new Date()
    };
    
    this.soundscapePacks.set(pack1.id, pack1);
    this.soundscapePacks.set(pack2.id, pack2);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getSoundscape(id: string): Promise<Soundscape | undefined> {
    return this.soundscapes.get(id);
  }

  async getSoundscapes(): Promise<Soundscape[]> {
    return Array.from(this.soundscapes.values());
  }

  async createSoundscape(insertSoundscape: InsertSoundscape): Promise<Soundscape> {
    const id = randomUUID();
    const soundscape: Soundscape = { 
      ...insertSoundscape, 
      id,
      duration: insertSoundscape.duration ?? 30,
      isPublic: insertSoundscape.isPublic ?? false,
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

  async getNewsletterSubscriber(email: string): Promise<NewsletterSubscriber | undefined> {
    return Array.from(this.newsletterSubscribers.values()).find(
      (subscriber) => subscriber.email === email
    );
  }

  async createNewsletterSubscriber(insertSubscriber: InsertNewsletterSubscriber): Promise<NewsletterSubscriber> {
    const id = randomUUID();
    const subscriber: NewsletterSubscriber = {
      ...insertSubscriber,
      id,
      subscribed: insertSubscriber.subscribed ?? true,
      subscribedAt: new Date()
    };
    this.newsletterSubscribers.set(id, subscriber);
    return subscriber;
  }

  async getSoundscapePacks(): Promise<SoundscapePack[]> {
    return Array.from(this.soundscapePacks.values());
  }

  async getSoundscapePack(id: string): Promise<SoundscapePack | undefined> {
    return this.soundscapePacks.get(id);
  }

  async createSoundscapePack(insertPack: InsertSoundscapePack): Promise<SoundscapePack> {
    const id = randomUUID();
    const pack: SoundscapePack = {
      ...insertPack,
      id,
      isUnlocked: insertPack.isUnlocked ?? false,
      soundscapeIds: insertPack.soundscapeIds ?? [],
      createdAt: new Date()
    };
    this.soundscapePacks.set(id, pack);
    return pack;
  }

  async updateSoundscapePackUnlocked(id: string, isUnlocked: boolean): Promise<SoundscapePack | undefined> {
    const pack = this.soundscapePacks.get(id);
    if (pack) {
      const updatedPack = { ...pack, isUnlocked };
      this.soundscapePacks.set(id, updatedPack);
      return updatedPack;
    }
    return undefined;
  }
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Initialize default packs and soundscapes on first run
    this.initializeDefaultData();
  }

  private async initializeDefaultData() {
    try {
      // Check if we already have packs
      const existingPacks = await db.select().from(soundscapePacks);
      if (existingPacks.length > 0) return;

      // Create the individual soundscapes for Pack 1
      const [cityPark] = await db
        .insert(soundscapes)
        .values({
          id: "city-park",
          name: "City park",
          prompt: "Peaceful city park with birds chirping and gentle breeze",
          audioUrl: "@assets/City_Park_in_Spring.-#2-1757109841851_1757110354748.mp3",
          duration: 30,
          isPublic: true,
        })
        .returning();

      const [distantThunder] = await db
        .insert(soundscapes)
        .values({
          id: "distant-thunder",
          name: "Distant thunder",
          prompt: "Distant thunderstorm with gentle rain and rolling thunder",
          audioUrl: "@assets/Distant_Thunderstorm-#1-1757110020986_1757110354747.mp3",
          duration: 30,
          isPublic: true,
        })
        .returning();

      const [jazzBar] = await db
        .insert(soundscapes)
        .values({
          id: "jazz-bar",
          name: "Jazz bar",
          prompt: "Cozy jazz bar atmosphere with smooth background music",
          audioUrl: "@assets/Old_school_Jazz_Bar_-#2-1757110326316_1757110354746.mp3",
          duration: 30,
          isPublic: true,
        })
        .returning();

      // Create Pack 1
      await db.insert(soundscapePacks).values({
        id: "pack-1",
        name: "Pack 1",
        description: "Premium soundscape collection featuring city park, distant thunder, and jazz bar ambience",
        isUnlocked: false,
        unlockedBy: "newsletter",
        soundscapeIds: ["city-park", "distant-thunder", "jazz-bar"],
      });

      // Create Pack 2
      await db.insert(soundscapePacks).values({
        id: "pack-2",
        name: "Pack 2",
        description: "Coming Soon - Exciting new soundscapes in development",
        isUnlocked: false,
        unlockedBy: "coming-soon",
        soundscapeIds: [],
      });
      
      console.log("✓ Default soundscapes and packs initialized");
    } catch (error) {
      console.error("Failed to initialize default data:", error);
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getSoundscape(id: string): Promise<Soundscape | undefined> {
    const [soundscape] = await db.select().from(soundscapes).where(eq(soundscapes.id, id));
    return soundscape || undefined;
  }

  async getSoundscapes(): Promise<Soundscape[]> {
    return await db.select().from(soundscapes);
  }

  async createSoundscape(insertSoundscape: InsertSoundscape): Promise<Soundscape> {
    const [soundscape] = await db
      .insert(soundscapes)
      .values(insertSoundscape)
      .returning();
    return soundscape;
  }

  async getPomodoroSession(id: string): Promise<PomodoroSession | undefined> {
    const [session] = await db.select().from(pomodoroSessions).where(eq(pomodoroSessions.id, id));
    return session || undefined;
  }

  async getPomodoroSessions(): Promise<PomodoroSession[]> {
    return await db.select().from(pomodoroSessions);
  }

  async createPomodoroSession(insertSession: InsertPomodoroSession): Promise<PomodoroSession> {
    const [session] = await db
      .insert(pomodoroSessions)
      .values(insertSession)
      .returning();
    return session;
  }

  async getNewsletterSubscriber(email: string): Promise<NewsletterSubscriber | undefined> {
    const [subscriber] = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email));
    return subscriber || undefined;
  }

  async createNewsletterSubscriber(insertSubscriber: InsertNewsletterSubscriber): Promise<NewsletterSubscriber> {
    const [subscriber] = await db
      .insert(newsletterSubscribers)
      .values(insertSubscriber)
      .returning();
    return subscriber;
  }

  async getSoundscapePacks(): Promise<SoundscapePack[]> {
    return await db.select().from(soundscapePacks);
  }

  async getSoundscapePack(id: string): Promise<SoundscapePack | undefined> {
    const [pack] = await db.select().from(soundscapePacks).where(eq(soundscapePacks.id, id));
    return pack || undefined;
  }

  async createSoundscapePack(insertPack: InsertSoundscapePack): Promise<SoundscapePack> {
    const [pack] = await db
      .insert(soundscapePacks)
      .values(insertPack)
      .returning();
    return pack;
  }

  async updateSoundscapePackUnlocked(id: string, isUnlocked: boolean): Promise<SoundscapePack | undefined> {
    const [pack] = await db
      .update(soundscapePacks)
      .set({ isUnlocked })
      .where(eq(soundscapePacks.id, id))
      .returning();
    return pack || undefined;
  }
}

export const storage = new DatabaseStorage();
