import { Router } from 'express';
import Chat from '../controllers/chat.controller.js';
import { supabaseClientMiddleware } from '../middlewares/auth-middleware.js';

const router = Router();

router.use(supabaseClientMiddleware);

// Create conversation (expert only)
router.post('/create', Chat.createConversation);

// Get conversations list
router.get('/parent', Chat.getParentConversations);
router.get('/expert', Chat.getExpertConversations);

// Conversation details and messages
router.get('/:conversationId', Chat.getConversation);
router.get('/:conversationId/messages', Chat.getMessages);

// Send message
router.post('/:conversationId/message', Chat.sendMessage);

export default router;
