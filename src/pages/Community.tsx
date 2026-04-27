import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Plus, LogIn, Copy, LogOut, Crown, ArrowLeft, Clock, Calendar, Trophy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, isWithinInterval, format, subDays, startOfMonth, endOfMonth, isSaturday, previousSaturday, addDays, formatDistanceToNowStrict } from "date-fns";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, Cell } from "recharts";




interface CommunityData {
  id: string;
  name: string;
  code: string;
  created_by: string;
}

interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_color: string;
  weekMinutes: number;
  isCurrentUser: boolean;
}

interface Challenge {
  id: string;
  community_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  created_by: string;
}

type LeaderboardMode = "weekly" | "monthly" | "alltime" | "challenge";

const Community = () => {
  const { user } = useAuth();
  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<CommunityData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [selectedMember, setSelectedMember] = useState<LeaderboardEntry | null>(null);
  const [memberSessions, setMemberSessions] = useState<any[]>([]);
  const [memberChartRange, setMemberChartRange] = useState<7 | 14 | 30>(7);
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>("weekly");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [showChallengeDialog, setShowChallengeDialog] = useState(false);
  const [chTitle, setChTitle] = useState("");
  const [chStartDate, setChStartDate] = useState("");
  const [chStartTime, setChStartTime] = useState("00:00");
  const [chEndDate, setChEndDate] = useState("");
  const [chEndTime, setChEndTime] = useState("23:59");

  const fetchCommunities = async () => {
    if (!user) return;
    const { data: memberships } = await supabase
      .from("memberships")
      .select("community_id")
      .eq("user_id", user.id);
    if (!memberships || memberships.length === 0) { setCommunities([]); return; }
    const ids = memberships.map(m => m.community_id);
    const { data } = await supabase
      .from("communities")
      .select("id, name, code, created_by")
      .in("id", ids);
    if (data) setCommunities(data);
  };

  useEffect(() => { fetchCommunities(); }, [user]);

  const getSatWeekRange = () => {
    const now = new Date();
    const sat = isSaturday(now) ? now : previousSaturday(now);
    const start = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate(), 0, 0, 0);
    const end = addDays(start, 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const fetchChallenges = async (communityId: string) => {
    const { data } = await supabase
      .from("challenges")
      .select("*")
      .eq("community_id", communityId)
      .order("starts_at", { ascending: false });
    const list = (data as Challenge[]) || [];
    setChallenges(list);
    const now = new Date();
    const active = list.find(c => new Date(c.starts_at) <= now && new Date(c.ends_at) >= now);
    const latestPast = list.find(c => new Date(c.ends_at) < now);
    setActiveChallenge(active || latestPast || null);
    return { list, active, latestPast };
  };

  const fetchLeaderboard = async (
    communityId: string,
    mode: LeaderboardMode = leaderboardMode,
    challengeOverride?: Challenge | null,
  ) => {
    const { data: members } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("community_id", communityId);
    if (!members || members.length === 0) { setLeaderboard([]); return; }

    const userIds = [...new Set(members.map(m => m.user_id))];

    const [{ data: profiles }, { data: sessions }] = await Promise.all([
      supabase.from("profiles").select("user_id, username, avatar_color").in("user_id", userIds),
      supabase.from("study_sessions").select("user_id, duration_minutes, started_at").in("user_id", userIds),
    ]);

    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

    let filterFn: (s: any) => boolean;
    if (mode === "weekly") {
      const { start, end } = getSatWeekRange();
      filterFn = (s) => isWithinInterval(new Date(s.started_at), { start, end });
    } else if (mode === "monthly") {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      filterFn = (s) => isWithinInterval(new Date(s.started_at), { start, end });
    } else if (mode === "challenge") {
      const ch = challengeOverride !== undefined ? challengeOverride : activeChallenge;
      if (!ch) {
        setLeaderboard([]);
        return;
      }
      const start = new Date(ch.starts_at);
      const end = new Date(ch.ends_at);
      filterFn = (s) => isWithinInterval(new Date(s.started_at), { start, end });
    } else {
      filterFn = () => true;
    }

    const entries: LeaderboardEntry[] = userIds.map(uid => {
      const profile = profileMap.get(uid);
      const mins = (sessions || [])
        .filter(s => s.user_id === uid && filterFn(s))
        .reduce((a, s) => a + s.duration_minutes, 0);
      return {
        user_id: uid,
        username: profile?.username || "Unknown",
        avatar_color: profile?.avatar_color || "#6366F1",
        weekMinutes: mins,
        isCurrentUser: uid === user?.id,
      };
    });

    entries.sort((a, b) => b.weekMinutes - a.weekMinutes);
    setLeaderboard(entries);
  };

  const selectCommunity = async (c: CommunityData) => {
    setSelectedCommunity(c);
    setLeaderboardMode("weekly");
    await fetchChallenges(c.id);
    fetchLeaderboard(c.id, "weekly");
  };

  const createChallenge = async () => {
    if (!user || !selectedCommunity) return;
    if (selectedCommunity.created_by !== user.id) {
      toast.error("Only the community owner can create challenges");
      return;
    }
    if (!chStartDate || !chEndDate) {
      toast.error("Please select start and end dates");
      return;
    }
    const startsAt = new Date(`${chStartDate}T${chStartTime || "00:00"}:00`);
    const endsAt = new Date(`${chEndDate}T${chEndTime || "23:59"}:00`);
    if (endsAt <= startsAt) {
      toast.error("End must be after start");
      return;
    }
    const { error } = await supabase.from("challenges").insert({
      community_id: selectedCommunity.id,
      title: chTitle.trim() || "Challenge",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      created_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Challenge created!");
    setShowChallengeDialog(false);
    setChTitle(""); setChStartDate(""); setChEndDate(""); setChStartTime("00:00"); setChEndTime("23:59");
    const { active, latestPast } = await fetchChallenges(selectedCommunity.id);
    setLeaderboardMode("challenge");
    fetchLeaderboard(selectedCommunity.id, "challenge", active || latestPast || null);
  };

  const deleteChallenge = async (id: string) => {
    if (!selectedCommunity) return;
    const { error } = await supabase.from("challenges").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Challenge deleted");
    await fetchChallenges(selectedCommunity.id);
    fetchLeaderboard(selectedCommunity.id, leaderboardMode);
  };

  const selectMember = async (entry: LeaderboardEntry) => {
    setSelectedMember(entry);
    setMemberChartRange(7);
    const { data } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("user_id", entry.user_id)
      .order("started_at", { ascending: false });
    setMemberSessions(data || []);
  };

  const createCommunity = async () => {
    if (!user || !newName.trim()) return;
    const { data, error } = await supabase.rpc("create_community_with_password", {
      _name: newName.trim(),
      _password: newPassword || "",
    });
    if (error) { toast.error(error.message); return; }
    const result = data as any;

    toast.success(`Community "${newName}" created! Code: ${result.code}`);
    setShowCreate(false);
    setNewName("");
    setNewPassword("");
    fetchCommunities();
  };

  const joinCommunity = async () => {
    if (!user || !joinCode.trim()) return;
    const { data, error } = await supabase.rpc("join_community_with_password", {
      _code: joinCode.trim(),
      _password: joinPassword || "",
    });
    if (error) { toast.error(error.message); return; }

    toast.success("Joined community!");
    setShowJoin(false);
    setJoinCode("");
    setJoinPassword("");
    fetchCommunities();
  };

  const leaveCommunity = async (communityId: string) => {
    if (!user) return;
    await supabase.from("memberships").delete().eq("user_id", user.id).eq("community_id", communityId);
    toast.success("Left community");
    setSelectedCommunity(null);
    fetchCommunities();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied!");
  };

  const fmtTime = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

  // Member chart data
  const memberChartData = useMemo(() => {
    const days: { date: string; minutes: number }[] = [];
    for (let i = memberChartRange - 1; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const dayStr = format(day, "yyyy-MM-dd");
      const mins = memberSessions
        .filter(s => format(new Date(s.started_at), "yyyy-MM-dd") === dayStr)
        .reduce((acc: number, s: any) => acc + s.duration_minutes, 0);
      days.push({ date: format(day, "MMM d"), minutes: mins });
    }
    return days;
  }, [memberSessions, memberChartRange]);

  const memberTodayMinutes = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return memberSessions
      .filter(s => format(new Date(s.started_at), "yyyy-MM-dd") === todayStr)
      .reduce((acc: number, s: any) => acc + s.duration_minutes, 0);
  }, [memberSessions]);

  const memberWeekMinutes = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return memberSessions
      .filter(s => isWithinInterval(new Date(s.started_at), { start, end }))
      .reduce((acc: number, s: any) => acc + s.duration_minutes, 0);
  }, [memberSessions]);

  const memberWeeklyAvg = useMemo(() => {
    if (memberChartData.length === 0) return 0;
    return Math.round(memberChartData.reduce((a, d) => a + d.minutes, 0) / memberChartData.length);
  }, [memberChartData]);

  const memberSubjectData = useMemo(() => {
    const cutoff = subDays(new Date(), memberChartRange - 1);
    cutoff.setHours(0, 0, 0, 0);
    const totals = new Map<string, number>();
    memberSessions
      .filter((s: any) => new Date(s.started_at) >= cutoff)
      .forEach((s: any) => totals.set(s.subject || "Other", (totals.get(s.subject || "Other") || 0) + s.duration_minutes));
    return Array.from(totals.entries())
      .map(([subject, minutes]) => ({ subject, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [memberSessions, memberChartRange]);

  const subjectColors = ["hsl(234 80% 63%)", "hsl(280 70% 60%)", "hsl(180 65% 55%)", "hsl(45 90% 60%)", "hsl(340 75% 60%)", "hsl(150 60% 55%)", "hsl(20 85% 60%)", "hsl(210 70% 60%)", "hsl(300 60% 60%)", "hsl(95 55% 55%)"];

  // Live updates for selected member's sessions
  useEffect(() => {
    if (!selectedMember) return;
    const channel = supabase
      .channel(`member-sessions-${selectedMember.user_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_sessions", filter: `user_id=eq.${selectedMember.user_id}` },
        async () => {
          const { data } = await supabase
            .from("study_sessions")
            .select("*")
            .eq("user_id", selectedMember.user_id)
            .order("started_at", { ascending: false });
          setMemberSessions(data || []);
          if (selectedCommunity) fetchLeaderboard(selectedCommunity.id);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedMember?.user_id]);

  // Member detail view
  if (selectedMember && selectedCommunity) {
    return (
      <div className="px-4 pt-6 pb-4 max-w-md mx-auto space-y-4">
        <button onClick={() => setSelectedMember(null)} className="text-primary text-sm font-semibold flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Leaderboard
        </button>

        <div className="glass-card p-5 flex items-center gap-4">
          <div className="h-14 w-14 rounded-full flex items-center justify-center text-2xl font-bold" style={{ backgroundColor: selectedMember.avatar_color, color: "#fff" }}>
            {selectedMember.username[0]?.toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-foreground text-lg">{selectedMember.username}</div>
            <div className="text-sm text-muted-foreground">{selectedCommunity.name}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4">
            <Clock className="h-5 w-5 text-primary mb-1" />
            <div className="text-xl font-bold text-foreground">{fmtTime(memberTodayMinutes)}</div>
            <div className="text-xs text-muted-foreground">Today</div>
          </div>
          <div className="glass-card p-4">
            <Calendar className="h-5 w-5 text-primary mb-1" />
            <div className="text-xl font-bold text-foreground">{fmtTime(memberWeekMinutes)}</div>
            <div className="text-xs text-muted-foreground">This Week</div>
          </div>
        </div>

        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Daily Study Time</span>
            <div className="flex gap-1">
              {([7, 14, 30] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setMemberChartRange(r)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    memberChartRange === r ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {r}d
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={memberChartData}>
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
            <span>Daily avg: <span className="font-semibold text-foreground">{memberWeeklyAvg}m/day</span></span>
          </div>
        </div>

        {/* Subject Breakdown */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">By Subject</span>
            <span className="text-xs text-muted-foreground">Last {memberChartRange}d · Live</span>
          </div>
          {memberSubjectData.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">No study sessions yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(140, memberSubjectData.length * 32)}>
              <BarChart data={memberSubjectData} layout="vertical" margin={{ left: 0, right: 30, top: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="subject" type="category" tick={{ fontSize: 11, fill: "hsl(228 15% 75%)" }} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  cursor={{ fill: "hsl(228 25% 18% / 0.5)" }}
                  contentStyle={{ background: "hsl(228 25% 12%)", border: "1px solid hsl(228 20% 18%)", borderRadius: 8, color: "hsl(210 40% 95%)" }}
                  formatter={(v: number) => [fmtTime(v), "Time"]}
                />
                <Bar dataKey="minutes" radius={[0, 6, 6, 0]} label={{ position: "right", fill: "hsl(210 40% 95%)", fontSize: 11, formatter: (v: number) => fmtTime(v) }}>
                  {memberSubjectData.map((_, idx) => <Cell key={idx} fill={subjectColors[idx % subjectColors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  }

  // Empty state
  if (communities.length === 0 && !selectedCommunity) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 space-y-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/20">
          <Users className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">No Communities Yet</h2>
          <p className="text-muted-foreground text-sm">Create or join a community to study together with friends.</p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          <Button variant="gradient" className="w-full h-12" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create Community
          </Button>
          <Button variant="gradient-soft" className="w-full h-12" onClick={() => setShowJoin(true)}>
            <LogIn className="h-4 w-4 mr-2" /> Join Community
          </Button>
        </div>

        <CreateDialog open={showCreate} onOpenChange={setShowCreate} name={newName} setName={setNewName} password={newPassword} setPassword={setNewPassword} onSubmit={createCommunity} />
        <JoinDialog open={showJoin} onOpenChange={setShowJoin} code={joinCode} setCode={setJoinCode} password={joinPassword} setPassword={setJoinPassword} onSubmit={joinCommunity} />
      </div>
    );
  }

  // Community view
  if (selectedCommunity) {
    return (
      <div className="px-4 pt-6 pb-4 max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedCommunity(null)} className="text-primary text-sm font-semibold">← Back</button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-semibold">{selectedCommunity.name}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowJoin(true)}><LogIn className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-lg text-sm">
            <span className="text-muted-foreground">Code:</span>
            <span className="font-bold text-foreground">{selectedCommunity.code}</span>
            <button onClick={() => copyCode(selectedCommunity.code)}><Copy className="h-3.5 w-3.5 text-muted-foreground" /></button>
          </div>
          <button onClick={() => leaveCommunity(selectedCommunity.id)} className="text-destructive text-sm font-semibold flex items-center gap-1">
            <LogOut className="h-3.5 w-3.5" /> Leave
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            {leaderboardMode === "weekly" ? "This Week (Sat–Fri)" : leaderboardMode === "monthly" ? "This Month" : "All Time"} · {leaderboard.length} Member{leaderboard.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="flex gap-1">
          {(["weekly", "monthly", "alltime"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => { setLeaderboardMode(mode); fetchLeaderboard(selectedCommunity.id, mode); }}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                leaderboardMode === mode ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {mode === "weekly" ? "Weekly" : mode === "monthly" ? "Monthly" : "All Time"}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {leaderboard.map((entry, i) => (
            <button
              key={entry.user_id}
              onClick={() => selectMember(entry)}
              className="glass-card w-full p-3 flex items-center gap-3 text-left hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer"
            >
              <span className="text-sm font-bold text-gold w-6">{i + 1}{i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"}</span>
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: entry.avatar_color, color: "#fff" }}>
                {entry.username[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">
                  {entry.username} {entry.isCurrentUser && <span className="text-muted-foreground">(you)</span>}
                </div>
                <div className="h-1.5 bg-secondary rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gold transition-all"
                    style={{ width: `${Math.min(100, leaderboard[0]?.weekMinutes ? (entry.weekMinutes / leaderboard[0].weekMinutes) * 100 : 0)}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-foreground">{fmtTime(entry.weekMinutes)}</div>
              </div>
            </button>
          ))}
        </div>

        <CreateDialog open={showCreate} onOpenChange={setShowCreate} name={newName} setName={setNewName} password={newPassword} setPassword={setNewPassword} onSubmit={createCommunity} />
        <JoinDialog open={showJoin} onOpenChange={setShowJoin} code={joinCode} setCode={setJoinCode} password={joinPassword} setPassword={setJoinPassword} onSubmit={joinCommunity} />
      </div>
    );
  }

  // Community list
  return (
    <div className="px-4 pt-6 pb-4 max-w-md mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Communities</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => setShowCreate(true)}><Plus className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setShowJoin(true)}><LogIn className="h-5 w-5" /></Button>
        </div>
      </div>
      <div className="space-y-2">
        {communities.map(c => (
          <button key={c.id} onClick={() => selectCommunity(c)} className="glass-card w-full p-4 text-left flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-foreground">{c.name}</div>
              <div className="text-xs text-muted-foreground">Code: {c.code}</div>
            </div>
            {c.created_by === user?.id && <Crown className="h-4 w-4 text-gold" />}
          </button>
        ))}
      </div>

      <CreateDialog open={showCreate} onOpenChange={setShowCreate} name={newName} setName={setNewName} password={newPassword} setPassword={setNewPassword} onSubmit={createCommunity} />
      <JoinDialog open={showJoin} onOpenChange={setShowJoin} code={joinCode} setCode={setJoinCode} password={joinPassword} setPassword={setJoinPassword} onSubmit={joinCommunity} />
    </div>
  );
};

const CreateDialog = ({ open, onOpenChange, name, setName, password, setPassword, onSubmit }: any) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-card border-border max-w-sm">
      <DialogHeader><DialogTitle className="text-foreground">Create Community</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Input placeholder="Community name" value={name} onChange={e => setName(e.target.value)} className="bg-secondary border-border" />
        <Input placeholder="Password (optional)" type="password" value={password} onChange={e => setPassword(e.target.value)} className="bg-secondary border-border" />
        <Button variant="gradient" className="w-full" onClick={onSubmit}>Create</Button>
      </div>
    </DialogContent>
  </Dialog>
);

const JoinDialog = ({ open, onOpenChange, code, setCode, password, setPassword, onSubmit }: any) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-card border-border max-w-sm">
      <DialogHeader><DialogTitle className="text-foreground">Join Community</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Input placeholder="Enter 6-character code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} className="bg-secondary border-border uppercase tracking-widest text-center font-bold" />
        <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="bg-secondary border-border" />
        <Button variant="gradient" className="w-full" onClick={onSubmit}>Join</Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default Community;
