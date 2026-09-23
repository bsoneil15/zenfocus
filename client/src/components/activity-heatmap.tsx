import { useMemo, useRef, useCallback } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type ActivityLevel,
  type DayActivity,
  type DayStats,
  formatActivityTooltip,
  groupIntoWeeks,
  loadActivityHistory,
  monthLabelsForWeeks,
} from "@/lib/activity-history";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const WEEKS = 26;

/** Mint scale aligned with app `--primary` (hue ~165). Darker = more usage. */
const LEVEL_CLASSES: Record<ActivityLevel, string> = {
  0: "bg-muted",
  1: "bg-[hsl(165_28%_78%)] dark:bg-[hsl(165_28%_28%)]",
  2: "bg-[hsl(165_30%_62%)] dark:bg-[hsl(165_32%_40%)]",
  3: "bg-[hsl(165_34%_48%)] dark:bg-[hsl(165_36%_52%)]",
  4: "bg-[hsl(165_40%_34%)] dark:bg-[hsl(165_42%_68%)]",
};

const LEVEL_COLORS_LIGHT: Record<ActivityLevel, string> = {
  0: "#dce0d4",
  1: "#b8ddd2",
  2: "#7dbba8",
  3: "#519e89",
  4: "#347a66",
};

const LEVEL_COLORS_DARK: Record<ActivityLevel, string> = {
  0: "#2a2e35",
  1: "#2f4f47",
  2: "#3f7a6a",
  3: "#5aa892",
  4: "#8fd4c0",
};

interface ActivityHeatmapProps {
  todayStats: DayStats;
  userName?: string | null;
}

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains("dark");
}

function readCssColor(varName: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return value || fallback;
}

