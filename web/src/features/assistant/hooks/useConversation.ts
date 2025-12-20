import { useQuery } from "@tanstack/react-query";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type ConversationResponse = {
  id: string;
  startedAt: string;
  messages: Message[];
};

export function useConversation(conversationId: string | null) {
  return useQuery<ConversationResponse, Error>({
    queryKey: ["assistant", "conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) {
        throw new Error("Conversation ID is required");
      }

      const response = await fetch(
        `/api/assistant/conversations/${conversationId}`,
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to fetch conversation" }));
        throw new Error(
          errorData.details
            ? `${errorData.error}: ${errorData.details}`
            : errorData.error || "Failed to fetch conversation",
        );
      }

      return response.json();
    },
    enabled: !!conversationId,
    refetchOnWindowFocus: false,
  });
}
