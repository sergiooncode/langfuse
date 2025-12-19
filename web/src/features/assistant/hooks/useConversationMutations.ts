import { useMutation, useQueryClient } from "@tanstack/react-query";

type CreateConversationResponse = {
  id: string;
  startedAt: string;
};

type AddMessageResponse = {
  userMessage: {
    id: string;
    conversationId: string;
    role: "user";
    content: string;
    timestamp: string;
  };
  assistantMessage: {
    id: string;
    conversationId: string;
    role: "assistant";
    content: string;
    timestamp: string;
  };
};

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation<
    CreateConversationResponse,
    Error,
    { projectId: string; userId: string }
  >({
    mutationFn: async ({ projectId, userId }) => {
      const response = await fetch("/api/assistant/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId, userId }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to create conversation" }));
        throw new Error(
          errorData.details
            ? `${errorData.error}: ${errorData.details}`
            : errorData.error || "Failed to create conversation",
        );
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate conversations list to refetch
      queryClient.invalidateQueries({
        queryKey: ["assistant", "conversations", variables.projectId],
      });
    },
  });
}

export function useAddMessage() {
  const queryClient = useQueryClient();

  return useMutation<
    AddMessageResponse,
    Error,
    { conversationId: string; content: string }
  >({
    mutationFn: async ({ conversationId, content }) => {
      const response = await fetch(
        `/api/assistant/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to add message" }));
        throw new Error(
          errorData.details
            ? `${errorData.error}: ${errorData.details}`
            : errorData.error || "Failed to add message",
        );
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate conversation to refetch with new messages
      queryClient.invalidateQueries({
        queryKey: ["assistant", "conversation", variables.conversationId],
      });
    },
  });
}
