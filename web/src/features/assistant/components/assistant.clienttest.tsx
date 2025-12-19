/**
 * @fileoverview UI Tests for Assistant Feature
 *
 * Tests covering:
 * - Starting a conversation
 * - Sending a message
 * - Rendering responses
 */

import React from "react";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { ConversationListSidebar } from "./ConversationListSidebar";
import { ChatView } from "./ChatView";

// Mock next-auth
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}));

// Mock next/router
jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

// Mock the assistant hooks
jest.mock("../hooks/useConversations", () => ({
  useConversations: jest.fn(),
}));

jest.mock("../hooks/useConversation", () => ({
  useConversation: jest.fn(),
}));

jest.mock("../hooks/useConversationMutations", () => ({
  useCreateConversation: jest.fn(),
  useAddMessage: jest.fn(),
}));

import { useConversations } from "../hooks/useConversations";
import { useConversation } from "../hooks/useConversation";
import {
  useCreateConversation,
  useAddMessage,
} from "../hooks/useConversationMutations";

// Test data
const mockProjectId = "test-project-id";
const mockUserId = "test-user-id";
const mockConversationId = "test-conversation-id";

const mockConversation = {
  id: mockConversationId,
  startedAt: new Date().toISOString(),
  messages: [],
};

const mockUserMessage = {
  id: "user-msg-1",
  role: "user" as const,
  content: "Hello, assistant!",
  timestamp: new Date().toISOString(),
};

const mockAssistantMessage = {
  id: "assistant-msg-1",
  role: "assistant" as const,
  content: "Hello! How can I help you today?",
  timestamp: new Date().toISOString(),
};

// Helper to create a new QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

