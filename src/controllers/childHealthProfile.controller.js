import crypto from 'crypto';
import { cloudinary } from '../config/cloudinary-config.js';

const ALLOWED_PROFILE_FIELDS = [
    'blood_group',
    'known_allergies',
    'family_history_asd',
    'family_history_speech_disorders',
    'family_history_hearing_loss',
    'genetic_disorders',
    'chronic_conditions',
    'weight_kg',
    'height_cm',
    'medical_records',
    'current_prescriptions'
];

const ALLOWED_DOCUMENT_TYPES = [
    'lab_result',
    'prescription',
    'hearing_test',
    'vision_test',
    'previous_report',
    'referral_letter',
    'school_report',
    'other'
];

const EXPERT_CHILD_ACCESS_STATUSES = ['scheduled', 'confirmed'];

function buildProfilePayload(body = {}) {
    const payload = {};

    for (const field of ALLOWED_PROFILE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
            payload[field] = body[field];
        }
    }

    return payload;
}

function normalizeMedicalRecords(records) {
    return Array.isArray(records) ? records : [];
}

async function cleanupUploadedDocument(publicId) {
    if (!publicId) {
        return;
    }

    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (cleanupError) {
        console.warn(`Warning: Failed to clean up uploaded file from Cloudinary for public_id: ${publicId}`);
    }
}

async function getChildById(supabase, child_id) {
    const { data: child, error } = await supabase
        .from('children')
        .select('child_id, parent_user_id, child_name, date_of_birth, gender, created_at')
        .eq('child_id', child_id)
        .maybeSingle();

    return { child, error };
}

async function canExpertAccessChild(supabase, expertId, childId) {
    const { data, error } = await supabase
        .from('appointments')
        .select('appointment_id')
        .eq('expert_id', expertId)
        .eq('child_id', childId)
        .in('status', EXPERT_CHILD_ACCESS_STATUSES)
        .limit(1)
        .maybeSingle();

    return { allowed: !!data, error };
}

export default class ChildHealthProfile {
    static async createOrUpdateProfile(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { data: profile, error: roleError } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', user.id)
                .single();
            if (roleError || !profile?.role) return res.status(403).json({ message: 'Forbidden', status: false });
            if (profile.role !== 'parent') return res.status(403).json({ message: 'Forbidden', status: false });

            const { child_id } = req.params;

            if (!child_id) {
                return res.status(400).json({ message: 'child_id is required', status: false });
            }

            const { child, error: childError } = await getChildById(supabase, child_id);

            if (childError) {
                return res.status(400).json({
                    message: 'Error verifying child ownership',
                    error: childError.message,
                    status: false
                });
            }

            if (!child) {
                return res.status(404).json({ message: 'Child not found', status: false });
            }

            if (child.parent_user_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const payload = {
                child_id,
                ...buildProfilePayload(req.body)
            };

            const { data, error } = await supabase
                .from('child_health_profiles')
                .upsert(payload, { onConflict: 'child_id' })
                .select(`
                    *,
                    children (
                        child_id,
                        child_name,
                        date_of_birth,
                        gender,
                        parent_user_id,
                        created_at
                    )
                `)
                .single();

            if (error) {
                return res.status(400).json({
                    message: 'Error saving child health profile',
                    error: error.message,
                    status: false
                });
            }

            return res.status(200).json({
                message: 'Child health profile saved successfully',
                data,
                status: true
            });
        } catch (error) {
            console.error('Error in createOrUpdateProfile:', error);
            return res.status(500).json({
                message: 'Error saving child health profile',
                error: error.message,
                status: false
            });
        }
    }

