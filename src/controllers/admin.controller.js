async function getUserRole(supabase, userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

    if (error) return null;
    return data?.role || null;
}

export default class Admin {
    // Get all pending expert approval requests
    static async getPendingRequests(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            // Check if requester is admin
            const requesterRole = await getUserRole(supabase, user.id);
            if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });

            const { data, error } = await supabase
                .from('expert_users')
                .select('expert_id, full_name, specialization, organization, contact_email, phone, pmdc_number, approval_status, created_at')
                .eq('approval_status', 'pending')
                .order('created_at', { ascending: true });

            if (error) return res.status(400).json({ message: 'Error fetching pending requests', error: error.message });

            res.status(200).json({
                message: 'Pending requests fetched successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching pending requests', error: error.message });
        }
    }

    // Get expert documents for review
    static async getExpertDocuments(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            // Check if requester is admin
            const requesterRole = await getUserRole(supabase, user.id);
            if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });

            const { expert_id } = req.params;
            if (!expert_id) return res.status(400).json({ message: 'Expert ID is required', status: false });

            const { data, error } = await supabase
                .from('expert_users')
                .select('expert_id, full_name, pmdc_number, profile_image_public_id, degree_doc_public_id, certificate_doc_public_id, approval_status')
                .eq('expert_id', expert_id)
                .single();

            if (error) return res.status(404).json({ message: 'Expert not found', error: error.message });

            // Only allow viewing documents for pending requests
            if (data.approval_status !== 'pending') {
                return res.status(400).json({ message: 'Can only view documents for pending requests', status: false });
            }

            res.status(200).json({
                message: 'Expert documents fetched successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching expert documents', error: error.message });
        }
    }

    // Approve an expert
    static async approveExpert(req, res) {
        try {
            const supabase = req.supabase;
            const { expert_id } = req.params;
            if (!expert_id) return res.status(400).json({ message: 'Expert ID is required', status: false });

            // Get admin ID from Authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ message: 'Unauthorized', status: false });

            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            // Check if requester is admin
            const requesterRole = await getUserRole(supabase, user.id);
            if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });

            console.log('Approving expert:', expert_id, 'by admin:', user.id);

            // Update expert_users table
            const { error: expertError } = await supabase
                .from('expert_users')
                .update({
                    approval_status: 'approved',
                    approved_at: new Date().toISOString(),
                    approved_by: user.id
                })
                .eq('expert_id', expert_id);

            console.log('Expert users update error:', expertError);
            if (expertError) return res.status(400).json({ message: 'Error approving expert', error: expertError.message });

            // Update profiles table
            const { error: profileError, data: profileData } = await supabase
                .from('profiles')
                .update({ is_approved: true })
                .eq('user_id', expert_id);

            console.log('Profiles update result:', { profileError, profileData });
            if (profileError) return res.status(400).json({ message: 'Error updating profile', error: profileError.message });

            res.status(200).json({
                message: 'Expert approved successfully',
                status: true
            });

        } catch (error) {
            console.error('Approve expert error:', error);
            res.status(500).json({ message: 'Error approving expert', error: error.message });
        }
    }

    // Reject an expert
    static async rejectExpert(req, res) {
        try {
            const supabase = req.supabase;
            const { expert_id } = req.params;
            const { reason } = req.body;

            if (!expert_id) return res.status(400).json({ message: 'Expert ID is required', status: false });

            // Get admin ID from Authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader) return res.status(401).json({ message: 'Unauthorized', status: false });

            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            // Check if requester is admin
            const requesterRole = await getUserRole(supabase, user.id);
            if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });

            console.log('Rejecting expert:', expert_id, 'by admin:', user.id);

            // Update expert_users table with rejected status
            const { error: expertError } = await supabase
                .from('expert_users')
                .update({
                    approval_status: 'rejected',
                    approved_at: new Date().toISOString(),
                    approved_by: user.id
                })
                .eq('expert_id', expert_id);

            console.log('Expert reject error:', expertError);
            if (expertError) return res.status(400).json({ message: 'Error rejecting expert', error: expertError.message });

            res.status(200).json({
                message: 'Expert rejected successfully',
                reason: reason || null,
                status: true
            });

        } catch (error) {
            console.error('Reject expert error:', error);
            res.status(500).json({ message: 'Error rejecting expert', error: error.message });
        }
    }

    // Get all approved experts
    static async getApprovedExperts(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            // Check if requester is admin
            const requesterRole = await getUserRole(supabase, user.id);
            if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });

            const { data, error } = await supabase
                .from('expert_users')
                .select('expert_id, full_name, specialization, organization, contact_email, phone, pmdc_number, approval_status, approved_at')
                .eq('approval_status', 'approved')
                .order('approved_at', { ascending: false });

            if (error) return res.status(400).json({ message: 'Error fetching approved experts', error: error.message });

            res.status(200).json({
                message: 'Approved experts fetched successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching approved experts', error: error.message });
        }
    }

    // Get all rejected experts
    static async getRejectedExperts(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            // Check if requester is admin
            const requesterRole = await getUserRole(supabase, user.id);
            if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });

            const { data, error } = await supabase
                .from('expert_users')
                .select('expert_id, full_name, specialization, organization, contact_email, phone, pmdc_number, approval_status, approved_at')
                .eq('approval_status', 'rejected')
                .order('approved_at', { ascending: false });

            if (error) return res.status(400).json({ message: 'Error fetching rejected experts', error: error.message });

            res.status(200).json({
                message: 'Rejected experts fetched successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching rejected experts', error: error.message });
        }
    }

    // Get approval statistics
    static async getApprovalStats(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            // Check if requester is admin
            const requesterRole = await getUserRole(supabase, user.id);
            if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });

            // Get counts for each status
            const { count: pendingCount } = await supabase
                .from('expert_users')
                .select('*', { count: 'exact', head: true })
                .eq('approval_status', 'pending');

            const { count: approvedCount } = await supabase
                .from('expert_users')
                .select('*', { count: 'exact', head: true })
                .eq('approval_status', 'approved');

            const { count: rejectedCount } = await supabase
                .from('expert_users')
                .select('*', { count: 'exact', head: true })
                .eq('approval_status', 'rejected');

            res.status(200).json({
                message: 'Approval statistics fetched successfully',
                data: {
                    pending: pendingCount || 0,
                    approved: approvedCount || 0,
                    rejected: rejectedCount || 0,
                    total: (pendingCount || 0) + (approvedCount || 0) + (rejectedCount || 0)
                },
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching approval statistics', error: error.message });
        }
    }
}
