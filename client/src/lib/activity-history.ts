export type DayStats = {
  sessions: number;
  minutes: number;
  breaks: number;
};

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export type DayActivity = DayStats & {
  date: Date;
  dateKey: string;
  level: ActivityLevel;
};

const STATS_PREFIX = "pomodoro-stats-";

/** Intensity from focus minutes / sessions — darker = more usage. */
export function getActivityLevel(minutes: number, sessions: number): ActivityLevel {
  if (minutes <= 0 && sessions <= 0) return 0;
  if (minutes < 25) return 1;
  if (minutes < 50) return 2;
  if (minutes < 100) return 3;
  return 4;
}

export function dateKeyFromDate(date: Date): string {
  return date.toDateString();
}

export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDayStats(raw: string | null): DayStats {
  if (!raw) return { sessions: 0, minutes: 0, breaks: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<DayStats>;
    return {
      sessions: Number(parsed.sessions) || 0,
      minutes: Number(parsed.minutes) || 0,
      breaks: Number(parsed.breaks) || 0,
    };
  } catch {
    return { sessions: 0, minutes: 0, breaks: 0 };
  }
}

export function loadDayStats(dateKey: string): DayStats {
  try {
    return parseDayStats(localStorage.getItem(`${STATS_PREFIX}${dateKey}`));
  } catch {
    return { sessions: 0, minutes: 0, breaks: 0 };
  }
}

/**
 * Build a contiguous day range ending today (inclusive).
 * Pads the start so the first column begins on Sunday (GitHub-style).
 */
export function loadActivityHistory(
  weeks = 26,
  todayOverride?: DayStats,
): DayActivity[] {
  const today = startOfLocalDay(new Date());
  const todayKey = dateKeyFromDate(today);

  // Leftmost column starts on Sunday; grid ends on the week containing today
  const days: DayActivity[] = [];
  const firstSunday = new Date(today);
  firstSunday.setDate(today.getDate() - today.getDay() - (weeks - 1) * 7);

  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(firstSunday);
    date.setDate(firstSunday.getDate() + i);
    const dateKey = dateKeyFromDate(date);
    const isFuture = date > today;
    const stats =
      isFuture
        ? { sessions: 0, minutes: 0, breaks: 0 }
        : dateKey === todayKey && todayOverride
          ? todayOverride
          : loadDayStats(dateKey);

    days.push({
      date,
      dateKey,
      ...stats,
      level: isFuture ? 0 : getActivityLevel(stats.minutes, stats.sessions),
    });
  }

  return days;
}

export function groupIntoWeeks(days: DayActivity[]): DayActivity[][] {
  const weeks: DayActivity[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export function monthLabelsForWeeks(weeks: DayActivity[][]): { weekIndex: number; label: string }[] {
  const labels: { weekIndex: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const mid = week[3] ?? week[0];
    if (!mid) return;
    const month = mid.date.getMonth();
    if (month !== lastMonth) {
      labels.push({
        weekIndex,
        label: mid.date.toLocaleString(undefined, { month: "short" }),
      });
      lastMonth = month;
    }
  });
  return labels;
}

export function formatActivityTooltip(day: DayActivity): string {
  const label = day.date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (day.sessions === 0 && day.minutes === 0) {
    return `No focus activity on ${label}`;
  }
  const sessionLabel = day.sessions === 1 ? "1 session" : `${day.sessions} sessions`;
  return `${sessionLabel} · ${day.minutes} min on ${label}`;
}