    static async getProfile(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { data: profile, error: roleError } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', user.id)
                .single();
            if (roleError || !profile?.role) return res.status(403).json({ message: 'Forbidden', status: false });
            if (!['parent', 'expert'].includes(profile.role)) return res.status(403).json({ message: 'Forbidden', status: false });

            const { child_id } = req.params;

            if (!child_id) {
                return res.status(400).json({ message: 'child_id is required', status: false });
            }

            const { child, error: childError } = await getChildById(supabase, child_id);

            if (childError) {
                return res.status(400).json({
                    message: 'Error validating child',
                    error: childError.message,
                    status: false
                });
            }

            if (!child) {
                return res.status(404).json({ message: 'Child not found', status: false });
            }

            if (profile.role === 'parent' && child.parent_user_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            if (profile.role === 'expert') {
                const { allowed, error: accessError } = await canExpertAccessChild(supabase, user.id, child_id);

                if (accessError) {
                    return res.status(400).json({
                        message: 'Error validating child access',
                        error: accessError.message,
                        status: false
                    });
                }

                if (!allowed) {
                    return res.status(403).json({
                        message: 'Experts can only access child profiles for scheduled or confirmed appointments',
                        status: false
                    });
                }
            }

            const { data, error } = await supabase
                .from('child_health_profiles')
                .select(`
                    *,
                    children (
                        child_id,
                        child_name,
                        date_of_birth,
                        gender,
                        parent_user_id,
                        created_at
                    )
                `)
                .eq('child_id', child_id)
                .maybeSingle();

            if (error) {
                return res.status(400).json({
                    message: 'Error fetching child health profile',
                    error: error.message,
                    status: false
                });
            }

            return res.status(200).json({
                message: 'Child health profile fetched successfully',
                data: data || null,
                status: true
            });
        } catch (error) {
            console.error('Error in getProfile:', error);
            return res.status(500).json({
                message: 'Error fetching child health profile',
                error: error.message,
                status: false
            });
        }
    }

    static async updateProfile(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { data: profile, error: roleError } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', user.id)
                .single();
            if (roleError || !profile?.role) return res.status(403).json({ message: 'Forbidden', status: false });
            if (profile.role !== 'parent') return res.status(403).json({ message: 'Forbidden', status: false });

            const { child_id } = req.params;

            if (!child_id) {
                return res.status(400).json({ message: 'child_id is required', status: false });
            }

            const { child, error: childError } = await getChildById(supabase, child_id);

            if (childError) {
                return res.status(400).json({
                    message: 'Error verifying child ownership',
                    error: childError.message,
                    status: false
                });
            }

            if (!child) {
                return res.status(404).json({ message: 'Child not found', status: false });
            }

            if (child.parent_user_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const updates = buildProfilePayload(req.body);

            if (!Object.keys(updates).length) {
                return res.status(400).json({
                    message: 'No valid profile fields provided for update',
                    status: false
                });
            }

            const { data, error } = await supabase
                .from('child_health_profiles')
                .update(updates)
                .eq('child_id', child_id)
                .select(`
                    *,
                    children (
                        child_id,
                        child_name,
                        date_of_birth,
                        gender,
                        parent_user_id,
                        created_at
                    )
                `)
                .maybeSingle();

            if (error) {
                return res.status(400).json({
                    message: 'Error updating child health profile',
                    error: error.message,
                    status: false
                });
            }

            if (!data) {
                return res.status(404).json({ message: 'Child health profile not found', status: false });
            }

            return res.status(200).json({
                message: 'Child health profile updated successfully',
                data,
                status: true
            });
        } catch (error) {
            console.error('Error in updateProfile:', error);
            return res.status(500).json({
                message: 'Error updating child health profile',
                error: error.message,
                status: false
            });
        }
    }