export function ActivityHeatmap({ todayStats, userName }: ActivityHeatmapProps) {
  const { toast } = useToast();
  const gridRef = useRef<HTMLDivElement>(null);

  const days = useMemo(
    () => loadActivityHistory(WEEKS, todayStats),
    [todayStats],
  );
  const weeks = useMemo(() => groupIntoWeeks(days), [days]);
  const monthLabels = useMemo(() => monthLabelsForWeeks(weeks), [weeks]);

  const totalSessions = useMemo(
    () => days.reduce((sum, d) => sum + d.sessions, 0),
    [days],
  );
  const totalMinutes = useMemo(
    () => days.reduce((sum, d) => sum + d.minutes, 0),
    [days],
  );

  const downloadPng = useCallback(async () => {
    try {
      const dark = isDarkTheme();
      const levelColors = dark ? LEVEL_COLORS_DARK : LEVEL_COLORS_LIGHT;
      const bg = dark ? "#1a1d23" : "#f2f3eb";
      const fg = dark ? "#e8eaed" : "#151515";
      const muted = dark ? "#8b919a" : "#686a63";
      const primary = readCssColor("--primary", dark ? "hsl(165, 35%, 70%)" : "hsl(165.65, 26.44%, 65.88%)");

      const cell = 12;
      const gap = 3;
      const pad = 32;
      const headerH = 72;
      const footerH = 48;
      const labelW = 28;
      const monthH = 18;
      const cols = weeks.length;
      const rows = 7;

      const gridW = cols * cell + (cols - 1) * gap;
      const gridH = rows * cell + (rows - 1) * gap;
      const width = pad * 2 + labelW + gridW;
      const height = pad + headerH + monthH + gridH + footerH + pad;

      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.scale(scale, scale);

      // Background
      ctx.fillStyle = bg;
      roundRect(ctx, 0, 0, width, height, 16);
      ctx.fill();

      // Brand mark
      ctx.fillStyle = primary.startsWith("hsl") ? LEVEL_COLORS_LIGHT[3] : primary;
      roundRect(ctx, pad, pad, 28, 28, 8);
      ctx.fill();

      ctx.fillStyle = fg;
      ctx.font = "600 18px Inter, system-ui, sans-serif";
      ctx.fillText("Focus Flow", pad + 40, pad + 20);

      ctx.fillStyle = muted;
      ctx.font = "400 12px Inter, system-ui, sans-serif";
      const subtitle = userName
        ? `${userName}'s focus activity · last ${WEEKS} weeks`
        : `Focus activity · last ${WEEKS} weeks`;
      ctx.fillText(subtitle, pad + 40, pad + 38);

      ctx.fillStyle = fg;
      ctx.font = "600 13px Inter, system-ui, sans-serif";
      ctx.fillText(
        `${totalSessions} sessions · ${totalMinutes} min`,
        pad,
        pad + 64,
      );

      const gridX = pad + labelW;
      const gridY = pad + headerH + monthH;

      // Month labels
      ctx.fillStyle = muted;
      ctx.font = "500 10px Inter, system-ui, sans-serif";
      for (const { weekIndex, label } of monthLabels) {
        const x = gridX + weekIndex * (cell + gap);
        ctx.fillText(label, x, gridY - 6);
      }

      // Weekday labels
      const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];
      ctx.textAlign = "right";
      dayLabels.forEach((label, i) => {
        if (!label) return;
        ctx.fillText(
          label,
          gridX - 6,
          gridY + i * (cell + gap) + cell - 2,
        );
      });
      ctx.textAlign = "left";

      // Cells
      weeks.forEach((week, wi) => {
        week.forEach((day, di) => {
          const x = gridX + wi * (cell + gap);
          const y = gridY + di * (cell + gap);
          ctx.globalAlpha = day.date > startOfToday() ? 0.25 : 1;
          ctx.fillStyle = levelColors[day.level];
          roundRect(ctx, x, y, cell, cell, 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      });

      // Legend
      const legendY = gridY + gridH + 22;
      ctx.fillStyle = muted;
      ctx.font = "400 11px Inter, system-ui, sans-serif";
      ctx.fillText("Less", pad, legendY + 10);
      let lx = pad + 32;
      ([0, 1, 2, 3, 4] as ActivityLevel[]).forEach((level) => {
        ctx.fillStyle = levelColors[level];
        roundRect(ctx, lx, legendY, cell, cell, 2);
        ctx.fill();
        lx += cell + gap;
      });
      ctx.fillStyle = muted;
      ctx.fillText("More", lx + 4, legendY + 10);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Failed to create PNG");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `focus-flow-activity-${stamp}.png`;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after the browser has a chance to start the download
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast({
        title: "Downloaded",
        description: "Your activity grid PNG is ready to share.",
      });
    } catch (error) {
      console.error("PNG download failed:", error);
      toast({
        title: "Download failed",
        description: "Couldn't create the PNG. Try again.",
        variant: "destructive",
      });
    }
  }, [weeks, monthLabels, totalSessions, totalMinutes, userName, toast]);

  return (
    <div className="mt-6 pt-5 border-t border-border" data-testid="activity-heatmap">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h4 className="text-sm font-medium text-foreground">Focus activity</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last {WEEKS} weeks · {totalSessions} sessions
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs shrink-0"
          onClick={() => void downloadPng()}
          data-testid="button-download-activity-png"
        >
          <Download className="h-3.5 w-3.5" />
          PNG
        </Button>
      </div>

      <div className="overflow-x-auto -mx-1 px-1 pb-1" ref={gridRef}>
        <div className="inline-block min-w-full">
          <div
            className="grid mb-1"
            style={{
              gridTemplateColumns: `14px repeat(${weeks.length}, 11px)`,
              columnGap: "3px",
            }}
          >
            <div />
            {weeks.map((_, wi) => {
              const label = monthLabels.find((m) => m.weekIndex === wi);
              return (
                <div
                  key={`m-${wi}`}
                  className="text-[9px] leading-none text-muted-foreground h-3 overflow-visible whitespace-nowrap"
                >
                  {label?.label ?? ""}
                </div>
              );
            })}
          </div>

          <div className="flex gap-[3px]">
            <div className="flex flex-col gap-[3px] w-[14px] shrink-0 text-[9px] text-muted-foreground leading-none">
              {[0, 1, 2, 3, 4, 5, 6].map((di) => (
                <div key={di} className="h-[11px] flex items-center justify-end pr-0.5">
                  {di === 1 ? "M" : di === 3 ? "W" : di === 5 ? "F" : ""}
                </div>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day) => (
                    <HeatmapCell key={day.dateKey} day={day} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-3 text-[10px] text-muted-foreground">
        <span>Less</span>
        {([0, 1, 2, 3, 4] as ActivityLevel[]).map((level) => (
          <div
            key={level}
            className={cn("w-[11px] h-[11px] rounded-[2px]", LEVEL_CLASSES[level])}
            aria-hidden
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function HeatmapCell({ day }: { day: DayActivity }) {
  const isFuture = day.date > startOfToday();

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "w-[11px] h-[11px] rounded-[2px] transition-colors",
            LEVEL_CLASSES[day.level],
            isFuture && "opacity-25",
            !isFuture && day.level > 0 && "hover:ring-1 hover:ring-ring/60",
          )}
          data-testid={`activity-cell-${day.dateKey}`}
          data-level={day.level}
          aria-label={formatActivityTooltip(day)}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {formatActivityTooltip(day)}
      </TooltipContent>
    </Tooltip>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
