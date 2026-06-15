import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { getCurrentUser, updateCurrentUser } from "@/lib/api";
import { STUDENT_GRADE_OPTIONS } from "@/lib/student-grades";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [lang, setLang] = useState("en");
  const [grade, setGrade] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);

  const profileQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: getCurrentUser,
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user?.name]);

  useEffect(() => {
    if (profileQuery.data?.email_notifications !== undefined) {
      setEmailNotifications(profileQuery.data.email_notifications);
    }
  }, [profileQuery.data?.email_notifications]);

  useEffect(() => {
    if (profileQuery.data?.grade !== undefined) {
      setGrade(profileQuery.data.grade ?? "");
    }
  }, [profileQuery.data?.grade]);

  const email = user?.email ?? profileQuery.data?.email ?? "";
  const isStudent = user?.role === "student";
  const roleLabel =
    user?.role === "teacher"
      ? "Teacher"
      : user?.role === "student"
        ? "Student"
        : user?.role ?? "";

  const saveMutation = useMutation({
    mutationFn: () =>
      updateCurrentUser({
        display_name: name.trim(),
        ...(isStudent ? { grade: grade || null } : {}),
      }),
    onSuccess: (profile) => {
      updateUser({ name: profile.display_name });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      toast.success("Profile updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const emailPrefMutation = useMutation({
    mutationFn: (enabled: boolean) => updateCurrentUser({ email_notifications: enabled }),
    onSuccess: (profile) => {
      setEmailNotifications(profile.email_notifications ?? true);
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      toast.success(
        profile.email_notifications
          ? "Email notifications enabled"
          : "Email notifications turned off",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setEmailNotifications((prev) => !prev);
    },
  });

  function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Display name cannot be empty");
      return;
    }
    saveMutation.mutate();
  }

  function handleEmailNotificationsChange(checked: boolean) {
    setEmailNotifications(checked);
    emailPrefMutation.mutate(checked);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="page-header">Settings</h1>
        <p className="page-subtitle">Manage your profile and preferences</p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                  {(name || "?").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Button variant="outline" size="sm" type="button" disabled>
                Change Photo
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Display Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9"
                  disabled={saveMutation.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input value={email} disabled className="h-9 bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Input value={roleLabel} disabled className="h-9 bg-muted capitalize" />
              </div>
              {isStudent ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Grade</Label>
                  <Select
                    value={grade || "__unset__"}
                    onValueChange={(value) =>
                      setGrade(value === "__unset__" ? "" : value)
                    }
                    disabled={saveMutation.isPending}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">Not set</SelectItem>
                      {STUDENT_GRADE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <Button size="sm" type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="email-notifications" className="text-sm font-medium">
                Email notifications
              </Label>
              <p className="text-xs text-muted-foreground">
                Schedule changes, reschedule updates, and class reminders (day before).
                In-app notifications are always on.
              </p>
            </div>
            <Switch
              id="email-notifications"
              checked={emailNotifications}
              onCheckedChange={handleEmailNotificationsChange}
              disabled={emailPrefMutation.isPending || profileQuery.isLoading}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Language</Label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Full interface translation ships in P1-09 (i18n).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
