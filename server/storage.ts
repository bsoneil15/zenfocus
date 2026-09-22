import { type Soundscape, type InsertSoundscape, type PomodoroSession, type InsertPomodoroSession, soundscapes, pomodoroSessions, dailyUsage } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { db } from "./db";
import { eq, and, desc, lt, sql, inArray, isNull } from "drizzle-orm";
import {
  ObjectStorageService,
  objectStorageClient,
  setObjectAclPolicy,
} from "./replit_integrations/object_storage";

export interface IStorage {
  getSoundscape(id: string): Promise<Soundscape | undefined>;
  getSoundscapes(): Promise<Soundscape[]>; // public rows only (list endpoint)
  getSoundscapesByOwner(ownerId: string): Promise<Soundscape[]>;
  createSoundscape(soundscape: InsertSoundscape): Promise<Soundscape>;
  deleteSoundscapeForOwner(id: string, ownerId: string): Promise<Soundscape | undefined>;
  // Returns the subset of `ids` that are *adoptable* — rows that exist,
  // are private, and currently have no owner. Used by the adopt route to
  // pre-flight which audio objects need an ACL rewrite *before* we claim
  // them in the DB, so a failed ACL update can't leave the user with a
  // claimed-but-unreadable soundscape.
  getOrphanSoundscapesByIds(ids: string[]): Promise<Soundscape[]>;
  // Adopts ownership of any private, currently-orphan soundscapes whose IDs
  // appear in the given list. Used by the guest -> signed-in handoff so a
  // user's locally-tracked soundscapes carry over into their account
  // instead of being silently abandoned. Returns only the rows that were
  // actually updated (i.e. existed, were ownerless, and were not public).
  claimOrphanSoundscapesForOwner(ids: string[], ownerId: string): Promise<Soundscape[]>;
  
  getPomodoroSession(id: string): Promise<PomodoroSession | undefined>;
  getPomodoroSessions(): Promise<PomodoroSession[]>;
  createPomodoroSession(session: InsertPomodoroSession): Promise<PomodoroSession>;

