import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerOAuthUser } from "@/lib/api";

type OAuthRoleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  email: string;
  suggestedDisplayName: string;
  avatarUrl?: string;
  onSuccess: (payload: {
    token: string;
    user: {
      id: string;
      email: string;
      display_name: string;
      role: string;
      avatar_url?: string | null;
    };
  }) => void;
};

export function OAuthRoleDialog({
  open,
  onOpenChange,
  accessToken,
  email,
  suggestedDisplayName,
  avatarUrl,
  onSuccess,
}: OAuthRoleDialogProps) {
  const [displayName, setDisplayName] = useState(suggestedDisplayName);
  const [role, setRole] = useState<"teacher" | "student" | "">("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (open) {
      setDisplayName(suggestedDisplayName);
      setRole("");
      setErrorMessage("");
    }
  }, [open, suggestedDisplayName]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");

    if (!role) {
      setErrorMessage("Please choose teacher or student.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await registerOAuthUser(
        accessToken,
        role,
        displayName.trim(),
        avatarUrl,
      );
      onSuccess(result);
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not finish Google sign-in.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Finish setting up your account</DialogTitle>
            <DialogDescription>
              Choose how you will use EduSync with {email || "your Google account"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="oauth-display-name" className="text-xs">
                Display name
              </Label>
              <Input
                id="oauth-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">I am a</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={role === "teacher" ? "default" : "outline"}
                  className="h-10"
                  onClick={() => setRole("teacher")}
                  disabled={isLoading}
                >
                  Teacher
                </Button>
                <Button
                  type="button"
                  variant={role === "student" ? "default" : "outline"}
                  className="h-10"
                  onClick={() => setRole("student")}
                  disabled={isLoading}
                >
                  Student
                </Button>
              </div>
            </div>

            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full sm:w-auto" disabled={isLoading}>
              {isLoading ? "Saving…" : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