// Wrapper component with QueryClientProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("Assistant UI Tests", () => {
  const mockUseConversations = useConversations as jest.MockedFunction<
    typeof useConversations
  >;
  const mockUseConversation = useConversation as jest.MockedFunction<
    typeof useConversation
  >;
  const mockUseCreateConversation =
    useCreateConversation as jest.MockedFunction<typeof useCreateConversation>;
  const mockUseAddMessage = useAddMessage as jest.MockedFunction<
    typeof useAddMessage
  >;
  const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;
  const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock window.matchMedia for useIsMobile hook
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(), // deprecated
        removeListener: jest.fn(), // deprecated
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    // Mock scrollIntoView for ChatView component
    Element.prototype.scrollIntoView = jest.fn();

    // Default session mock
    mockUseSession.mockReturnValue({
      data: {
        user: { id: mockUserId },
      },
      status: "authenticated",
    } as any);

    // Default router mock
    mockUseRouter.mockReturnValue({
      query: { projectId: mockProjectId },
    } as any);
  });

  describe("Starting a Conversation", () => {
    it("should create a new conversation when clicking 'New Conversation' button", () => {
      const mockMutateAsync = jest.fn().mockResolvedValue({
        id: mockConversationId,
        startedAt: new Date().toISOString(),
      });
      const mockOnNewConversation = jest.fn();

      // Mock empty conversations list
      mockUseConversations.mockReturnValue({
        data: { conversations: [] },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      // Mock create conversation mutation
      mockUseCreateConversation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ConversationListSidebar
            projectId={mockProjectId}
            userId={mockUserId}
            selectedConversationId={undefined}
            onSelectConversation={jest.fn()}
            onNewConversation={mockOnNewConversation}
          />
        </TestWrapper>,
      );

      // Find and click "New Conversation" button
      const newConversationButton = screen.getByRole("button", {
        name: /new conversation/i,
      });
      expect(newConversationButton).toBeInTheDocument();

      fireEvent.click(newConversationButton);

      // Verify the callback was called
      expect(mockOnNewConversation).toHaveBeenCalledTimes(1);
    });

    it("should display existing conversations in the sidebar", () => {
      const mockConversations = [
        {
          id: "conv-1",
          userId: mockUserId,
          projectId: mockProjectId,
          startedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        },
        {
          id: "conv-2",
          userId: mockUserId,
          projectId: mockProjectId,
          startedAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        },
      ];

      mockUseConversations.mockReturnValue({
        data: { conversations: mockConversations },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      } as any);

      render(
        <TestWrapper>
          <ConversationListSidebar
            projectId={mockProjectId}
            userId={mockUserId}
            selectedConversationId={undefined}
            onSelectConversation={jest.fn()}
            onNewConversation={jest.fn()}
          />
        </TestWrapper>,
      );

      // Check that conversations are displayed
      expect(screen.getByText(/conv-1/i)).toBeInTheDocument();
      expect(screen.getByText(/conv-2/i)).toBeInTheDocument();
    });
  });

  describe("Sending a Message", () => {
    it("should send a message when user types and clicks send", async () => {
      const mockMutateAsync = jest.fn().mockResolvedValue({
        userMessage: mockUserMessage,
        assistantMessage: mockAssistantMessage,
      });

      // Mock conversation with empty messages initially
      mockUseConversation.mockReturnValue({
        data: {
          ...mockConversation,
          messages: [],
        },
        isLoading: false,
        error: null,
      } as any);

      // Mock add message mutation
      mockUseAddMessage.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      // Find input and send button
      const input = screen.getByLabelText(
        /message input/i,
      ) as HTMLTextAreaElement;
      const sendButton = screen.getByRole("button", { name: /send message/i });

      expect(input).toBeInTheDocument();
      expect(sendButton).toBeInTheDocument();

      // Type a message
      fireEvent.change(input, { target: { value: "Hello, assistant!" } });

      // Click send button
      fireEvent.click(sendButton);

      // Verify mutation was called with correct parameters
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          conversationId: mockConversationId,
          content: "Hello, assistant!",
        });
      });
    });

    it("should send a message when user presses Enter", async () => {
      const mockMutateAsync = jest.fn().mockResolvedValue({
        userMessage: mockUserMessage,
        assistantMessage: mockAssistantMessage,
      });

      mockUseConversation.mockReturnValue({
        data: {
          ...mockConversation,
          messages: [],
        },
        isLoading: false,
        error: null,
      } as any);

      mockUseAddMessage.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      const input = screen.getByLabelText(
        /message input/i,
      ) as HTMLTextAreaElement;

      // Type a message and press Enter
      fireEvent.change(input, { target: { value: "Test message" } });
      fireEvent.keyDown(input, {
        key: "Enter",
        code: "Enter",
        shiftKey: false,
      });

      // Verify mutation was called
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          conversationId: mockConversationId,
          content: "Test message",
        });
      });
    });

    it("should not send message when Shift+Enter is pressed", () => {
      const mockMutateAsync = jest.fn();

      mockUseConversation.mockReturnValue({
        data: {
          ...mockConversation,
          messages: [],
        },
        isLoading: false,
        error: null,
      } as any);

      mockUseAddMessage.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      const input = screen.getByLabelText(
        /message input/i,
      ) as HTMLTextAreaElement;

      // Type a message and press Shift+Enter (should create new line, not send)
      fireEvent.change(input, { target: { value: "Line 1" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });

      // Verify mutation was NOT called
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it("should disable send button when input is empty", () => {
      mockUseConversation.mockReturnValue({
        data: {
          ...mockConversation,
          messages: [],
        },
        isLoading: false,
        error: null,
      } as any);

      mockUseAddMessage.mockReturnValue({
        mutateAsync: jest.fn(),
        isPending: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toBeDisabled();
    });
  });

  describe("Rendering Responses", () => {
    it("should display user and assistant messages", () => {
      mockUseConversation.mockReturnValue({
        data: {
          ...mockConversation,
          messages: [mockUserMessage, mockAssistantMessage],
        },
        isLoading: false,
        error: null,
      } as any);

      mockUseAddMessage.mockReturnValue({
        mutateAsync: jest.fn(),
        isPending: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      // Check user message is displayed
      expect(screen.getByText("Hello, assistant!")).toBeInTheDocument();
      // Check for "You" label (exact match, case-sensitive to avoid matching "you" in message content)
      const userLabels = screen.getAllByText("You");
      expect(userLabels.length).toBeGreaterThan(0);

      // Check assistant message is displayed
      expect(
        screen.getByText("Hello! How can I help you today?"),
      ).toBeInTheDocument();
      expect(screen.getByText("Assistant")).toBeInTheDocument();
    });

    it("should display timestamps on messages", () => {
      mockUseConversation.mockReturnValue({
        data: {
          ...mockConversation,
          messages: [mockUserMessage, mockAssistantMessage],
        },
        isLoading: false,
        error: null,
      } as any);

      mockUseAddMessage.mockReturnValue({
        mutateAsync: jest.fn(),
        isPending: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      // Check that time elements exist (timestamps)
      const timeElements = screen.getAllByRole("time");
      expect(timeElements.length).toBeGreaterThan(0);
    });

    it("should show loading indicator when sending message", () => {
      mockUseConversation.mockReturnValue({
        data: {
          ...mockConversation,
          messages: [],
        },
        isLoading: false,
        error: null,
      } as any);

      mockUseAddMessage.mockReturnValue({
        mutateAsync: jest.fn(),
        isPending: true, // Message is being sent
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      // Check for loading indicator
      expect(screen.getByText(/assistant is typing/i)).toBeInTheDocument();
    });

    it("should display empty state when no messages", () => {
      mockUseConversation.mockReturnValue({
        data: {
          ...mockConversation,
          messages: [],
        },
        isLoading: false,
        error: null,
      } as any);

      mockUseAddMessage.mockReturnValue({
        mutateAsync: jest.fn(),
        isPending: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      expect(
        screen.getByText(/no messages yet. start the conversation/i),
      ).toBeInTheDocument();
    });

    it("should display error state when conversation fails to load", () => {
      mockUseConversation.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: "Failed to load conversation" } as Error,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      expect(
        screen.getByText(/failed to load conversation/i),
      ).toBeInTheDocument();
    });
  });

  describe("Message Ordering", () => {
    it("should display messages in chronological order", () => {
      const olderMessage = {
        ...mockUserMessage,
        id: "msg-1",
        timestamp: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      };
      const newerMessage = {
        ...mockAssistantMessage,
        id: "msg-2",
        timestamp: new Date().toISOString(), // now
      };

      mockUseConversation.mockReturnValue({
        data: {
          ...mockConversation,
          messages: [olderMessage, newerMessage],
        },
        isLoading: false,
        error: null,
      } as any);

      mockUseAddMessage.mockReturnValue({
        mutateAsync: jest.fn(),
        isPending: false,
        error: null,
      } as any);

      render(
        <TestWrapper>
          <ChatView conversationId={mockConversationId} />
        </TestWrapper>,
      );

      const messages = screen.getAllByRole("article");
      expect(messages.length).toBe(2);

      // First message should be the older one
      expect(
        within(messages[0]).getByText(olderMessage.content),
      ).toBeInTheDocument();
      // Second message should be the newer one
      expect(
        within(messages[1]).getByText(newerMessage.content),
      ).toBeInTheDocument();
    });
  });
});
