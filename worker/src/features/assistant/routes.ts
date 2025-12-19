import express from "express";
import {
  getConversations,
  getConversationById,
  createConversation,
  addMessageToConversation,
} from "./controllers";

const assistantRoutes = express.Router();

assistantRoutes.get("/", getConversations);
assistantRoutes.get("/:id", getConversationById);
assistantRoutes.post("/", createConversation);
assistantRoutes.post("/:id/messages", addMessageToConversation);

export { assistantRoutes };
export default assistantRoutes;
