import Constants from '../constant.js';
import { cloudinary } from '../config/cloudinary-config.js';
import axios from 'axios';
import FormData from 'form-data';

export default class Speech {
    static async createSubmission(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'Audio file is required', status: false });
            }

            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { child_id, recording_duration_seconds, recording_format } = req.body;
            const parent_user_id = user.id;

            if (!child_id) {
                return res.status(400).json({ message: 'Child ID is required', status: false });
            }

            // Verify child belongs to parent
            const { data: childData, error: childError } = await supabase
                .from('children')
                .select('child_id')
                .eq('child_id', child_id)
                .eq('parent_user_id', parent_user_id)
                .single();

            if (childError || !childData) {
                return res.status(403).json({ message: 'Child not found or unauthorized', status: false });
            }

            // Extract public_id from Cloudinary file path
            // req.file.filename contains the public_id assigned by CloudinaryStorage
            const recording_public_id = req.file.filename;

            if (!recording_public_id) {
                return res.status(400).json({ message: 'Failed to upload audio file', status: false });
            }

            // Insert speech submission into database
            const { data: submissionData, error: submissionError } = await supabase
                .from('speech_submissions')
                .insert([
                    {
                        parent_user_id,
                        child_id,
                        recording_public_id,
                        recording_duration_seconds: recording_duration_seconds || null,
                        recording_format: recording_format || null
                    }
                ])
                .select()
                .single();

            if (submissionError) {
                // If DB insertion fails, delete the uploaded file from Cloudinary
                await cloudinary.uploader.destroy(`${recording_public_id}`);
                return res.status(400).json({
                    message: 'Error creating speech submission',
                    error: submissionError.message,
                    status: false
                });
            }

            try {
                const audioFileUrl = req.file.path || req.file.secure_url;

                if (audioFileUrl) {
                    console.log('Fetching audio from Cloudinary:', audioFileUrl);
                    
                    // Download audio file from Cloudinary as binary buffer
                    const audioResponse = await axios.get(audioFileUrl, {
                        responseType: 'arraybuffer',
                        timeout: 30000
                    });

                    // Create FormData matching curl format
                    const formData = new FormData();
                    formData.append(
                        'file',
                        Buffer.from(audioResponse.data),
                        {
                            filename: req.file.originalname || `${recording_public_id}.wav`,
                            contentType: 'audio/wav'  // Matches curl's type=audio/wav
                        }
                    );

                    console.log('Sending to prediction service...');
                    
                    // Send to prediction service with retry logic for ECONNRESET
                    let predictionResponse;
                    let retries = 3;
                    let lastError;

                    while (retries > 0) {
                        try {
                            predictionResponse = await axios.post(
                                'https://asd-speechanalysis.onrender.com/predict',
                                formData,
                                {
                                    headers: {
                                        ...formData.getHeaders(),  // Content-Type with boundary
                                        'accept': 'application/json'  // Matches curl
                                    },
                                    timeout: 120000,  // 2 minutes for cold start
                                    maxContentLength: Infinity,
                                    maxBodyLength: Infinity
                                }
                            );
                            console.log('Prediction successful!');
                            break;  // Success, exit retry loop
                        } catch (err) {
                            lastError = err;
                            retries--;
                            if (retries > 0) {
                                console.log(`Request failed, retrying... (${retries} attempts left)`);
                                console.log('Error:', err.code || err.message);
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }
                        }
                    }

                    if (!predictionResponse) {
                        throw lastError;
                    }

                    const predictionResult = predictionResponse.data;
                    console.log('Prediction result:', predictionResult);

                    const { error: speechResultError } = await supabase
                        .from('speech_results')
                        .insert([
                            {
                                speech_submission_id: submissionData.speech_submission_id,
                                parent_user_id,
                                child_id,
                                result: predictionResult
                            }
                        ]);

                    if (speechResultError) {
                        console.error('Failed to store speech prediction result:', speechResultError.message);
                    }
                }
            } catch (predictionError) {
                console.error('Speech prediction failed:', predictionError.message);
                if (predictionError.response) {
                    console.error('Response status:', predictionError.response.status);
                    console.error('Response data:', predictionError.response.data);
                } else if (predictionError.request) {
                    console.error('No response received from prediction service');
                } else if (predictionError.code === 'ECONNRESET') {
                    console.error('Connection reset - service may be cold starting');
                } else {
                    console.error('Error code:', predictionError.code);
                }
            }

            res.status(201).json({
                message: 'Speech submission created successfully',
                data: submissionData,
                status: true
            });

        } catch (error) {
            // Clean up uploaded file on error
            if (req.file?.filename) {
                try {
                    await cloudinary.uploader.destroy(`${req.file.filename}`);
                } catch (deleteErr) {
                    console.error('Error deleting file from Cloudinary:', deleteErr.message);
                }
            }

            res.status(500).json({
                message: 'Error creating speech submission',
                error: error.message,
                status: false
            });
        }
    }

    static async getSubmissions(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const parent_user_id = user.id;
            const { child_id } = req.query;

            let query = supabase
                .from('speech_submissions')
                .select('*, children(child_name), speech_results(*)')
                .eq('parent_user_id', parent_user_id)
                .order('submitted_at', { ascending: false });

            if (child_id) {
                query = query.eq('child_id', child_id);
            }

            const { data, error } = await query;

            if (error) {
                return res.status(400).json({
                    message: 'Error fetching speech submissions',
                    error: error.message,
                    status: false
                });
            }

            res.status(200).json({
                message: 'Speech submissions fetched successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: 'Error fetching speech submissions',
                error: error.message,
                status: false
            });
        }
    }

    static async getSubmission(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { submission_id } = req.params;
            const parent_user_id = user.id;

            const { data, error } = await supabase
                .from('speech_submissions')
                .select('*, children(child_name), speech_results(*)')
                .eq('speech_submission_id', submission_id)
                .eq('parent_user_id', parent_user_id)
                .single();

            if (error) {
                return res.status(400).json({
                    message: 'Error fetching speech submission',
                    error: error.message,
                    status: false
                });
            }

            if (!data) {
                return res.status(404).json({
                    message: 'Speech submission not found',
                    status: false
                });
            }

            res.status(200).json({
                message: 'Speech submission fetched successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: 'Error fetching speech submission',
                error: error.message,
                status: false
            });
        }
    }

    static async deleteSubmission(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { submission_id } = req.params;
            const parent_user_id = user.id;

            // Fetch the submission to get the public_id before deleting
            const { data: submissionData, error: fetchError } = await supabase
                .from('speech_submissions')
                .select('recording_public_id')
                .eq('speech_submission_id', submission_id)
                .eq('parent_user_id', parent_user_id)
                .single();

            if (fetchError || !submissionData) {
                return res.status(404).json({
                    message: 'Speech submission not found',
                    status: false
                });
            }

            // Delete from database
            const { error: deleteError } = await supabase
                .from('speech_submissions')
                .delete()
                .eq('speech_submission_id', submission_id)
                .eq('parent_user_id', parent_user_id);

            if (deleteError) {
                return res.status(400).json({
                    message: 'Error deleting speech submission',
                    error: deleteError.message,
                    status: false
                });
            }

            // Delete file from Cloudinary
            const { result } = await cloudinary.uploader.destroy(
                `${submissionData.recording_public_id}`
            );

            if (result !== 'ok') {
                console.warn(`Warning: File deletion from Cloudinary may have failed for public_id: ${submissionData.recording_public_id}`);
            }

            res.status(200).json({
                message: 'Speech submission deleted successfully',
                status: true
            });

        } catch (error) {
            res.status(500).json({
                message: 'Error deleting speech submission',
                error: error.message,
                status: false
            });
        }
    }
}

