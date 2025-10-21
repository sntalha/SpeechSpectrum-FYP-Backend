import supabase from '../db/db.connect.js';

export default class QuestionnaireSubmission {
    static async createSubmission(req, res) {
        try {
            const { child_id, responses } = req.body;
            const parent_id = req.user.id;

            if (!child_id || !responses) {
                return res.status(400).json({
                    message: "Child ID and responses are required",
                    status: false
                });
            }

            // Verify child belongs to parent
            const { data: childData, error: childError } = await supabase
                .from('children')
                .select('child_id')
                .eq('child_id', child_id)
                .eq('parent_id', parent_id)
                .single();

            if (childError || !childData) {
                return res.status(403).json({
                    message: "Child not found or unauthorized",
                    status: false
                });
            }

            const { data, error } = await supabase
                .from('questionnaire_submissions')
                .insert([
                    { parent_id, child_id, responses }
                ])
                .select()
                .single();

            if (error) {
                return res.status(400).json({
                    message: "Error creating submission",
                    error: error.message,
                    status: false
                });
            }

            res.status(201).json({
                message: "Questionnaire submitted successfully",
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error submitting questionnaire",
                error: error.message,
                status: false
            });
        }
    }

    static async getSubmissions(req, res) {
        try {
            const parent_id = req.user.id;
            const { child_id } = req.query;

            let query = supabase
                .from('questionnaire_submissions')
                .select('*, children(child_name)')
                .eq('parent_id', parent_id);

            if (child_id) {
                query = query.eq('child_id', child_id);
            }

            const { data, error } = await query;

            if (error) {
                return res.status(400).json({
                    message: "Error fetching submissions",
                    error: error.message,
                    status: false
                });
            }

            res.status(200).json({
                message: "Submissions fetched successfully",
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error fetching submissions",
                error: error.message,
                status: false
            });
        }
    }

    static async getSubmission(req, res) {
        try {
            const { submission_id } = req.params;
            const parent_id = req.user.id;

            const { data, error } = await supabase
                .from('questionnaire_submissions')
                .select('*, children(child_name)')
                .eq('submission_id', submission_id)
                .eq('parent_id', parent_id)
                .single();

            if (error) {
                return res.status(400).json({
                    message: "Error fetching submission",
                    error: error.message,
                    status: false
                });
            }

            if (!data) {
                return res.status(404).json({
                    message: "Submission not found",
                    status: false
                });
            }

            res.status(200).json({
                message: "Submission fetched successfully",
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error fetching submission",
                error: error.message,
                status: false
            });
        }
    }

    static async updateSubmission(req, res) {
        try {
            const { submission_id } = req.params;
            const parent_id = req.user.id;
            const { responses } = req.body;

            if (!responses) {
                return res.status(400).json({
                    message: "Responses are required for update",
                    status: false
                });
            }

            const { data, error } = await supabase
                .from('questionnaire_submissions')
                .update({ responses })
                .eq('submission_id', submission_id)
                .eq('parent_id', parent_id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({
                    message: "Error updating submission",
                    error: error.message,
                    status: false
                });
            }

            res.status(200).json({
                message: "Submission updated successfully",
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error updating submission",
                error: error.message,
                status: false
            });
        }
    }

    static async deleteSubmission(req, res) {
        try {
            const { submission_id } = req.params;
            const parent_id = req.user.id;

            const { error } = await supabase
                .from('questionnaire_submissions')
                .delete()
                .eq('submission_id', submission_id)
                .eq('parent_id', parent_id);

            if (error) {
                return res.status(400).json({
                    message: "Error deleting submission",
                    error: error.message,
                    status: false
                });
            }

            res.status(200).json({
                message: "Submission deleted successfully",
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: "Error deleting submission",
                error: error.message,
                status: false
            });
        }
    }
}