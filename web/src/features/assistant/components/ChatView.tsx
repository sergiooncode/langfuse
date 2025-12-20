"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Loader2, Send, User, Bot } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { useConversation } from "../hooks/useConversation";
import { useAddMessage } from "../hooks/useConversationMutations";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type ChatViewProps = {
  conversationId: string;
};

export function ChatView({ conversationId }: ChatViewProps) {
  const [inputValue, setInputValue] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversation using React Query hook
  const {
    data: conversationData,
    isLoading,
    error: queryError,
  } = useConversation(conversationId);

  const addMessageMutation = useAddMessage();

  const messages = conversationData?.messages || [];
  const error = queryError?.message || null;
  const isSending = addMessageMutation.isPending;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input when conversation loads or changes
  useEffect(() => {
    if (!isLoading && conversationData) {
      // Small delay to ensure input is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [conversationId, isLoading, conversationData]);

  const handleSend = async () => {
    if (!inputValue.trim() || isSending || !conversationId) return;

    const content = inputValue.trim();
    setInputValue("");

    try {
      await addMessageMutation.mutateAsync({
        conversationId,
        content,
      });
      // React Query will automatically refetch the conversation
      // and update the messages via the useConversation hook

      // Refocus input after sending message for better keyboard accessibility
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (err) {
      // Error is handled by React Query and will be available via
      // addMessageMutation.error if needed
      console.error("Error sending message:", err);
      // Refocus input even on error so user can retry
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Messages area */}
      <ScrollArea className="min-h-0 w-full flex-1" ref={scrollAreaRef}>
        <div className="flex w-full justify-center">
          <div
            className="flex max-w-3xl flex-col gap-4 p-4 pb-6"
            role="log"
            aria-label="Conversation messages"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.length === 0 ? (
              <div
                className="flex h-full w-full items-center justify-center"
                role="status"
              >
                <p className="text-center text-sm text-muted-foreground">
                  No messages yet. Start the conversation!
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex w-full gap-2",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                  role="article"
                  aria-label={`Message from ${message.role}`}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "flex max-w-[80%] flex-col rounded-lg px-4 py-2",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium opacity-70">
                          {message.role === "user" ? "You" : "Assistant"}
                        </span>
                        {message.role === "user" && (
                          <User className="h-3 w-3 opacity-70" />
                        )}
                      </div>
                      <time
                        dateTime={message.timestamp}
                        className={cn(
                          "text-[10px] opacity-50",
                          message.role === "user"
                            ? "text-primary-foreground/50"
                            : "text-muted-foreground",
                        )}
                        title={new Date(message.timestamp).toLocaleString()}
                      >
                        {new Date(message.timestamp).toLocaleTimeString(
                          "en-US",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          },
                        )}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">
                      {message.content}
                    </p>
                  </div>
                  {message.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}
            {isSending && (
              <div
                className="flex w-full justify-center"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="text-sm text-muted-foreground">
                    Assistant is typing...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </ScrollArea>

      {/* Input area */}
      <div
        className="flex w-full shrink-0 justify-center bg-background px-4 pb-4 pt-4 md:px-6 md:pb-6"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex w-full max-w-2xl gap-2">
          <Textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask, test, or explore an idea…"
            className="min-h-[80px] w-full resize-none"
            disabled={isSending}
            aria-label="Message input"
            aria-describedby="input-help-text"
          />
          <span id="input-help-text" className="sr-only">
            Press Enter to send message, Shift+Enter for new line
          </span>
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isSending}
            size="icon"
            className="h-[80px] w-[80px] shrink-0"
            aria-label="Send message"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
