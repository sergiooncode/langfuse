import type { NextApiRequest, NextApiResponse } from "next";
import { getServerAuthSession } from "@/src/server/auth";
import { proxyToWorker } from "../../utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const session = await getServerAuthSession({ req, res });

  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  const { content } = req.body;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Conversation ID is required" });
  }

  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "Content is required" });
  }

  const workerApiUrl =
    process.env.WORKER_API_URL ||
    process.env.NEXT_PUBLIC_WORKER_API_URL ||
    "http://localhost:3030";

  try {
    const url = `${workerApiUrl}/api/conversations/${id}/messages`;
    const response = await proxyToWorker(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    return res.status(201).json(data);
  } catch (error) {
    console.error("Error proxying to worker API:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to add message";
    return res.status(503).json({
      error: errorMessage,
      details:
        error instanceof Error &&
        error.message.includes("Worker API is not available")
          ? "The worker server may not be running. Please start it with 'pnpm run dev:worker'"
          : undefined,
    });
  }
}
