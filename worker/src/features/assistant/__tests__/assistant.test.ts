import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Request, Response } from "express";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { encrypt } from "@langfuse/shared/encryption";
import { LLMAdapter } from "@langfuse/shared";
import OpenAI from "openai";
import {
  getConversations,
  getConversationById,
  createConversation,
  addMessageToConversation,
} from "../controllers/assistant";

// Mock OpenAI
vi.mock("openai");

// Mock processEventBatch to avoid tracing errors in tests
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    processEventBatch: vi.fn().mockResolvedValue({
      successes: [],
      errors: [],
    }),
  };
});

describe("Assistant API Tests", () => {
  let projectId: string;
  let userId: string;
  let conversationId: string;
  let createdConversationIds: string[] = [];
  let createdUserIds: string[] = [];

  beforeEach(async () => {
    // Create test project and user
    const { projectId: createdProjectId } = await createOrgProjectAndApiKey();
    projectId = createdProjectId;
    userId = v4();
    createdConversationIds = [];
    createdUserIds = [];

    // Create a test user
    await prisma.user.create({
      data: {
        id: userId,
        name: "Test User",
        email: `test-${userId}@example.com`,
      },
    });
    createdUserIds.push(userId);

    // Create OpenAI API key for the project
    await prisma.llmApiKeys.create({
      data: {
        projectId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        secretKey: encrypt("test-api-key"),
        displaySecretKey: "test-api-key",
      },
    });

    // Create a test conversation
    const conversation = await prisma.conversation.create({
      data: {
        projectId,
        userId,
        startedAt: new Date(),
      },
    });
    conversationId = conversation.id;
    createdConversationIds.push(conversationId);

    // Clean up any existing messages
    await prisma.message.deleteMany({
      where: { conversationId },
    });
  });

  afterEach(async () => {
    // Clean up test data
    if (createdConversationIds.length > 0) {
      await prisma.message.deleteMany({
        where: {
          conversationId: {
            in: createdConversationIds,
          },
        },
      });
      await prisma.conversation.deleteMany({
        where: {
          id: {
            in: createdConversationIds,
          },
        },
      });
    }
    // Clean up users
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
      createdUserIds = [];
    }
  });

  describe("getConversations", () => {
    it("should return conversations for a project", async () => {
      const req = {
        query: { projectId },
      } as unknown as Request<{}, {}, {}, { projectId: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await getConversations(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          conversations: expect.arrayContaining([
            expect.objectContaining({
              id: conversationId,
              projectId,
              userId,
            }),
          ]),
        }),
      );
    });

    it("should filter conversations by userId when provided", async () => {
      // Create another user and their conversation
      const otherUserId = v4();
      await prisma.user.create({
        data: {
          id: otherUserId,
          name: "Other Test User",
          email: `other-${otherUserId}@example.com`,
        },
      });
      createdUserIds.push(otherUserId);
      const otherConversation = await prisma.conversation.create({
        data: {
          projectId,
          userId: otherUserId,
          startedAt: new Date(),
        },
      });
      createdConversationIds.push(otherConversation.id);

      const req = {
        query: { projectId, userId },
      } as unknown as Request<
        {},
        {},
        {},
        { projectId: string; userId: string }
      >;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await getConversations(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.conversations).toHaveLength(1);
      expect(jsonCall.conversations[0].userId).toBe(userId);
    });

    it("should return 400 if projectId is missing", async () => {
      const req = {
        query: {},
      } as unknown as Request<{}, {}, {}, { projectId: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await getConversations(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "projectId is required",
      });
    });
  });

  describe("getConversationById", () => {
    it("should return conversation with messages", async () => {
      // Create some messages
      await prisma.message.createMany({
        data: [
          {
            conversationId,
            sender: "USER",
            content: "Hello",
            timestamp: new Date(),
          },
          {
            conversationId,
            sender: "ASSISTANT",
            content: "Hi there!",
            timestamp: new Date(),
          },
        ],
      });

      const req = {
        params: { id: conversationId },
      } as unknown as Request<{ id: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await getConversationById(req, res);

      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: conversationId,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: "Hello",
            }),
            expect.objectContaining({
              role: "assistant",
              content: "Hi there!",
            }),
          ]),
        }),
      );
    });

    it("should return 404 if conversation not found", async () => {
      const req = {
        params: { id: v4() },
      } as unknown as Request<{ id: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await getConversationById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Conversation not found",
      });
    });

    it("should return messages in chronological order", async () => {
      const now = new Date();
      await prisma.message.createMany({
        data: [
          {
            conversationId,
            sender: "USER",
            content: "First",
            timestamp: new Date(now.getTime() - 2000),
          },
          {
            conversationId,
            sender: "ASSISTANT",
            content: "Second",
            timestamp: new Date(now.getTime() - 1000),
          },
          {
            conversationId,
            sender: "USER",
            content: "Third",
            timestamp: now,
          },
        ],
      });

      const req = {
        params: { id: conversationId },
      } as unknown as Request<{ id: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await getConversationById(req, res);

      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.messages).toHaveLength(3);
      expect(jsonCall.messages[0].content).toBe("First");
      expect(jsonCall.messages[1].content).toBe("Second");
      expect(jsonCall.messages[2].content).toBe("Third");
    });
  });

  describe("createConversation", () => {
    it("should create a new conversation", async () => {
      const req = {
        body: { projectId, userId },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await createConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall).toHaveProperty("id");
      expect(jsonCall).toHaveProperty("startedAt");

      // Track for cleanup
      createdConversationIds.push(jsonCall.id);

      // Verify conversation was created in database
      const conversation = await prisma.conversation.findUnique({
        where: { id: jsonCall.id },
      });
      expect(conversation).toBeTruthy();
      expect(conversation?.projectId).toBe(projectId);
      expect(conversation?.userId).toBe(userId);
    });

    it("should return 400 if projectId is missing", async () => {
      const req = {
        body: { userId },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await createConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "projectId and userId are required",
      });
    });

    it("should return 400 if userId is missing", async () => {
      const req = {
        body: { projectId },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await createConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "projectId and userId are required",
      });
    });
  });

  describe("addMessageToConversation", () => {
    it("should add user message and get assistant response", async () => {
      // Mock OpenAI response
      const mockCompletion = {
        choices: [
          {
            message: {
              content: "This is a test response",
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
        created: Math.floor(Date.now() / 1000),
      };

      const mockCreate = vi.fn().mockResolvedValue(mockCompletion);
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const req = {
        params: { id: conversationId },
        body: { content: "Hello, assistant!" },
      } as unknown as Request<{ id: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await addMessageToConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall).toHaveProperty("userMessage");
      expect(jsonCall).toHaveProperty("assistantMessage");
      expect(jsonCall.userMessage.content).toBe("Hello, assistant!");
      expect(jsonCall.assistantMessage.content).toBe("This is a test response");

      // Verify messages were saved to database
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: "asc" },
      });
      expect(messages).toHaveLength(2);
      expect(messages[0].sender).toBe("USER");
      expect(messages[0].content).toBe("Hello, assistant!");
      expect(messages[1].sender).toBe("ASSISTANT");
      expect(messages[1].content).toBe("This is a test response");

      // Verify OpenAI was called
      expect(mockCreate).toHaveBeenCalled();
    });

    it("should include conversation history in OpenAI call", async () => {
      // Create existing messages
      await prisma.message.createMany({
        data: [
          {
            conversationId,
            sender: "USER",
            content: "Previous message",
            timestamp: new Date(),
          },
          {
            conversationId,
            sender: "ASSISTANT",
            content: "Previous response",
            timestamp: new Date(),
          },
        ],
      });

      const mockCompletion = {
        choices: [
          {
            message: {
              content: "New response",
            },
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 5,
          total_tokens: 25,
        },
        created: Math.floor(Date.now() / 1000),
      };

      const mockCreate = vi.fn().mockResolvedValue(mockCompletion);
      (OpenAI as any).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const req = {
        params: { id: conversationId },
        body: { content: "New message" },
      } as unknown as Request<{ id: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await addMessageToConversation(req, res);

      // Verify OpenAI was called with full history
      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(3); // Previous user, previous assistant, new user
      expect(callArgs.messages[0].role).toBe("user");
      expect(callArgs.messages[0].content).toBe("Previous message");
      expect(callArgs.messages[1].role).toBe("assistant");
      expect(callArgs.messages[1].content).toBe("Previous response");
      expect(callArgs.messages[2].role).toBe("user");
      expect(callArgs.messages[2].content).toBe("New message");
    });

    it("should return 400 if content is missing", async () => {
      const req = {
        params: { id: conversationId },
        body: {},
      } as unknown as Request<{ id: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await addMessageToConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "content is required",
      });
    });

    it("should return 404 if conversation not found", async () => {
      const req = {
        params: { id: v4() },
        body: { content: "Hello" },
      } as unknown as Request<{ id: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await addMessageToConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Conversation not found",
      });
    });

    it("should return 400 if OpenAI API key not configured", async () => {
      // Create conversation in a project without OpenAI key
      const { projectId: otherProjectId } = await createOrgProjectAndApiKey();
      // User already exists from beforeEach, so we can reuse it
      const otherConversation = await prisma.conversation.create({
        data: {
          projectId: otherProjectId,
          userId,
          startedAt: new Date(),
        },
      });
      createdConversationIds.push(otherConversation.id);

      const req = {
        params: { id: otherConversation.id },
        body: { content: "Hello" },
      } as unknown as Request<{ id: string }>;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      await addMessageToConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "OpenAI API key not configured for this project",
      });
    });
  });
});
