import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { downloadSessionsIcal, getCurrentUser, updateCurrentUser, uploadUserAvatar } from "@/lib/api";
import { changeAppLanguage, getStoredLanguage, type AppLanguage } from "@/lib/i18n";
import { STUDENT_GRADE_OPTIONS } from "@/lib/student-grades";
import { toast } from "sonner";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [lang, setLang] = useState<AppLanguage>(getStoredLanguage);
  const [grade, setGrade] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [exportingCalendar, setExportingCalendar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar ?? null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (profileQuery.data?.avatar_url !== undefined) {
      setAvatarUrl(profileQuery.data.avatar_url ?? null);
    }
  }, [profileQuery.data?.avatar_url]);

  const email = user?.email ?? profileQuery.data?.email ?? "";
  const isStudent = user?.role === "student";
  const roleLabel =
    user?.role === "teacher"
      ? t("roles.teacher")
      : user?.role === "student"
        ? t("roles.student")
        : user?.role ?? "";

  async function handleLanguageChange(next: AppLanguage) {
    setLang(next);
    await changeAppLanguage(next);
    toast.success(t("settings.languageChanged"));
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateCurrentUser({
        display_name: name.trim(),
        ...(isStudent ? { grade: grade || null } : {}),
      }),
    onSuccess: (profile) => {
      updateUser({ name: profile.display_name });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      toast.success(t("settings.profileUpdated"));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const avatarUploadMutation = useMutation({
    mutationFn: (file: File) => uploadUserAvatar(file),
    onSuccess: (profile) => {
      const nextAvatar = profile.avatar_url ?? null;
      setAvatarUrl(nextAvatar);
      updateUser({ avatar: nextAvatar ?? undefined });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      toast.success(t("settings.avatarUploadSuccess"));
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
          ? t("settings.emailOn")
          : t("settings.emailOff"),
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
      toast.error(t("settings.nameEmpty"));
      return;
    }
    saveMutation.mutate();
  }

  function handleEmailNotificationsChange(checked: boolean) {
    setEmailNotifications(checked);
    emailPrefMutation.mutate(checked);
  }

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error(t("settings.avatarInvalidType"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("settings.avatarTooLarge"));
      return;
    }
    avatarUploadMutation.mutate(file);
  }

  async function handleExportCalendar() {
    setExportingCalendar(true);
    try {
      await downloadSessionsIcal();
      toast.success(t("settings.calendarExportSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.calendarExportFail"));
    } finally {
      setExportingCalendar(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="page-header">{t("settings.title")}</h1>
        <p className="page-subtitle">{t("settings.subtitle")}</p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">{t("settings.profile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={name || user?.name || ""} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                  {(name || "?").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={avatarUploadMutation.isPending}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {avatarUploadMutation.isPending
                    ? t("settings.avatarUploading")
                    : t("settings.changePhoto")}
                </Button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("settings.displayName")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9"
                  disabled={saveMutation.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("settings.email")}</Label>
                <Input value={email} disabled className="h-9 bg-muted" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("settings.role")}</Label>
                <Input value={roleLabel} disabled className="h-9 bg-muted capitalize" />
              </div>
              {isStudent ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t("settings.grade")}</Label>
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
                      <SelectItem value="__unset__">{t("settings.gradeNotSet")}</SelectItem>
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
              {saveMutation.isPending ? t("settings.saving") : t("settings.save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">{t("settings.notifications")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="email-notifications" className="text-sm font-medium">
                {t("settings.emailNotifications")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.emailNotificationsHint")}
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
          <CardTitle className="text-base font-semibold">{t("settings.preferences")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("settings.language")}</Label>
            <Select value={lang} onValueChange={(value) => void handleLanguageChange(value as AppLanguage)}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("settings.languageHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">{t("settings.calendarExport")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("settings.calendarExportHint")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportCalendar}
            disabled={exportingCalendar}
          >
            {exportingCalendar ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exportingCalendar ? t("settings.calendarExporting") : t("settings.calendarExportBtn")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
