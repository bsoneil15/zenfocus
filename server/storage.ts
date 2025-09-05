import { type User, type InsertUser, type Soundscape, type InsertSoundscape, type PomodoroSession, type InsertPomodoroSession } from "@shared/schema";
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private soundscapes: Map<string, Soundscape>;
  private pomodoroSessions: Map<string, PomodoroSession>;

  constructor() {
    this.users = new Map();
    this.soundscapes = new Map();
    this.pomodoroSessions = new Map();
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
}

export const storage = new MemStorage();
