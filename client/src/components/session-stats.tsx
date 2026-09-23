import { Card, CardContent } from "@/components/ui/card";
import { ActivityHeatmap } from "@/components/activity-heatmap";

interface SessionStatsProps {
  sessionsToday: number;
  minutesToday: number;
  breaksToday: number;
  isAuthenticated?: boolean;
  userName?: string | null;
}

export function SessionStats({
  sessionsToday,
  minutesToday,
  breaksToday,
  isAuthenticated = false,
  userName,
}: SessionStatsProps) {
  return (
    <Card className="mt-8 w-full max-w-md shadow-sm" data-testid="session-stats">
      <CardContent className="p-6">
        <h3 className="text-sm font-medium text-foreground mb-4">Today's Progress</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary mb-1" data-testid="stats-sessions">
              {sessionsToday}
            </div>
            <div className="text-xs text-muted-foreground">Sessions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary mb-1" data-testid="stats-minutes">
              {minutesToday}
            </div>
            <div className="text-xs text-muted-foreground">Minutes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary mb-1" data-testid="stats-breaks">
              {breaksToday}
            </div>
            <div className="text-xs text-muted-foreground">Breaks</div>
          </div>
        </div>

        {isAuthenticated && (
          <ActivityHeatmap
            todayStats={{
              sessions: sessionsToday,
              minutes: minutesToday,
              breaks: breaksToday,
            }}
            userName={userName}
          />
        )}
      </CardContent>
    </Card>
  );
}