  getDailyUsageCount(key: string, date: string): Promise<number>;
  incrementDailyUsageCount(key: string, date: string): Promise<number>;
  decrementDailyUsageCount(key: string, date: string): Promise<number>;
  cleanupStaleDailyUsage(currentDate: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private soundscapes: Map<string, Soundscape>;
  private pomodoroSessions: Map<string, PomodoroSession>;
  private dailyUsage: Map<string, { date: string; count: number }>;

  constructor() {
    this.soundscapes = new Map();
    this.pomodoroSessions = new Map();
    this.dailyUsage = new Map();
    
    this.initializeDefaultSoundscapes();
  }

  private initializeDefaultSoundscapes() {
    const cityPark: Soundscape = {
      id: "city-park",
      name: "City park",
      prompt: "Peaceful city park with birds chirping and gentle breeze",
      audioUrl: "/objects/soundscape-presets/city-park.mp3",
      duration: 30,
      isPublic: true,
      ownerId: null,
      createdAt: new Date()
    };
    
    const distantThunder: Soundscape = {
      id: "distant-thunder",
      name: "Distant thunder",
      prompt: "Distant thunderstorm with gentle rain and rolling thunder",
      audioUrl: "/objects/soundscape-presets/distant-thunder.mp3",
      duration: 30,
      isPublic: true,
      ownerId: null,
      createdAt: new Date()
    };
    
    const jazzBar: Soundscape = {
      id: "jazz-bar",
      name: "Jazz bar",
      prompt: "Cozy jazz bar atmosphere with smooth background music",
      audioUrl: "/objects/soundscape-presets/jazz-bar.mp3",
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
    return Array.from(this.soundscapes.values()).filter((s) => s.isPublic);
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

  async deleteSoundscapeForOwner(id: string, ownerId: string): Promise<Soundscape | undefined> {
    const existing = this.soundscapes.get(id);
    if (!existing || existing.ownerId !== ownerId) return undefined;
    this.soundscapes.delete(id);
    return existing;
  }

  async getOrphanSoundscapesByIds(ids: string[]): Promise<Soundscape[]> {
    if (ids.length === 0) return [];
    const wanted = new Set(ids);
    return Array.from(this.soundscapes.values()).filter(
      (s) => wanted.has(s.id) && !s.isPublic && s.ownerId === null,
    );
  }

  async claimOrphanSoundscapesForOwner(ids: string[], ownerId: string): Promise<Soundscape[]> {
    if (ids.length === 0) return [];
    const claimed: Soundscape[] = [];
    for (const id of ids) {
      const existing = this.soundscapes.get(id);
      if (!existing) continue;
      if (existing.isPublic) continue;
      if (existing.ownerId !== null) continue;
      const updated: Soundscape = { ...existing, ownerId };
      this.soundscapes.set(id, updated);
      claimed.push(updated);
    }
    return claimed;
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

  async getDailyUsageCount(key: string, date: string): Promise<number> {
    const entry = this.dailyUsage.get(key);
    if (!entry || entry.date !== date) return 0;
    return entry.count;
  }

  async incrementDailyUsageCount(key: string, date: string): Promise<number> {
    const entry = this.dailyUsage.get(key);
    const next = !entry || entry.date !== date ? { date, count: 1 } : { date, count: entry.count + 1 };
    this.dailyUsage.set(key, next);
    return next.count;
  }

  async decrementDailyUsageCount(key: string, date: string): Promise<number> {
    const entry = this.dailyUsage.get(key);
    if (!entry || entry.date !== date) return 0;
    const next = { date, count: Math.max(0, entry.count - 1) };
    this.dailyUsage.set(key, next);
    return next.count;
  }

  async cleanupStaleDailyUsage(currentDate: string): Promise<void> {
    const stale: string[] = [];
    this.dailyUsage.forEach((entry, key) => {
      if (entry.date !== currentDate) stale.push(key);
    });
    stale.forEach((key) => this.dailyUsage.delete(key));
  }
}

export class DatabaseStorage implements IStorage {
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize() {
    await this.ensureInitialized();
  }

  // Idempotent, concurrency-safe initialization. The in-flight promise is
  // memoized so that if the server starts serving before init completes,
  // concurrent callers (e.g. the eager background kick-off in index.ts plus
  // the first /objects request) all await the SAME initialization run rather
  // than triggering duplicate, racing ACL reconciliations.
  private ensureInitialized(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await this.initializeDefaultData();
        // Security-critical: await ACL reconciliation so that no request can
        // reach /objects/... with stale public ACLs on private soundscapes.
        // The /objects/* route gates on this same promise, so deferring the
        // run to the background (after the server is listening) does not open
        // an access window.
        await this.reconcileObjectStorageAcls();
        // Mark initialized only after security-critical reconciliation
        // succeeds, so a failure does not silently skip reconciliation.
        this.initialized = true;
        // Fire-and-forget: migrate any legacy /api/audio/* rows whose files
        // still exist on disk into durable object storage. Not
        // security-critical (those paths are already gated elsewhere), so we
        // don't block on it.
        this.migrateLegacyAudioToObjectStorage().catch((err) => {
          console.error("Legacy audio migration failed:", err);
        });
      } catch (error) {
        console.error("Failed to initialize database storage:", error);
        // Reset so a later call can retry (fail-closed but recoverable).
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  // Backfill: previously generated MP3s were written to attached_assets/
  // and referenced as /api/audio/<filename> or /audio/<filename>. The
  // attached_assets/ directory is wiped on container rebuild, so any rows
  // still pointing there will break after a redeploy. Move the files that
  // are still present into object storage and rewrite the URLs.
  private async migrateLegacyAudioToObjectStorage() {
    const rows = await db.select().from(soundscapes);
    const legacy = rows.filter((s) =>
      /^\/(api\/)?audio\/.+\.mp3$/i.test(s.audioUrl)
    );
    if (legacy.length === 0) return;

    const assetsDir = path.resolve(import.meta.dirname, "..", "attached_assets");
    const objectStorage = new ObjectStorageService();
    let privateDir: string;
    try {
      privateDir = objectStorage.getPrivateObjectDir();
    } catch (err) {
      console.warn(
        "Skipping legacy audio migration: object storage not configured.",
        err
      );
      return;
    }
    if (!privateDir.endsWith("/")) privateDir = `${privateDir}/`;

    let migrated = 0;
    let removed = 0;
    for (const row of legacy) {
      const filename = row.audioUrl.replace(/^\/(api\/)?audio\//i, "");
      const localPath = path.join(assetsDir, filename);
      if (!localPath.startsWith(assetsDir)) {
        console.warn("Skipping suspicious legacy audio path:", row.audioUrl);
        continue;
      }
      if (!fs.existsSync(localPath)) {
        // The source file was wiped from attached_assets/ on a container
        // rebuild and the legacy /api/audio/* endpoint now returns 410 Gone,
        // so this soundscape can never play again. Remove the dangling row
        // so it stops being presented to users as a working soundscape.
        try {
          await db.delete(soundscapes).where(eq(soundscapes.id, row.id));
          removed++;
        } catch (delErr) {
          console.error(
            `Failed to remove dangling legacy soundscape ${row.id} (${row.audioUrl}):`,
            delErr
          );
        }
        continue;
      }
      try {
        const buf = fs.readFileSync(localPath);
        const fullPath = `${privateDir}soundscapes/${filename}`;
        const stripped = fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
        const slash = stripped.indexOf("/");
        const bucketName = stripped.slice(0, slash);
        const objectName = stripped.slice(slash + 1);
        const file = objectStorageClient.bucket(bucketName).file(objectName);
        const [exists] = await file.exists();
        if (!exists) {
          await file.save(buf, {
            contentType: "audio/mpeg",
            resumable: false,
          });
        }
        await setObjectAclPolicy(file, {
          owner: row.ownerId ?? "system",
          visibility: row.isPublic ? "public" : "private",
        });
        const newUrl = `/objects/soundscapes/${filename}`;
        await db
          .update(soundscapes)
          .set({ audioUrl: newUrl })
          .where(eq(soundscapes.id, row.id));
        // Remove the source file so the unauthenticated attached_assets
        // directory can no longer serve it, closing the ACL bypass window.
        try {
          fs.unlinkSync(localPath);
        } catch (unlinkErr) {
          console.warn(
            `Could not delete legacy audio file after migration (${localPath}):`,
            unlinkErr
          );
        }
        migrated++;
      } catch (err) {
        console.error(
          `Failed to migrate legacy audio for soundscape ${row.id} (${row.audioUrl}):`,
          err
        );
      }
    }
    console.log(
      `Legacy audio migration complete: migrated=${migrated}, removed=${removed}, total=${legacy.length}`
    );
  }

  // Backfill: soundscapes previously generated with the incorrect
  // visibility: "public" ACL (even when isPublic is false) are corrected
  // here. This runs once at startup so that pre-patch private audio is no
  // longer anonymously accessible via the /objects/... URL.
  private async reconcileObjectStorageAcls() {
    const rows = await db.select().from(soundscapes);
    const objectRows = rows.filter((s) =>
      s.audioUrl.startsWith("/objects/")
    );
    if (objectRows.length === 0) return;

    const objectStorage = new ObjectStorageService();
    let privateDir: string;
    try {
      privateDir = objectStorage.getPrivateObjectDir();
    } catch (err) {
      console.warn(
        "Skipping object ACL reconciliation: object storage not configured.",
        err
      );
      return;
    }
    if (!privateDir.endsWith("/")) privateDir = `${privateDir}/`;

    let fixed = 0;
    let skipped = 0;
    for (const row of objectRows) {
      try {
        // Resolve the /objects/<entityId> path to the underlying GCS file
        // using the same logic as ObjectStorageService.getObjectEntityFile.
        const entityId = row.audioUrl.slice("/objects/".length);
        const fullPath = `${privateDir}${entityId}`;
        const stripped = fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
        const slash = stripped.indexOf("/");
        const bucketName = stripped.slice(0, slash);
        const objectName = stripped.slice(slash + 1);
        const file = objectStorageClient.bucket(bucketName).file(objectName);
        const [exists] = await file.exists();
        if (!exists) {
          skipped++;
          continue;
        }
        await setObjectAclPolicy(file, {
          owner: row.ownerId ?? "system",
          visibility: row.isPublic ? "public" : "private",
        });
        fixed++;
      } catch (err) {
        console.error(
          `Failed to reconcile ACL for soundscape ${row.id} (${row.audioUrl}):`,
          err
        );
      }
    }
    console.log(
      `Object storage ACL reconciliation complete: fixed=${fixed}, skipped=${skipped}, total=${objectRows.length}`
    );
  }

  private async initializeDefaultData() {
    try {
      // Use onConflictDoUpdate so that any existing rows still carrying the
      // legacy "@assets/..." URL get corrected to the durable /objects/ path.
      const bonusDefaults = [
        {
          id: "city-park",
          name: "City park",
          prompt: "Peaceful city park with birds chirping and gentle breeze",
          audioUrl: "/objects/soundscape-presets/city-park.mp3",
          duration: 30,
          isPublic: true,
        },
        {
          id: "distant-thunder",
          name: "Distant thunder",
          prompt: "Distant thunderstorm with gentle rain and rolling thunder",
          audioUrl: "/objects/soundscape-presets/distant-thunder.mp3",
          duration: 30,
          isPublic: true,
        },
        {
          id: "jazz-bar",
          name: "Jazz bar",
          prompt: "Cozy jazz bar atmosphere with smooth background music",
          audioUrl: "/objects/soundscape-presets/jazz-bar.mp3",
          duration: 30,
          isPublic: true,
        },
      ];

      for (const row of bonusDefaults) {
        await db
          .insert(soundscapes)
          .values(row)
          .onConflictDoUpdate({
            target: soundscapes.id,
            set: { audioUrl: row.audioUrl },
          });
      }

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
    // Public list endpoint only needs public rows — avoid loading every
    // private prompt/audio URL into memory on each anonymous request.
    return await db
      .select()
      .from(soundscapes)
      .where(eq(soundscapes.isPublic, true));
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

  async deleteSoundscapeForOwner(id: string, ownerId: string): Promise<Soundscape | undefined> {
    await this.ensureInitialized();
    const [deleted] = await db
      .delete(soundscapes)
      .where(and(eq(soundscapes.id, id), eq(soundscapes.ownerId, ownerId)))
      .returning();
    return deleted || undefined;
  }

  async getOrphanSoundscapesByIds(ids: string[]): Promise<Soundscape[]> {
    if (ids.length === 0) return [];
    await this.ensureInitialized();
    return await db
      .select()
      .from(soundscapes)
      .where(
        and(
          inArray(soundscapes.id, ids),
          isNull(soundscapes.ownerId),
          eq(soundscapes.isPublic, false),
        ),
      );
  }

  async claimOrphanSoundscapesForOwner(ids: string[], ownerId: string): Promise<Soundscape[]> {
    if (ids.length === 0) return [];
    await this.ensureInitialized();
    const claimed = await db
      .update(soundscapes)
      .set({ ownerId })
      .where(
        and(
          inArray(soundscapes.id, ids),
          isNull(soundscapes.ownerId),
          eq(soundscapes.isPublic, false),
        ),
      )
      .returning();
    return claimed;
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

  async getDailyUsageCount(key: string, date: string): Promise<number> {
    const [row] = await db
      .select()
      .from(dailyUsage)
      .where(and(eq(dailyUsage.key, key), eq(dailyUsage.date, date)));
    return row?.count ?? 0;
  }

  async incrementDailyUsageCount(key: string, date: string): Promise<number> {
    const [row] = await db
      .insert(dailyUsage)
      .values({ key, date, count: 1 })
      .onConflictDoUpdate({
        target: [dailyUsage.key, dailyUsage.date],
        set: { count: sql`${dailyUsage.count} + 1` },
      })
      .returning();
    return row.count;
  }

  async decrementDailyUsageCount(key: string, date: string): Promise<number> {
    const [row] = await db
      .update(dailyUsage)
      .set({ count: sql`GREATEST(${dailyUsage.count} - 1, 0)` })
      .where(and(eq(dailyUsage.key, key), eq(dailyUsage.date, date)))
      .returning();
    return row?.count ?? 0;
  }

  async cleanupStaleDailyUsage(currentDate: string): Promise<void> {
    await db.delete(dailyUsage).where(lt(dailyUsage.date, currentDate));
  }
}

export const storage = new DatabaseStorage();
