import { useRouter } from "next/router";
import { useState } from "react";
import { useSession } from "next-auth/react";
import Page from "@/src/components/layouts/page";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { ConversationListSidebar } from "@/src/features/assistant/components/ConversationListSidebar";
import { ChatView } from "@/src/features/assistant/components/ChatView";

export default function AssistantPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const isMobile = useIsMobile();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | undefined
  >();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    // TODO: Load conversation messages
  };

  const handleNewConversation = async () => {
    if (!projectId || !userId) return;

    try {
      // Create new conversation via Next.js API route (proxies to worker)
      const response = await fetch("/api/assistant/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Note: The controller currently doesn't use the body, but we'll send it for future use
        body: JSON.stringify({
          projectId,
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create conversation");
      }

      const data = await response.json();
      setSelectedConversationId(data.id);
      // Refresh conversation list
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error creating conversation:", error);
    }
  };

  if (!projectId) {
    return (
      <Page
        headerProps={{
          title: "Assistant",
        }}
      >
        <div>Loading...</div>
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: "Assistant",
        help: {
          description:
            "Project-level assistant. Customize this page to interact with your Langfuse data or workflows.",
        },
      }}
      scrollable={false}
      withPadding={false}
    >
      <div className="flex h-full w-full flex-col md:flex-row">
        <ConversationListSidebar
          projectId={projectId}
          userId={userId}
          selectedConversationId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          refreshKey={refreshKey}
        />
        {selectedConversationId ? (
          <div className="flex h-full min-h-0 min-w-0 flex-1">
            <ChatView conversationId={selectedConversationId} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {isMobile
                  ? "Open the sidebar to select or create a conversation"
                  : "Select a conversation from the sidebar or create a new one to get started."}
              </p>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
