import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, BrainCog, Globe, Paperclip, Square, X } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The composer's two optional modes. Each one changes how the agent answers. */
export type PromptMode = "search" | "think" | null;

type PromptInputBoxProps = {
  onSend: (message: string, options: { mode: PromptMode; files: File[] }) => void;
  isLoading?: boolean;
  onStop?: () => void;
  placeholder?: string;
  className?: string;
  /** Rendered on the right of the toolbar, before the send button. */
  trailing?: React.ReactNode;
};

function ModeToggle({
  active,
  label,
  icon: Icon,
  onClick,
  tooltip,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className={cn(
            "flex h-8 items-center gap-1 rounded-full border px-2 transition-colors",
            active
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <motion.span
            animate={{ rotate: active ? 360 : 0, scale: active ? 1.1 : 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
            className="flex size-5 items-center justify-center"
          >
            <Icon className="size-4" />
          </motion.span>
          <AnimatePresence initial={false}>
            {active ? (
              <motion.span
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap text-xs"
              >
                {label}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** A hairline divider with a soft neon waist, matching the OS chrome. */
function CustomDivider() {
  return (
    <span aria-hidden className="relative mx-1 h-6 w-px">
      <span className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-primary/50 to-transparent" />
    </span>
  );
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * The one composer for every agent surface. It grows with the text, carries
 * the optional answer modes, an optional image, and whatever model control the
 * caller passes in, without ever holding an opinion about the transport.
 */
export function PromptInputBox({
  onSend,
  isLoading = false,
  onStop,
  placeholder = "Ask anything",
  className,
  trailing,
}: PromptInputBoxProps) {
  const [input, setInput] = React.useState("");
  const [mode, setMode] = React.useState<PromptMode>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [zoomed, setZoomed] = React.useState(false);
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 240)}px`;
  }, [input]);

  const acceptFile = React.useCallback((candidate: File) => {
    if (!candidate.type.startsWith("image/") || candidate.size > MAX_IMAGE_BYTES) return;
    setFile(candidate);
    const reader = new FileReader();
    reader.onload = (event) => setPreview((event.target?.result as string) ?? null);
    reader.readAsDataURL(candidate);
  }, []);

  const clearFile = () => {
    setFile(null);
    setPreview(null);
  };

  const hasContent = input.trim().length > 0 || file !== null;

  const submit = () => {
    if (!hasContent || isLoading) return;
    onSend(input.trim(), { mode, files: file ? [file] : [] });
    setInput("");
    clearFile();
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dropped = Array.from(event.dataTransfer.files).find((candidate) =>
            candidate.type.startsWith("image/"),
          );
          if (dropped) acceptFile(dropped);
        }}
        className={cn(
          "rounded-3xl border border-border/70 bg-card/70 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.24)] backdrop-blur transition-colors focus-within:border-primary/50",
          isLoading && "border-primary/40",
          className,
        )}
      >
        {preview ? (
          <div className="p-1 pb-2">
            <div className="relative size-16 overflow-hidden rounded-xl border border-border/60">
              <button type="button" onClick={() => setZoomed(true)} className="size-full">
                <img src={preview} alt="Attached" className="size-full object-cover" />
              </button>
              <button
                type="button"
                onClick={clearFile}
                aria-label="Remove image"
                className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          placeholder={
            mode === "search"
              ? "Ask and let the agent search the web"
              : mode === "think"
                ? "Ask something worth thinking hard about"
                : placeholder
          }
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData.items)
              .filter((item) => item.type.startsWith("image/"))
              .map((item) => item.getAsFile())
              .find(Boolean);
            if (pasted) {
              event.preventDefault();
              acceptFile(pasted);
            }
          }}
          className="scrollbar-none min-h-11 w-full resize-none border-none bg-transparent px-3 py-2.5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />

        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => uploadRef.current?.click()}
                  aria-label="Attach an image"
                  className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Paperclip className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Attach an image</TooltipContent>
            </Tooltip>
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) acceptFile(chosen);
                event.target.value = "";
              }}
            />

            <ModeToggle
              active={mode === "search"}
              label="Search"
              icon={Globe}
              tooltip="Let the agent search the web alongside stored evidence"
              onClick={() => setMode((current) => (current === "search" ? null : "search"))}
            />
            <CustomDivider />
            <ModeToggle
              active={mode === "think"}
              label="Think"
              icon={BrainCog}
              tooltip="Ask for slower, deeper reasoning"
              onClick={() => setMode((current) => (current === "think" ? null : "think"))}
            />
          </div>

          <div className="flex items-center gap-2">
            {trailing}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={isLoading ? "Stop" : "Send"}
                  className="size-8 rounded-full"
                  onClick={() => (isLoading ? onStop?.() : submit())}
                  disabled={!isLoading && !hasContent}
                >
                  {isLoading ? (
                    <Square className="size-3.5 animate-pulse" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isLoading ? "Stop the answer" : "Send"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="max-w-[90vw] border-border/60 bg-card p-2 md:max-w-3xl">
          <DialogTitle className="sr-only">Image preview</DialogTitle>
          {preview ? (
            <img
              src={preview}
              alt="Attached preview"
              className="max-h-[80vh] w-full rounded-xl object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