    static async deleteProfile(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { data: profile, error: roleError } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', user.id)
                .single();
            if (roleError || !profile?.role) return res.status(403).json({ message: 'Forbidden', status: false });
            if (profile.role !== 'parent') return res.status(403).json({ message: 'Forbidden', status: false });

            const { child_id } = req.params;

            if (!child_id) {
                return res.status(400).json({ message: 'child_id is required', status: false });
            }

            const { child, error: childError } = await getChildById(supabase, child_id);

            if (childError) {
                return res.status(400).json({
                    message: 'Error verifying child ownership',
                    error: childError.message,
                    status: false
                });
            }

            if (!child) {
                return res.status(404).json({ message: 'Child not found', status: false });
            }

            if (child.parent_user_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { data: existingProfile, error: existingError } = await supabase
                .from('child_health_profiles')
                .select('profile_id, medical_records')
                .eq('child_id', child_id)
                .maybeSingle();

            if (existingError) {
                return res.status(400).json({
                    message: 'Error fetching child health profile',
                    error: existingError.message,
                    status: false
                });
            }

            if (!existingProfile) {
                return res.status(404).json({ message: 'Child health profile not found', status: false });
            }

            const medicalRecords = normalizeMedicalRecords(existingProfile.medical_records);

            for (const doc of medicalRecords) {
                if (!doc?.public_id) {
                    continue;
                }

                try {
                    await cloudinary.uploader.destroy(doc.public_id);
                } catch (cloudinaryError) {
                    console.warn(`Warning: Failed to delete Cloudinary file for public_id: ${doc.public_id}`);
                }
            }

            const { error } = await supabase
                .from('child_health_profiles')
                .delete()
                .eq('child_id', child_id);

            if (error) {
                return res.status(400).json({
                    message: 'Error deleting child health profile',
                    error: error.message,
                    status: false
                });
            }

            return res.status(200).json({
                message: 'Child health profile deleted successfully',
                status: true
            });
        } catch (error) {
            console.error('Error in deleteProfile:', error);
            return res.status(500).json({
                message: 'Error deleting child health profile',
                error: error.message,
                status: false
            });
        }
    }

    static async addMedicalRecord(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                if (req.file?.filename) await cleanupUploadedDocument(req.file.filename);
                return res.status(401).json({ message: 'Unauthorized', status: false });
            }

            const { data: profile, error: roleError } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', user.id)
                .single();
            if (roleError || !profile?.role) {
                if (req.file?.filename) await cleanupUploadedDocument(req.file.filename);
                return res.status(403).json({ message: 'Forbidden', status: false });
            }
            if (profile.role !== 'parent') {
                if (req.file?.filename) await cleanupUploadedDocument(req.file.filename);
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { child_id } = req.params;
            const { document_type, file_name } = req.body;

            if (!child_id) {
                if (req.file?.filename) await cleanupUploadedDocument(req.file.filename);
                return res.status(400).json({ message: 'child_id is required', status: false });
            }

            if (!req.file?.filename) {
                return res.status(400).json({ message: 'Document file is required', status: false });
            }

            const normalizedDocumentType = String(document_type || '').trim().toLowerCase();

            if (!normalizedDocumentType || !ALLOWED_DOCUMENT_TYPES.includes(normalizedDocumentType)) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(400).json({
                    message: 'Invalid document_type provided',
                    status: false
                });
            }

            const { child, error: childError } = await getChildById(supabase, child_id);

