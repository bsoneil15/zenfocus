interface DailyUsage {
  date: string;
  count: number;
}

const DAILY_SOUNDSCAPE_LIMIT = 3;
const STORAGE_KEY = 'daily-soundscape-usage';

export function getDailyUsage(): DailyUsage {
  const today = new Date().toDateString();
  const stored = localStorage.getItem(STORAGE_KEY);
  
  if (stored) {
    try {
      const usage: DailyUsage = JSON.parse(stored);
      // Reset count if it's a new day
      if (usage.date !== today) {
        return { date: today, count: 0 };
      }
      return usage;
    } catch (error) {
      console.error('Failed to parse daily usage:', error);
    }
  }
  
  return { date: today, count: 0 };
}

export function incrementDailyUsage(): DailyUsage {
  const usage = getDailyUsage();
  const newUsage = { ...usage, count: usage.count + 1 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newUsage));
  return newUsage;
}

export function canGenerateToday(): boolean {
  const usage = getDailyUsage();
  return usage.count < DAILY_SOUNDSCAPE_LIMIT;
}

export function getRemainingGenerations(): number {
  const usage = getDailyUsage();
  return Math.max(0, DAILY_SOUNDSCAPE_LIMIT - usage.count);
}

export function getDailyLimit(): number {
  return DAILY_SOUNDSCAPE_LIMIT;
}