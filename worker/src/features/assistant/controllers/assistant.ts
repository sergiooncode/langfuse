import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import OpenAI from "openai";
import { decrypt } from "@langfuse/shared/encryption";
import { LLMAdapter } from "@langfuse/shared";
import {
  processEventBatch,
  eventTypes,
  type IngestionEventType,
  logger,
} from "@langfuse/shared/src/server";

export const getConversations = async (
  req: Request<{}, {}, {}, { projectId: string; userId?: string }>,
  res: Response,
): Promise<void> => {
  const { projectId, userId } = req.query;

  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }

  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        projectId,
        ...(userId && { userId }),
      },
      orderBy: {
        startedAt: "desc",
      },
      select: {
        id: true,
        userId: true,
        startedAt: true,
        projectId: true,
        messages: {
          take: 1,
          orderBy: {
            timestamp: "asc",
          },
          select: {
            content: true,
          },
        },
      },
    });

    res.json({
      conversations: conversations.map((conv) => ({
        id: conv.id,
        userId: conv.userId,
        projectId: conv.projectId,
        startedAt: conv.startedAt.toISOString(),
        firstMessagePreview: conv.messages[0]?.content || null,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

export const getConversationById = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: {
            timestamp: "asc",
          },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json({
      id: conversation.id,
      startedAt: conversation.startedAt.toISOString(),
      messages: conversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.sender === "USER" ? "user" : "assistant",
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
};

export const createConversation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId, userId } = req.body;

  if (!projectId || !userId) {
    res.status(400).json({ error: "projectId and userId are required" });
    return;
  }

  try {
    const conversation = await prisma.conversation.create({
      data: {
        projectId,
        userId,
        startedAt: new Date(),
      },
    });

    res.status(201).json({
      id: conversation.id,
      startedAt: conversation.startedAt.toISOString(),
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
};

export const addMessageToConversation = async (
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }

  try {
    // Verify conversation exists and get projectId
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: {
            timestamp: "asc",
          },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Get OpenAI API key for the project
    const apiKeyRecord = await prisma.llmApiKeys.findFirst({
      where: {
        projectId: conversation.projectId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
      },
    });

    if (!apiKeyRecord) {
      res.status(400).json({
        error: "OpenAI API key not configured for this project",
      });
      return;
    }

    // Decrypt the API key
    const apiKey = decrypt(apiKeyRecord.secretKey);

    // Create user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId: id,
        sender: "USER",
        content: content.trim(),
        timestamp: new Date(),
      },
    });

    // Convert conversation history to OpenAI message format
    const openaiMessages = conversation.messages.map((msg) => ({
      role: msg.sender === "USER" ? ("user" as const) : ("assistant" as const),
      content: msg.content,
    }));

    // Add the new user message
    openaiMessages.push({
      role: "user",
      content: content.trim(),
    });

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    // Create trace ID for Langfuse tracing
    const traceId = randomUUID();
    const generationId = randomUUID();
    const startTime = new Date().toISOString();

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const endTime = new Date().toISOString();
    const completionStartTime = completion.created
      ? new Date(completion.created * 1000).toISOString()
      : startTime;

    // Extract assistant response
    const assistantContent =
      completion.choices[0]?.message?.content || "No response generated";

    // Extract usage from OpenAI response
    const usage = completion.usage
      ? {
          input: completion.usage.prompt_tokens ?? null,
          output: completion.usage.completion_tokens ?? null,
          total: completion.usage.total_tokens ?? null,
          unit: "TOKENS" as const,
        }
      : null;

    // Save assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: id,
        sender: "ASSISTANT",
        content: assistantContent,
        timestamp: new Date(),
      },
    });

    // Create Langfuse trace and generation events
    const traceEvent: IngestionEventType = {
      id: randomUUID(),
      type: eventTypes.TRACE_CREATE,
      timestamp: startTime,
      body: {
        id: traceId,
        timestamp: startTime,
        name: `Assistant Conversation: ${id}`,
        userId: conversation.userId,
        input: {
          conversationId: id,
          messages: openaiMessages,
        },
        output: {
          assistantMessage: assistantContent,
        },
        metadata: {
          conversationId: id,
          model: "gpt-4o-mini",
        },
        environment: "production",
      },
    };

    const generationEvent: IngestionEventType = {
      id: randomUUID(),
      type: eventTypes.GENERATION_CREATE,
      timestamp: startTime,
      body: {
        id: generationId,
        traceId: traceId,
        name: "OpenAI Chat Completion",
        startTime: startTime,
        endTime: endTime,
        completionStartTime: completionStartTime,
        model: "gpt-4o-mini",
        modelParameters: {
          temperature: 0.7,
          max_tokens: 1000,
        },
        input: openaiMessages,
        output: assistantContent,
        usage: usage,
        usageDetails: usage
          ? {
              input: usage.input,
              output: usage.output,
              total: usage.total,
              unit: usage.unit,
            }
          : undefined,
        costDetails: undefined,
        metadata: {
          conversationId: id,
          messageId: assistantMessage.id,
        },
        environment: "production",
      },
    };

    // Send events to Langfuse for tracing
    try {
      const traceResult = await processEventBatch(
        [traceEvent, generationEvent],
        {
          validKey: true,
          scope: {
            projectId: conversation.projectId,
            accessLevel: "project",
          },
        },
        {
          isLangfuseInternal: true,
          source: "assistant",
        },
      );

      if (traceResult.errors.length > 0) {
        logger.warn("Some trace events failed to process", {
          errors: traceResult.errors,
          conversationId: id,
          traceId,
        });
      } else {
        logger.info("Successfully created trace for assistant conversation", {
          conversationId: id,
          traceId,
          generationId,
        });
      }
    } catch (traceError) {
      // Log but don't fail the request if tracing fails
      logger.error("Error creating Langfuse trace", {
        error: traceError,
        conversationId: id,
        traceId,
      });
    }

    // Return both messages
    res.status(201).json({
      userMessage: {
        id: userMessage.id,
        conversationId: userMessage.conversationId,
        role: "user",
        content: userMessage.content,
        timestamp: userMessage.timestamp.toISOString(),
      },
      assistantMessage: {
        id: assistantMessage.id,
        conversationId: assistantMessage.conversationId,
        role: "assistant",
        content: assistantMessage.content,
        timestamp: assistantMessage.timestamp.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error adding message:", error);
    res.status(500).json({
      error: "Failed to add message",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