            if (childError) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(400).json({
                    message: 'Error verifying child ownership',
                    error: childError.message,
                    status: false
                });
            }

            if (!child) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(404).json({ message: 'Child not found', status: false });
            }

            if (child.parent_user_id !== user.id) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { data: existingProfile, error: existingError } = await supabase
                .from('child_health_profiles')
                .select('profile_id, child_id, medical_records')
                .eq('child_id', child_id)
                .maybeSingle();

            if (existingError) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(400).json({
                    message: 'Error fetching child health profile',
                    error: existingError.message,
                    status: false
                });
            }

            const existingRecords = normalizeMedicalRecords(existingProfile?.medical_records);

            const newDocument = {
                document_id: crypto.randomUUID(),
                document_type: normalizedDocumentType,
                public_id: req.file.filename,
                file_name: file_name || req.file.originalname,
                uploaded_at: new Date().toISOString()
            };

            const updatedRecords = [...existingRecords, newDocument];

            let data;
            let error;

            if (existingProfile) {
                const updateResult = await supabase
                    .from('child_health_profiles')
                    .update({ medical_records: updatedRecords })
                    .eq('child_id', child_id)
                    .select(`
                        *,
                        children (
                            child_id,
                            child_name,
                            date_of_birth,
                            gender,
                            parent_user_id,
                            created_at
                        )
                    `)
                    .single();

                data = updateResult.data;
                error = updateResult.error;
            } else {
                const insertResult = await supabase
                    .from('child_health_profiles')
                    .insert([{ child_id, medical_records: [newDocument] }])
                    .select(`
                        *,
                        children (
                            child_id,
                            child_name,
                            date_of_birth,
                            gender,
                            parent_user_id,
                            created_at
                        )
                    `)
                    .single();

                data = insertResult.data;
                error = insertResult.error;
            }

            if (error) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(400).json({
                    message: 'Error adding medical record',
                    error: error.message,
                    status: false
                });
            }

            return res.status(201).json({
                message: 'Medical record added successfully',
                data,
                status: true
            });
        } catch (error) {
            console.error('Error in addMedicalRecord:', error);

            if (req.file?.filename) {
                await cleanupUploadedDocument(req.file.filename);
            }

            return res.status(500).json({
                message: 'Error adding medical record',
                error: error.message,
                status: false
            });
        }
    }

    static async deleteMedicalRecord(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const { data: profile, error: roleError } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', user.id)
                .single();
            if (roleError || !profile?.role) return res.status(403).json({ message: 'Forbidden', status: false });
            if (profile.role !== 'parent') return res.status(403).json({ message: 'Forbidden', status: false });

            const { child_id, document_id } = req.params;

            if (!child_id || !document_id) {
                return res.status(400).json({
                    message: 'child_id and document_id are required',
                    status: false
                });
            }

            const { child, error: childError } = await getChildById(supabase, child_id);

            if (childError) {
                return res.status(400).json({
                    message: 'Error verifying child ownership',
                    error: childError.message,
                    status: false
                });
            }

            if (!child) {
                return res.status(404).json({ message: 'Child not found', status: false });
            }

            if (child.parent_user_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { data: existingProfile, error: existingError } = await supabase
                .from('child_health_profiles')
                .select('profile_id, child_id, medical_records')
                .eq('child_id', child_id)
                .maybeSingle();

            if (existingError) {
                return res.status(400).json({
                    message: 'Error fetching child health profile',
                    error: existingError.message,
                    status: false
                });
            }

            if (!existingProfile) {
                return res.status(404).json({ message: 'Child health profile not found', status: false });
            }

            const records = normalizeMedicalRecords(existingProfile.medical_records);
            const documentToDelete = records.find((doc) => doc?.document_id === document_id);

            if (!documentToDelete) {
                return res.status(404).json({ message: 'Medical record not found', status: false });
            }

            if (documentToDelete.public_id) {
                try {
                    await cloudinary.uploader.destroy(documentToDelete.public_id);
                } catch (cloudinaryError) {
                    console.warn(`Warning: Failed to delete Cloudinary file for public_id: ${documentToDelete.public_id}`);
                }
            }

            const filteredRecords = records.filter((doc) => doc?.document_id !== document_id);

            const { data, error } = await supabase
                .from('child_health_profiles')
                .update({ medical_records: filteredRecords })
                .eq('child_id', child_id)
                .select(`
                    *,
                    children (
                        child_id,
                        child_name,
                        date_of_birth,
                        gender,
                        parent_user_id,
                        created_at
                    )
                `)
                .single();

            if (error) {
                return res.status(400).json({
                    message: 'Error deleting medical record',
                    error: error.message,
                    status: false
                });
            }

            return res.status(200).json({
                message: 'Medical record deleted successfully',
                data,
                status: true
            });
        } catch (error) {
            console.error('Error in deleteMedicalRecord:', error);
            return res.status(500).json({
                message: 'Error deleting medical record',
                error: error.message,
                status: false
            });
        }
    }

    static async replaceMedicalRecord(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                if (req.file?.filename) await cleanupUploadedDocument(req.file.filename);
                return res.status(401).json({ message: 'Unauthorized', status: false });
            }

            const { data: profile, error: roleError } = await supabase
                .from('profiles')
                .select('role')
                .eq('user_id', user.id)
                .single();
            if (roleError || !profile?.role) {
                if (req.file?.filename) await cleanupUploadedDocument(req.file.filename);
                return res.status(403).json({ message: 'Forbidden', status: false });
            }
            if (profile.role !== 'parent') {
                if (req.file?.filename) await cleanupUploadedDocument(req.file.filename);
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { child_id, document_id } = req.params;
            const { file_name } = req.body;

            if (!child_id || !document_id) {
                if (req.file?.filename) await cleanupUploadedDocument(req.file.filename);
                return res.status(400).json({
                    message: 'child_id and document_id are required',
                    status: false
                });
            }

            if (!req.file?.filename) {
                return res.status(400).json({ message: 'Document file is required', status: false });
            }

            const { child, error: childError } = await getChildById(supabase, child_id);

            if (childError) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(400).json({
                    message: 'Error verifying child ownership',
                    error: childError.message,
                    status: false
                });
            }

            if (!child) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(404).json({ message: 'Child not found', status: false });
            }

            if (child.parent_user_id !== user.id) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { data: existingProfile, error: existingError } = await supabase
                .from('child_health_profiles')
                .select('profile_id, child_id, medical_records')
                .eq('child_id', child_id)
                .maybeSingle();

            if (existingError) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(400).json({
                    message: 'Error fetching child health profile',
                    error: existingError.message,
                    status: false
                });
            }

            if (!existingProfile) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(404).json({ message: 'Child health profile not found', status: false });
            }

            const records = normalizeMedicalRecords(existingProfile.medical_records);
            const existingIndex = records.findIndex((doc) => doc?.document_id === document_id);

            if (existingIndex === -1) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(404).json({ message: 'Medical record not found', status: false });
            }

            const existingDocument = records[existingIndex];

            if (existingDocument.public_id) {
                try {
                    await cloudinary.uploader.destroy(existingDocument.public_id);
                } catch (cloudinaryError) {
                    console.warn(`Warning: Failed to delete old Cloudinary file for public_id: ${existingDocument.public_id}`);
                }
            }

            const replacementDocument = {
                ...existingDocument,
                document_id: existingDocument.document_id,
                document_type: existingDocument.document_type,
                public_id: req.file.filename,
                file_name: file_name || req.file.originalname || existingDocument.file_name,
                uploaded_at: new Date().toISOString()
            };

            const updatedRecords = records.map((doc, index) => (
                index === existingIndex ? replacementDocument : doc
            ));

            const { data, error } = await supabase
                .from('child_health_profiles')
                .update({ medical_records: updatedRecords })
                .eq('child_id', child_id)
                .select(`
                    *,
                    children (
                        child_id,
                        child_name,
                        date_of_birth,
                        gender,
                        parent_user_id,
                        created_at
                    )
                `)
                .single();

            if (error) {
                await cleanupUploadedDocument(req.file.filename);
                return res.status(400).json({
                    message: 'Error replacing medical record',
                    error: error.message,
                    status: false
                });
            }

            return res.status(200).json({
                message: 'Medical record replaced successfully',
                data,
                status: true
            });
        } catch (error) {
            console.error('Error in replaceMedicalRecord:', error);

            if (req.file?.filename) {
                await cleanupUploadedDocument(req.file.filename);
            }

            return res.status(500).json({
                message: 'Error replacing medical record',
                error: error.message,
                status: false
            });
        }
    }
}
