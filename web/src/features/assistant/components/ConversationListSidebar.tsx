"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Plus, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/src/components/ui/skeleton";
import { SidePanel, SidePanelContent } from "@/src/components/ui/side-panel";
import { ScrollArea } from "@/src/components/ui/scroll-area";

type Conversation = {
  id: string;
  userId: string;
  projectId: string;
  startedAt: string;
};

type ConversationListSidebarProps = {
  projectId: string;
  userId?: string;
  selectedConversationId?: string;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  refreshKey?: number; // Force refresh when this changes
};

export function ConversationListSidebar({
  projectId,
  userId,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
  refreshKey,
}: ConversationListSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const fetchConversations = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ projectId });
        if (userId) {
          params.append("userId", userId);
        }

        // Fetch via Next.js API route (proxies to worker)
        const response = await fetch(
          `/api/assistant/conversations?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch conversations");
        }

        const data = await response.json();
        setConversations(data.conversations || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load conversations",
        );
        console.error("Error fetching conversations:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();

    // Refresh every 30 seconds
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, [projectId, userId, refreshKey]);

  return (
    <SidePanel
      id="conversations"
      mobileTitle="Conversations"
      className="![&>div]:w-[120px] !border-l-0"
    >
      <div className="flex h-fit w-full flex-col gap-2 p-3 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-semibold">Conversations</h3>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={onNewConversation}
          className="h-7 w-full px-2 py-1.5 text-sm"
        >
          New Conversation
        </Button>
      </div>
      <SidePanelContent className="border-t-0">
        <ScrollArea className="h-full">
          <div className="p-2">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="py-4 text-sm text-destructive">{error}</div>
            ) : conversations.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>No conversations yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={onNewConversation}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Start Conversation
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conversation) => (
                  <Button
                    key={conversation.id}
                    variant={
                      conversation.id === selectedConversationId
                        ? "secondary"
                        : "ghost"
                    }
                    onClick={() => onSelectConversation(conversation.id)}
                    className="w-full justify-start text-left"
                  >
                    <div className="flex flex-1 flex-col items-start gap-1 overflow-hidden">
                      <span className="truncate text-sm">
                        Conversation {conversation.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conversation.startedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SidePanelContent>
    </SidePanel>
  );
}
