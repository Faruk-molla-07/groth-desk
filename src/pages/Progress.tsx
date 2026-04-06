import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Clock, Calendar, Minus } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { format, subDays, startOfDay, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

const subjects = ["Math", "Science", "English", "History", "CS", "Art", "Music", "Other"];

const Progress = () => {
  const { user } = useAuth();
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [subject, setSubject] = useState("Other");
  const [sessions, setSessions] = useState<any[]>([]);
  const [chartRange, setChartRange] = useState<7 | 14 | 30>(7);

  const fetchSessions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false });
    if (data) setSessions(data);
  };

  useEffect(() => { fetchSessions(); }, [user]);

  const addSession = async () => {
    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes === 0) { toast.error("Add some study time!"); return; }
    if (!user) return;
    const { error } = await supabase.from("study_sessions").insert({
      user_id: user.id,
      duration_minutes: totalMinutes,
      subject,
      started_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${hours}h ${minutes}m of ${subject}`);
    setHours(0); setMinutes(0);
    fetchSessions();
  };

  const todayMinutes = useMemo(() => {
    const today = startOfDay(new Date());
    return sessions.filter(s => new Date(s.started_at) >= today).reduce((acc, s) => acc + s.duration_minutes, 0);
  }, [sessions]);

  const weekMinutes = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return sessions.filter(s => isWithinInterval(new Date(s.started_at), { start, end })).reduce((acc, s) => acc + s.duration_minutes, 0);
  }, [sessions]);

  const chartData = useMemo(() => {
    const days: { date: string; minutes: number }[] = [];
    for (let i = chartRange - 1; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const dayStr = format(day, "yyyy-MM-dd");
      const mins = sessions
        .filter(s => format(new Date(s.started_at), "yyyy-MM-dd") === dayStr)
        .reduce((acc, s) => acc + s.duration_minutes, 0);
      days.push({ date: format(day, "MMM d"), minutes: mins });
    }
    return days;
  }, [sessions, chartRange]);

  const weeklyAvg = useMemo(() => {
    if (chartData.length === 0) return 0;
    return Math.round(chartData.reduce((a, d) => a + d.minutes, 0) / chartData.length);
  }, [chartData]);

  const fmtTime = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

  return (
    <div className="px-4 pt-6 pb-4 max-w-md mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-foreground">My Progress</h1>

      {/* Log Study Time */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-foreground font-semibold">
          <Pencil className="h-4 w-4" /> Log Study Time
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Hours</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => setHours(Math.max(0, hours - 1))}><Minus className="h-3 w-3" /></Button>
              <span className="text-3xl font-bold text-foreground w-10 text-center">{hours}</span>
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => setHours(hours + 1)}><Plus className="h-3 w-3" /></Button>
            </div>
          </div>
          <span className="text-2xl font-bold text-muted-foreground mt-5">:</span>
          <div className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Minutes</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => setMinutes(Math.max(0, minutes - 5))}><Minus className="h-3 w-3" /></Button>
              <span className="text-3xl font-bold text-foreground w-10 text-center">{minutes}</span>
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => setMinutes(Math.min(55, minutes + 5))}><Plus className="h-3 w-3" /></Button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Subject</span>
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="w-32 bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="gradient" className="w-full h-11" onClick={addSession}>
          <Plus className="h-4 w-4 mr-1" /> Add to Progress
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-4">
          <Clock className="h-5 w-5 text-primary mb-1" />
          <div className="text-xl font-bold text-foreground">{fmtTime(todayMinutes)}</div>
          <div className="text-xs text-muted-foreground">Today</div>
        </div>
        <div className="glass-card p-4">
          <Calendar className="h-5 w-5 text-primary mb-1" />
          <div className="text-xl font-bold text-foreground">{fmtTime(weekMinutes)}</div>
          <div className="text-xs text-muted-foreground">This Week</div>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground">Daily Study Time</span>
          <div className="flex gap-1">
            {([7, 14, 30] as const).map(r => (
              <button
                key={r}
                onClick={() => setChartRange(r)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  chartRange === r ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(228 15% 55%)" }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: "hsl(228 25% 12%)", border: "1px solid hsl(228 20% 18%)", borderRadius: 8, color: "hsl(210 40% 95%)" }}
              formatter={(v: number) => [`${v}m`, "Study Time"]}
            />
            <Line type="monotone" dataKey="minutes" stroke="hsl(234 80% 63%)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Weekly avg: <span className="font-semibold text-foreground">{weeklyAvg}m/day</span></span>
        </div>
      </div>
    </div>
  );
};

export default Progress;
