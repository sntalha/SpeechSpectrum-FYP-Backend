import supabase from '../db/db.connect.js';

export default class QuestionnaireSubmission {
    static async createSubmission(req, res) {
        try {
            const { child_id, responses } = req.body;
            const parent_user_id = req.user.id;

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
                .eq('parent_user_id', parent_user_id)
                .single();

            if (childError || !childData) {
                return res.status(403).json({
                    message: "Child not found or unauthorized",
                    status: false
                });
            }

            // Insert submission as before
            const { data: submissionData, error: submissionError } = await supabase
                .from('questionnaire_submissions')
                .insert([
                    { parent_user_id, child_id, responses }
                ])
                .select()
                .single();

            if (submissionError) {
                return res.status(400).json({
                    message: "Error creating submission",
                    error: submissionError.message,
                    status: false
                });
            }

            // Prepare payload for prediction endpoint. We assume `responses` contains keys expected by the predictor
            // (A1..A10, Age_Mons, Sex, Family_mem_with_ASD, Jaundice). If not present, prediction will still be attempted
            // with whatever is available.
            const predictPayload = {
                A1: responses?.A1 ?? responses?.a1 ?? null,
                A2: responses?.A2 ?? responses?.a2 ?? null,
                A3: responses?.A3 ?? responses?.a3 ?? null,
                A4: responses?.A4 ?? responses?.a4 ?? null,
                A5: responses?.A5 ?? responses?.a5 ?? null,
                A6: responses?.A6 ?? responses?.a6 ?? null,
                A7: responses?.A7 ?? responses?.a7 ?? null,
                A8: responses?.A8 ?? responses?.a8 ?? null,
                A9: responses?.A9 ?? responses?.a9 ?? null,
                A10: responses?.A10 ?? responses?.a10 ?? null,
                Age_Mons: responses?.Age_Mons ?? responses?.age_mons ?? responses?.ageMonths ?? null,
                Sex: responses?.Sex ?? responses?.sex ?? null,
                Family_mem_with_ASD: responses?.Family_mem_with_ASD ?? responses?.family_mem_with_ASD ?? null,
                Jaundice: responses?.Jaundice ?? responses?.jaundice ?? null
            };

            let resultRecord = null;

            try {
                // Call local prediction service. Assumption: Node runtime provides global fetch (Node 18+).
                const resp = await fetch('http://127.0.0.1:5000/predict', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(predictPayload)
                });

                if (!resp.ok) throw new Error(`Prediction service returned ${resp.status}`);

                const prediction = await resp.json();

                // Store prediction result in questionnaire_results table
                const { data: resultData, error: resultError } = await supabase
                    .from('questionnaire_results')
                    .insert([
                        {
                            submission_id: submissionData.submission_id,
                            parent_user_id,
                            child_id,
                            result: prediction
                        }
                    ])
                    .select()
                    .single();

                if (resultError) {
                    // Prediction succeeded but storing failed. Return submission with a note.
                    return res.status(201).json({
                        message: "Submission created but failed to store prediction result",
                        submission: submissionData,
                        result: null,
                        error: resultError.message,
                        status: false
                    });
                }

                resultRecord = resultData;

            } catch (predErr) {
                // If prediction failed, still return the submission but notify the client
                return res.status(201).json({
                    message: "Submission created but prediction failed",
                    submission: submissionData,
                    result: null,
                    error: predErr.message,
                    status: true
                });
            }

            // Success: return both submission and result
            res.status(201).json({
                message: "Questionnaire submitted and prediction stored successfully",
                submission: submissionData,
                result: resultRecord,
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
            const parent_user_id = req.user.id;
            const { child_id } = req.query;

            let query = supabase
                .from('questionnaire_submissions')
                // Select submission fields and include child name and linked results
                .select('*, children(child_name), questionnaire_results(*)')
                .eq('parent_user_id', parent_user_id);

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
            const parent_user_id = req.user.id;

            const { data, error } = await supabase
                .from('questionnaire_submissions')
                .select('*, children(child_name), questionnaire_results(*)')
                .eq('submission_id', submission_id)
                .eq('parent_user_id', parent_user_id)
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

    static async deleteSubmission(req, res) {
        try {
            const { submission_id } = req.params;
            const parent_user_id = req.user.id;

            const { error } = await supabase
                .from('questionnaire_submissions')
                .delete()
                .eq('submission_id', submission_id)
                .eq('parent_user_id', parent_user_id);

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