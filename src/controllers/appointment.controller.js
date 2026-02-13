import ZoomService from '../utils/zoom-service.js';

async function getUserRole(supabase, userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

    if (error) return null;
    return data?.role || null;
}

function normalizeAppointmentType(type) {
    const normalized = String(type).toLowerCase();
    if (normalized === 'google_meet') return 'meet';
    return normalized;
}

export default class Appointment {
    static async generateZoomLink(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'expert') return res.status(403).json({ message: 'Forbidden', status: false });

            const { topic, start_time, duration, timezone } = req.body;

            if (!topic || !start_time) {
                return res.status(400).json({ 
                    message: 'topic and start_time are required', 
                    status: false 
                });
            }

            // Validate start_time format
            const scheduledDate = new Date(start_time);
            if (isNaN(scheduledDate.getTime())) {
                return res.status(400).json({ 
                    message: 'Invalid start_time format. Use ISO 8601 format (e.g., 2026-02-12T10:00:00Z)', 
                    status: false 
                });
            }

            // Create Zoom meeting
            const meetingDetails = await ZoomService.createMeeting({
                topic,
                start_time,
                duration: duration || 30,
                timezone: timezone || 'UTC'
            });

            res.status(200).json({ 
                message: 'Zoom meeting link generated successfully', 
                data: {
                    join_url: meetingDetails.join_url,
                    meeting_id: meetingDetails.meeting_id,
                    password: meetingDetails.password
                }, 
                status: true 
            });

        } catch (error) {
            res.status(500).json({ 
                message: 'Error generating Zoom link', 
                error: error.message, 
                status: false 
            });
        }
    }

    static async createAppointment(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'expert') return res.status(403).json({ message: 'Forbidden', status: false });

            const { link_id, child_id, parent_user_id, appointment_type, scheduled_at, meet_link, contact, location } = req.body;
            if (!appointment_type || !scheduled_at) {
                return res.status(400).json({ message: 'appointment_type and scheduled_at are required', status: false });
            }

            const normalizedType = normalizeAppointmentType(appointment_type);
            if (!['chat', 'call', 'physical', 'google_meet'].includes(String(appointment_type).toLowerCase())) {
                return res.status(400).json({ message: 'appointment_type must be chat, call, physical, or google_meet', status: false });
            }

            const scheduledDate = new Date(scheduled_at);
            if (isNaN(scheduledDate.getTime())) {
                return res.status(400).json({ message: 'Invalid scheduled_at format', status: false });
            }

            let resolvedLinkId = link_id;
            if (!resolvedLinkId) {
                if (!child_id || !parent_user_id) {
                    return res.status(400).json({ message: 'link_id or child_id and parent_user_id are required', status: false });
                }

                const { data: link, error: linkError } = await supabase
                    .from('expert_child_links')
                    .select('link_id')
                    .eq('expert_id', user.id)
                    .eq('child_id', child_id)
                    .eq('parent_user_id', parent_user_id)
                    .single();

                if (linkError || !link) {
                    return res.status(404).json({ message: 'Expert-child link not found', status: false });
                }

                resolvedLinkId = link.link_id;
            }

            // Prepare appointment data
            const appointmentData = {
                link_id: resolvedLinkId,
                appointment_type: normalizedType,
                scheduled_at
            };

            // Add meet_link if provided (for Zoom/Google Meet appointments)
            if (meet_link) {
                appointmentData.meet_link = meet_link;
            }

            // Add contact if provided (for on call appointments)
            if (contact) {
                appointmentData.contact = contact;
            }

            // Add location if provided (for physical appointments)
            if (location) {
                appointmentData.location = location;
            }

            const { data, error } = await supabase
                .from('appointments')
                .insert([appointmentData])
                .select()
                .single();

            if (error) {
                return res.status(400).json({ message: 'Error creating appointment', error: error.message, status: false });
            }

            res.status(201).json({ message: 'Appointment created successfully', data, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error creating appointment', error: error.message, status: false });
        }
    }

    static async getParentAppointments(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'parent') return res.status(403).json({ message: 'Forbidden', status: false });

            const { data, error } = await supabase
                .from('appointments')
                .select('appointment_id, appointment_type, scheduled_at, status, created_at, expert_child_links ( link_id, parent_user_id, child_id, expert_id, children ( child_id, child_name ), expert_users ( expert_id, full_name, specialization, organization, contact_email, phone ) )')
                .eq('expert_child_links.parent_user_id', user.id)
                .order('scheduled_at', { ascending: false });

            if (error) {
                return res.status(400).json({ message: 'Error fetching appointments', error: error.message, status: false });
            }

            res.status(200).json({ message: 'Appointments fetched successfully', data, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching appointments', error: error.message, status: false });
        }
    }

    static async getExpertAppointments(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'expert') return res.status(403).json({ message: 'Forbidden', status: false });

            const { data, error } = await supabase
                .from('appointments')
                .select('appointment_id, appointment_type, scheduled_at, status, created_at, expert_child_links ( link_id, parent_user_id, child_id, expert_id, children ( child_id, child_name ) )')
                .eq('expert_child_links.expert_id', user.id)
                .order('scheduled_at', { ascending: false });

            if (error) {
                return res.status(400).json({ message: 'Error fetching appointments', error: error.message, status: false });
            }

            res.status(200).json({ message: 'Appointments fetched successfully', data, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching appointments', error: error.message, status: false });
        }
    }

    static async addAppointmentNotes(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'expert') return res.status(403).json({ message: 'Forbidden', status: false });

            const { id: appointment_id } = req.params;
            const { discussion_summary, notes, medication } = req.body;

            if (!discussion_summary && !notes && !medication) {
                return res.status(400).json({ message: 'discussion_summary, notes, or medication is required', status: false });
            }

            const { data: appointment, error: appointmentError } = await supabase
                .from('appointments')
                .select('appointment_id, link_id, expert_child_links ( expert_id )')
                .eq('appointment_id', appointment_id)
                .single();

            if (appointmentError || !appointment) {
                return res.status(404).json({ message: 'Appointment not found', status: false });
            }

            if (appointment.expert_child_links?.expert_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { data: existingRecord, error: existingError } = await supabase
                .from('appointment_records')
                .select('record_id')
                .eq('appointment_id', appointment_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (existingError) {
                return res.status(400).json({ message: 'Error checking appointment record', error: existingError.message, status: false });
            }

            const updates = {};
            if (discussion_summary !== undefined) updates.therapy_plan = discussion_summary;
            if (notes !== undefined) updates.notes = notes;
            if (medication !== undefined) updates.medication = medication;

            let recordData = null;
            if (existingRecord) {
                const { data, error } = await supabase
                    .from('appointment_records')
                    .update(updates)
                    .eq('record_id', existingRecord.record_id)
                    .select()
                    .single();

                if (error) {
                    return res.status(400).json({ message: 'Error updating appointment record', error: error.message, status: false });
                }
                recordData = data;
            } else {
                const { data, error } = await supabase
                    .from('appointment_records')
                    .insert([
                        {
                            appointment_id,
                            therapy_plan: discussion_summary ?? null,
                            notes: notes ?? null,
                            medication: medication ?? null
                        }
                    ])
                    .select()
                    .single();

                if (error) {
                    return res.status(400).json({ message: 'Error creating appointment record', error: error.message, status: false });
                }
                recordData = data;
            }

            res.status(200).json({ message: 'Appointment notes saved successfully', data: recordData, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error saving appointment notes', error: error.message, status: false });
        }
    }

    static async getAppointmentDetails(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (!['parent', 'expert', 'admin'].includes(role)) return res.status(403).json({ message: 'Forbidden', status: false });

            const { id: appointment_id } = req.params;

            const { data: appointment, error: appointmentError } = await supabase
                .from('appointments')
                .select('appointment_id, appointment_type, scheduled_at, status, created_at, expert_child_links ( link_id, parent_user_id, child_id, expert_id, children ( child_id, child_name ), expert_users ( expert_id, full_name, specialization, organization, contact_email, phone ) )')
                .eq('appointment_id', appointment_id)
                .single();

            if (appointmentError || !appointment) {
                return res.status(404).json({ message: 'Appointment not found', status: false });
            }

            if (role === 'parent' && appointment.expert_child_links?.parent_user_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            if (role === 'expert' && appointment.expert_child_links?.expert_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { data: records, error: recordsError } = await supabase
                .from('appointment_records')
                .select('record_id, notes, therapy_plan, medication, progress_feedback, created_at')
                .eq('appointment_id', appointment_id)
                .order('created_at', { ascending: false });

            if (recordsError) {
                return res.status(400).json({ message: 'Error fetching appointment details', error: recordsError.message, status: false });
            }

            res.status(200).json({
                message: 'Appointment details fetched successfully',
                data: { appointment, records },
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching appointment details', error: error.message, status: false });
        }
    }

    static async addFeedback(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'expert') return res.status(403).json({ message: 'Forbidden', status: false });

            const { id: appointment_id } = req.params;
            const { progress_feedback } = req.body;

            if (!progress_feedback) {
                return res.status(400).json({ message: 'progress_feedback is required', status: false });
            }

            const { data: appointment, error: appointmentError } = await supabase
                .from('appointments')
                .select('appointment_id, link_id, expert_child_links ( expert_id )')
                .eq('appointment_id', appointment_id)
                .single();

            if (appointmentError || !appointment) {
                return res.status(404).json({ message: 'Appointment not found', status: false });
            }

            if (appointment.expert_child_links?.expert_id !== user.id) {
                return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const { data: existingRecord, error: existingError } = await supabase
                .from('appointment_records')
                .select('record_id')
                .eq('appointment_id', appointment_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (existingError) {
                return res.status(400).json({ message: 'Error checking appointment record', error: existingError.message, status: false });
            }

            let recordData = null;
            if (existingRecord) {
                const { data, error } = await supabase
                    .from('appointment_records')
                    .update({ progress_feedback })
                    .eq('record_id', existingRecord.record_id)
                    .select()
                    .single();

                if (error) {
                    return res.status(400).json({ message: 'Error updating appointment feedback', error: error.message, status: false });
                }
                recordData = data;
            } else {
                const { data, error } = await supabase
                    .from('appointment_records')
                    .insert([{ appointment_id, progress_feedback }])
                    .select()
                    .single();

                if (error) {
                    return res.status(400).json({ message: 'Error creating appointment feedback', error: error.message, status: false });
                }
                recordData = data;
            }

            res.status(200).json({ message: 'Feedback saved successfully', data: recordData, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error saving feedback', error: error.message, status: false });
        }
    }

    static async getParentFeedback(req, res) {
        try {
            const supabase = req.supabase;
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) return res.status(401).json({ message: 'Unauthorized', status: false });

            const role = await getUserRole(supabase, user.id);
            if (role !== 'parent') return res.status(403).json({ message: 'Forbidden', status: false });

            const { data, error } = await supabase
                .from('appointment_records')
                .select('record_id, progress_feedback, created_at, appointments ( appointment_id, scheduled_at, appointment_type, status, expert_child_links ( link_id, parent_user_id, child_id, expert_id, children ( child_id, child_name ), expert_users ( expert_id, full_name, specialization, organization, contact_email, phone ) ) )')
                .not('progress_feedback', 'is', null)
                .eq('appointments.expert_child_links.parent_user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                return res.status(400).json({ message: 'Error fetching feedback history', error: error.message, status: false });
            }

            res.status(200).json({ message: 'Feedback history fetched successfully', data, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching feedback history', error: error.message, status: false });
        }
    }
}
