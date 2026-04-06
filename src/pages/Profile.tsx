import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, Pencil, Clock, CheckSquare, Flame, Zap } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInCalendarDays } from "date-fns";


const Profile = () => {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [communityCount, setCommunityCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
      if (p) { setProfile(p); setEditName(p.username); }

      const { data: s } = await supabase.from("study_sessions").select("*").eq("user_id", user.id).order("started_at", { ascending: true });
      if (s) setSessions(s);

      const { count } = await supabase.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setCommunityCount(count || 0);
    };
    load();
  }, [user]);

  const updateUsername = async () => {
    if (!user || !editName.trim()) return;
    await supabase.from("profiles").update({ username: editName.trim() }).eq("user_id", user.id);
    setProfile({ ...profile, username: editName.trim() });
    setEditing(false);
    toast.success("Username updated!");
  };

  const updateColor = async (color: string) => {
    if (!user) return;
    await supabase.from("profiles").update({ avatar_color: color }).eq("user_id", user.id);
    setProfile({ ...profile, avatar_color: color });
  };

  const totalMinutes = useMemo(() => sessions.reduce((a, s) => a + s.duration_minutes, 0), [sessions]);

  const streaks = useMemo(() => {
    if (sessions.length === 0) return { current: 0, best: 0 };
    const days = [...new Set(sessions.map(s => format(new Date(s.started_at), "yyyy-MM-dd")))].sort();
    let current = 1, best = 1, streak = 1;
    for (let i = 1; i < days.length; i++) {
      if (differenceInCalendarDays(new Date(days[i]), new Date(days[i - 1])) === 1) {
        streak++;
        best = Math.max(best, streak);
      } else {
        streak = 1;
      }
    }
    // Check if current streak is active
    const lastDay = days[days.length - 1];
    const diff = differenceInCalendarDays(new Date(), new Date(lastDay));
    current = diff <= 1 ? streak : 0;
    return { current, best: Math.max(best, streak) };
  }, [sessions]);

  const fmtTime = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

  if (!profile) return null;

  return (
    <div className="px-4 pt-6 pb-4 max-w-md mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Profile</h1>

      {/* User Card */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full flex items-center justify-center text-2xl font-bold" style={{ backgroundColor: profile.avatar_color, color: "#fff" }}>
            {profile.username[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex gap-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-secondary border-border h-8 text-sm" />
                <Button variant="ghost" size="sm" onClick={updateUsername}>Save</Button>
              </div>
            ) : (
              <>
                <div className="font-bold text-foreground text-lg">{profile.username}</div>
                <div className="text-sm text-muted-foreground">{user?.email}</div>
                <div className="text-xs text-primary">{communityCount} communit{communityCount !== 1 ? "ies" : "y"}</div>
              </>
            )}
          </div>
          <button onClick={() => setEditing(!editing)} className="text-primary">
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Avatar Color</div>
          <div className="flex gap-2 flex-wrap">
            {avatarColors.map(c => (
              <button
                key={c}
                onClick={() => updateColor(c)}
                className="h-8 w-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
              >
                {profile.avatar_color === c && <Check className="h-4 w-4" style={{ color: "#fff" }} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="font-semibold text-foreground">All-Time Stats</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary rounded-xl p-3">
            <Clock className="h-4 w-4 text-muted-foreground mb-1" />
            <div className="text-lg font-bold text-foreground">{fmtTime(totalMinutes)}</div>
            <div className="text-xs text-muted-foreground">Total Time</div>
          </div>
          <div className="bg-secondary rounded-xl p-3">
            <CheckSquare className="h-4 w-4 text-muted-foreground mb-1" />
            <div className="text-lg font-bold text-foreground">{sessions.length}</div>
            <div className="text-xs text-muted-foreground">Sessions</div>
          </div>
          <div className="bg-secondary rounded-xl p-3">
            <Flame className="h-4 w-4 text-muted-foreground mb-1" />
            <div className="text-lg font-bold text-foreground">{streaks.best}d</div>
            <div className="text-xs text-muted-foreground">Best Streak</div>
          </div>
          <div className="bg-secondary rounded-xl p-3">
            <Zap className="h-4 w-4 text-muted-foreground mb-1" />
            <div className="text-lg font-bold text-foreground">{streaks.current}d</div>
            <div className="text-xs text-muted-foreground">Current Streak</div>
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <div className="glass-card p-4">
        <h3 className="font-semibold text-foreground mb-3">Account</h3>
        <Button
          variant="outline"
          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={async () => { await signOut(); toast.success("Signed out"); }}
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
};

export default Profile;
