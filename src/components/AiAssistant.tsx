import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Loader2, Send } from "lucide-react";
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

export function AiAssistant({ className }: { className?: string }) {
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

  const configured = statusQuery.data?.configured ?? false;

  return (
    <Card
      className={cn(
        "flex max-h-[min(70vh,32rem)] flex-col border-border/60 shadow-sm",
        className,
      )}
    >
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Bot className="h-4 w-4 text-primary" />
          AI Assistant
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {statusQuery.isLoading
            ? "Checking AI status…"
            : configured
              ? `Powered by ${statusQuery.data?.model ?? "DeepSeek"} · read-only queries`
              : "Add DEEPSEEK_API_KEY to backend/.env to enable"}
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
        <div
          ref={scrollRef}
          className="min-h-[10rem] flex-1 space-y-3 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-3"
        >
          {messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ask about your schedule, classes, students, homework, balances, or
                pending reschedule requests. I look up live EduSync data before answering.
              </p>
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
            rows={2}
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
            className="h-auto shrink-0 self-end"
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
