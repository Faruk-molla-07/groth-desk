import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const Auth = () => {
  const [isSignIn, setIsSignIn] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignIn) {
        await signIn(email, password);
        toast.success("Welcome back!");
      } else {
        await signUp(email, password, username);
        toast.success("Account created! Welcome to StudyTrack!");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/20">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">StudyTrack</h1>
          <p className="text-muted-foreground">Track. Learn. Grow.</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-secondary p-1">
          <button
            onClick={() => setIsSignIn(true)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              isSignIn ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setIsSignIn(false)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              !isSignIn ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isSignIn && (
            <div className="relative">
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 bg-secondary border-border pl-11 text-foreground placeholder:text-muted-foreground"
                required
              />
              <span className="absolute left-3.5 top-3.5 text-muted-foreground">@</span>
            </div>
          )}
          <div className="relative">
            <Input
              type="email"
              placeholder="Gmail or email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 bg-secondary border-border pl-11 text-foreground placeholder:text-muted-foreground"
              required
            />
            <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground" />
          </div>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-secondary border-border pl-11 pr-11 text-foreground placeholder:text-muted-foreground"
              required
              minLength={6}
            />
            <Lock className="absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-3.5 text-muted-foreground"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <Button type="submit" variant="gradient" className="w-full h-12 text-base" disabled={loading}>
            {loading ? "Please wait..." : isSignIn ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignIn ? "New to StudyTrack? " : "Already have an account? "}
          <button
            onClick={() => setIsSignIn(!isSignIn)}
            className="text-primary font-semibold"
          >
            {isSignIn ? "Create Account" : "Sign In"}
          </button>
        </p>
      </div>

    </div>
  );
};

export default Auth;
