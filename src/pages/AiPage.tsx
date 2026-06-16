import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bot } from "lucide-react";
import { AiAssistant } from "@/components/AiAssistant";
import { AiBetaBadge } from "@/components/AiBetaNotice";
import { useAuth } from "@/context/AuthContext";
import { isTeacherRole, normalizeRole } from "@/lib/roles";

export default function AiPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isTeacher = isTeacherRole(normalizeRole(user?.role));

  if (!isTeacher) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="page-header flex flex-wrap items-center gap-2">
          <Bot className="h-7 w-7 text-primary" />
          {t("nav.ai")}
          <AiBetaBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("ai.pageSubtitle")}</p>
      </div>
      <AiAssistant variant="page" className="max-h-[min(80vh,40rem)]" />
    </div>
  );
}
