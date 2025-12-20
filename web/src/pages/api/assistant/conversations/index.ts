import type { NextApiRequest, NextApiResponse } from "next";
import { getServerAuthSession } from "@/src/server/auth";
import { proxyToWorker } from "../utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const session = await getServerAuthSession({ req, res });

  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const workerApiUrl =
    process.env.WORKER_API_URL ||
    process.env.NEXT_PUBLIC_WORKER_API_URL ||
    "http://localhost:3030";

  if (req.method === "GET") {
    const { projectId, userId } = req.query;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ error: "projectId is required" });
    }

    try {
      const params = new URLSearchParams({ projectId });
      if (userId && typeof userId === "string") {
        params.append("userId", userId);
      }

      const url = `${workerApiUrl}/api/conversations?${params.toString()}`;
      const response = await proxyToWorker(url);

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      return res.status(200).json(data);
    } catch (error) {
      console.error("Error proxying to worker API:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to fetch conversations";
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

  if (req.method === "POST") {
    const { projectId, userId } = req.body;

    if (!projectId || !userId) {
      return res
        .status(400)
        .json({ error: "projectId and userId are required" });
    }

    try {
      const url = `${workerApiUrl}/api/conversations`;
      const response = await proxyToWorker(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId, userId }),
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
        error instanceof Error
          ? error.message
          : "Failed to create conversation";
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

  return res.status(405).json({ error: "Method not allowed" });
}
