import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bot, Loader2, Send } from "lucide-react";
import { AiBetaNotice } from "@/components/AiBetaNotice";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  getAiStatus,
  streamAiChat,
  type AiChatMessage,
} from "@/lib/api";

const STARTER_PROMPTS = [
  "What sessions do I have this week?",
  "Who hasn't submitted homework yet?",
  "这周有哪些课？",
];

const TOOL_LABELS: Record<string, string> = {
  list_my_classes: "Looking up your classes…",
  list_sessions: "Checking your schedule…",
  list_class_students: "Loading class roster…",
  list_assignments: "Loading assignments…",
  list_pending_submissions: "Checking submissions to grade…",
  get_student_balances: "Loading tuition balances…",
  list_pending_reschedules: "Loading reschedule requests…",
};

type AiAssistantProps = {
  className?: string;
  /** Full page, embedded panel, or centered modal (no duplicate header) */
  variant?: "page" | "embedded" | "modal";
  /** Called after a chat completes (for refreshing server logs) */
  onInteractionComplete?: () => void;
};

export function AiAssistant({
  className,
  variant = "page",
  onInteractionComplete,
}: AiAssistantProps) {
  const { t } = useTranslation();
  const embedded = variant === "embedded";
  const modal = variant === "modal";
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const statusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: getAiStatus,
    staleTime: 60_000,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streaming]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) {
      return;
    }

    if (statusQuery.data && !statusQuery.data.configured) {
      toast.error("AI is not configured. Add DEEPSEEK_API_KEY to backend/.env.");
      return;
    }

    const nextMessages: AiChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setStreaming(true);
    setToolStatus(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let assistantText = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await streamAiChat(
        nextMessages,
        (event) => {
          if (event.type === "token") {
            setToolStatus(null);
            assistantText += event.content;
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
              }
              return copy;
            });
          } else if (event.type === "tool_start") {
            setToolStatus(
              TOOL_LABELS[event.name] ?? `Checking ${event.label ?? event.name}…`,
            );
          } else if (event.type === "tool_done") {
            setToolStatus(null);
          } else if (event.type === "error") {
            toast.error(event.message);
            setMessages((prev) => {
              const copy = [...prev];
              if (copy[copy.length - 1]?.role === "assistant" && !assistantText) {
                copy.pop();
              }
              return copy;
            });
          } else if (event.type === "done") {
            onInteractionComplete?.();
          }
        },
        controller.signal,
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error(error instanceof Error ? error.message : "AI request failed");
      }
    } finally {
      setStreaming(false);
      setToolStatus(null);
      abortRef.current = null;
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  const configured = statusQuery.data?.configured === true;
  const modelName = statusQuery.data?.model ?? "DeepSeek";
  const statusHint = statusQuery.isLoading
    ? "Checking AI status…"
    : statusQuery.isError
      ? "Cannot reach the API. Is the backend running? Check VITE_API_URL."
      : configured
        ? t("ai.statusBetaModel", { model: modelName })
        : "Add DEEPSEEK_API_KEY to backend/.env (local) or Railway Variables (production), then restart the server.";

  return (
    <Card
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border-border/60 shadow-sm",
        embedded ? "h-[26rem] max-h-[26rem]" : modal ? "h-full max-h-none border-0 shadow-none" : "max-h-[min(80vh,40rem)]",
        className,
      )}
    >
      {!modal ? (
        <CardHeader className="shrink-0 space-y-1 px-4 pb-2 pt-4 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Bot className="h-4 w-4 text-primary" />
            AI Assistant
          </CardTitle>
          <p className="text-xs text-muted-foreground">{statusHint}</p>
        </CardHeader>
      ) : null}
      <CardContent
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden sm:pb-6",
          modal ? "px-0 pb-0 pt-0 sm:px-0" : "px-4 pb-4 pt-0 sm:px-6",
        )}
      >
        {modal ? (
          <p className="shrink-0 px-1 text-xs text-muted-foreground">{statusHint}</p>
        ) : null}
        <AiBetaNotice compact={embedded || modal} className="shrink-0" />
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain rounded-lg border border-border/50 bg-muted/20 p-3"
        >
          {messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ask about your schedule, classes, students, homework, balances, or
                pending reschedule requests.
              </p>
              {!embedded ? (
                <p className="text-xs text-muted-foreground">
                  Invited students who have not registered yet can still appear in tuition
                  and attendance, but not in assignments, private notes, or AI class rosters
                  until they sign up with the same email.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    disabled={!configured || streaming}
                    onClick={() => void sendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ml-6 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "mr-6 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                }
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            ))
          )}
          {streaming ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {toolStatus ?? "Thinking…"}
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex shrink-0 gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              configured
                ? "Ask EduSync AI…"
                : "Configure DeepSeek API key first"
            }
            rows={embedded ? 1 : 2}
            className="min-h-0 resize-none"
            disabled={!configured || streaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(input);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 shrink-0 self-end"
            disabled={!configured || streaming || !input.trim()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
