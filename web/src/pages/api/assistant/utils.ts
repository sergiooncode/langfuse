/**
 * Helper function to proxy requests to the worker API with robust error handling
 */
export async function proxyToWorker(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    // Check if it's a connection error
    if (
      error instanceof Error &&
      (error.cause as any)?.code === "ECONNREFUSED"
    ) {
      throw new Error(
        "Worker API is not available. Please ensure the worker server is running.",
      );
    }

    // Check if it's a timeout
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request to worker API timed out");
    }

    // Re-throw other errors
    throw error;
  }
}
