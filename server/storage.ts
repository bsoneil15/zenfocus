import { type User, type InsertUser, type Soundscape, type InsertSoundscape, type PomodoroSession, type InsertPomodoroSession, type NewsletterSubscriber, type InsertNewsletterSubscriber, type SoundscapePack, type InsertSoundscapePack } from "@shared/schema";
import { randomUUID } from "crypto";

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
    const pack1: SoundscapePack = {
      id: "nature-pack",
      name: "Nature Sounds Pack",
      description: "Peaceful forest, ocean waves, and mountain breeze soundscapes",
      isUnlocked: false,
      unlockedBy: "newsletter",
      soundscapeIds: [],
      createdAt: new Date()
    };
    
    const pack2: SoundscapePack = {
      id: "urban-pack", 
      name: "Urban Ambience Pack",
      description: "Coffee shops, libraries, and cozy indoor environments",
      isUnlocked: false,
      unlockedBy: "newsletter", 
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

export const storage = new MemStorage();
