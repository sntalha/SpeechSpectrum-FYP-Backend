async function getUserRole(supabase, userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

    if (error) return null;
    return data?.role || null;
}

async function enrichMessagesWithSenderInfo(supabase, messages) {
    if (!messages || messages.length === 0) return messages;

    // Get unique sender IDs
    const senderIds = [...new Set(messages.map(m => m.sender_id))];

    // Fetch all sender profiles
    const { data: senderProfiles, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, role')
        .in('user_id', senderIds);

    if (error || !senderProfiles) return messages;

    // Create a map for quick lookup
    const profileMap = {};
    senderProfiles.forEach(profile => {
        profileMap[profile.user_id] = profile;
    });

    // Enrich messages with sender info
    return messages.map(message => ({
        ...message,
        sender: profileMap[message.sender_id] || null
    }));
}

async function verifyConversationAccess(supabase, conversationId, userId, role) {
    // Get conversation and link details
    const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('conversation_id, link_id, expert_child_links!inner(expert_id, parent_user_id, child_id)')
        .eq('conversation_id', conversationId)
        .single();

    if (convError || !conversation) {
        return { hasAccess: false, conversation: null };
    }

    const link = conversation.expert_child_links;

    // Admin has access to all conversations
    if (role === 'admin') {
        return { hasAccess: true, conversation };
    }

    // Expert has access if they are the linked expert
    if (role === 'expert' && link.expert_id === userId) {
        return { hasAccess: true, conversation };
    }

    // Parent has access if they are the linked parent
    if (role === 'parent' && link.parent_user_id === userId) {
        return { hasAccess: true, conversation };
    }

    return { hasAccess: false, conversation: null };
}

export default class Chat {
    static async createConversation(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'expert') {
                return res.status(403).json({ message: 'Only experts can create conversations', status: false });
            }

            const { link_id } = req.body;
            if (!link_id) {
                return res.status(400).json({ message: 'link_id is required', status: false });
            }

            // Verify the link exists and the expert is part of it
            const { data: link, error: linkError } = await supabase
                .from('expert_child_links')
                .select('link_id, expert_id, child_id, parent_user_id')
                .eq('link_id', link_id)
                .eq('expert_id', user.id)
                .single();

            if (linkError || !link) {
                return res.status(404).json({ message: 'Link not found or you are not authorized', status: false });
            }

            // Check if conversation already exists
            const { data: existingConversation, error: existingError } = await supabase
                .from('conversations')
                .select('conversation_id, link_id, created_at')
                .eq('link_id', link_id)
                .maybeSingle();

            if (existingConversation) {
                return res.status(200).json({
                    message: 'Conversation already exists',
                    data: existingConversation,
                    status: true
                });
            }

            // Create new conversation
            const { data: conversation, error: convError } = await supabase
                .from('conversations')
                .insert([{ link_id }])
                .select()
                .single();

            if (convError) {
                return res.status(400).json({ message: 'Error creating conversation', error: convError.message, status: false });
            }

            res.status(201).json({
                message: 'Conversation created successfully',
                data: conversation,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error creating conversation', error: error.message, status: false });
        }
    }

    static async getConversation(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (!role) return res.status(403).json({ message: 'Forbidden', status: false });

            const { conversationId } = req.params;
            if (!conversationId) {
                return res.status(400).json({ message: 'conversationId is required', status: false });
            }

            // Verify access
            const { hasAccess, conversation } = await verifyConversationAccess(supabase, conversationId, user.id, role);
            if (!hasAccess) {
                return res.status(403).json({ message: 'Access denied to this conversation', status: false });
            }

            // Get full conversation details with link information
            const { data, error } = await supabase
                .from('conversations')
                .select('conversation_id, link_id, created_at, expert_child_links!inner(expert_id, child_id, parent_user_id, children(child_id, child_name), expert_users(expert_id, full_name, specialization))')
                .eq('conversation_id', conversationId)
                .single();

            if (error) {
                return res.status(400).json({ message: 'Error fetching conversation', error: error.message, status: false });
            }

            res.status(200).json({
                message: 'Conversation fetched successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching conversation', error: error.message, status: false });
        }
    }

    static async getMessages(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (!role) return res.status(403).json({ message: 'Forbidden', status: false });

            const { conversationId } = req.params;
            const { page = 1, limit = 50 } = req.query;

            if (!conversationId) {
                return res.status(400).json({ message: 'conversationId is required', status: false });
            }

            // Verify access
            const { hasAccess } = await verifyConversationAccess(supabase, conversationId, user.id, role);
            if (!hasAccess) {
                return res.status(403).json({ message: 'Access denied to this conversation', status: false });
            }

            const offset = (parseInt(page) - 1) * parseInt(limit);

            // Get messages
            const { data: messages, error: messagesError } = await supabase
                .from('messages')
                .select('message_id, conversation_id, sender_id, message_text, message_type, created_at')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true })
                .range(offset, offset + parseInt(limit) - 1);

            if (messagesError) {
                return res.status(400).json({ message: 'Error fetching messages', error: messagesError.message, status: false });
            }

            // Enrich messages with sender info
            const enrichedMessages = await enrichMessagesWithSenderInfo(supabase, messages);

            // Get total count for pagination
            const { count, error: countError } = await supabase
                .from('messages')
                .select('message_id', { count: 'exact', head: true })
                .eq('conversation_id', conversationId);

            res.status(200).json({
                message: 'Messages fetched successfully',
                data: enrichedMessages,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / parseInt(limit))
                },
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching messages', error: error.message, status: false });
        }
    }

    static async sendMessage(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (!role) return res.status(403).json({ message: 'Forbidden', status: false });

            const { conversationId } = req.params;
            const { message_text, message_type = 'text' } = req.body;

            if (!conversationId) {
                return res.status(400).json({ message: 'conversationId is required', status: false });
            }

            if (!message_text || message_text.trim() === '') {
                return res.status(400).json({ message: 'message_text is required', status: false });
            }

            // Verify access
            const { hasAccess } = await verifyConversationAccess(supabase, conversationId, user.id, role);
            if (!hasAccess) {
                return res.status(403).json({ message: 'Access denied to this conversation', status: false });
            }

            // Insert message
            const { data: message, error: messageError } = await supabase
                .from('messages')
                .insert([{
                    conversation_id: conversationId,
                    sender_id: user.id,
                    message_text,
                    message_type
                }])
                .select('message_id, conversation_id, sender_id, message_text, message_type, created_at')
                .single();

            if (messageError) {
                return res.status(400).json({ message: 'Error sending message', error: messageError.message, status: false });
            }

            // Enrich message with sender info
            const enrichedMessage = await enrichMessagesWithSenderInfo(supabase, [message]);

            res.status(201).json({
                message: 'Message sent successfully',
                data: enrichedMessage[0],
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error sending message', error: error.message, status: false });
        }
    }

    static async getParentConversations(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'parent') {
                return res.status(403).json({ message: 'Only parents can access this endpoint', status: false });
            }

            // Get all conversations for parent's links
            const { data, error } = await supabase
                .from('conversations')
                .select('conversation_id, link_id, created_at, expert_child_links!inner(expert_id, child_id, parent_user_id, children(child_id, child_name), expert_users(expert_id, full_name, specialization))')
                .eq('expert_child_links.parent_user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                return res.status(400).json({ message: 'Error fetching conversations', error: error.message, status: false });
            }

            res.status(200).json({
                message: 'Conversations fetched successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching conversations', error: error.message, status: false });
        }
    }

    static async getExpertConversations(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'expert') {
                return res.status(403).json({ message: 'Only experts can access this endpoint', status: false });
            }

            // Get all conversations for expert's links
            const { data, error } = await supabase
                .from('conversations')
                .select('conversation_id, link_id, created_at, expert_child_links!inner(expert_id, child_id, parent_user_id, children(child_id, child_name))')
                .eq('expert_child_links.expert_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                return res.status(400).json({ message: 'Error fetching conversations', error: error.message, status: false });
            }

            res.status(200).json({
                message: 'Conversations fetched successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching conversations', error: error.message, status: false });
        }
    }
}
