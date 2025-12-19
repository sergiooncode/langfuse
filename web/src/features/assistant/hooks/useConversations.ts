import { useQuery } from "@tanstack/react-query";

type Conversation = {
  id: string;
  userId: string;
  projectId: string;
  startedAt: string;
};

type ConversationsResponse = {
  conversations: Conversation[];
};

export function useConversations(projectId: string, userId?: string) {
  return useQuery<ConversationsResponse, Error>({
    queryKey: ["assistant", "conversations", projectId, userId],
    queryFn: async () => {
      const params = new URLSearchParams({ projectId });
      if (userId) {
        params.append("userId", userId);
      }

      const response = await fetch(
        `/api/assistant/conversations?${params.toString()}`,
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to fetch conversations" }));
        throw new Error(
          errorData.details
            ? `${errorData.error}: ${errorData.details}`
            : errorData.error || "Failed to fetch conversations",
        );
      }

      return response.json();
    },
    enabled: !!projectId,
    refetchOnWindowFocus: false,
  });
}
