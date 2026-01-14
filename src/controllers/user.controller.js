import supabase from '../db/db.connect.js';

async function getUserRole(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

    if (error) return null;
    return data?.role || null;
}

export default class User {
    // Public signup for parents and experts. To create admins pass `role: 'admin'` and an admin Authorization header.
    static async signup(req, res) {
        try {
            const { email, password, full_name, phone, role = 'parent', specialization, organization, contact_email } = req.body;

            if (!email || !password || !full_name) {
                return res.status(400).json({ message: 'Email, password, and full name are required', status: false });
            }

            // If creating an admin role, ensure requester is an admin
            if (role === 'admin') {
                const token = req.headers.authorization?.split(' ')[1];
                if (!token) return res.status(401).json({ message: 'Admin token required to create admin role', status: false });

                const { data: { user: requester }, error: requesterError } = await supabase.auth.getUser(token);
                if (requesterError || !requester) return res.status(401).json({ message: 'Invalid admin token', status: false });

                const requesterRole = await getUserRole(requester.id);
                if (requesterRole !== 'admin') return res.status(403).json({ message: 'Only admins can create admins', status: false });
            }

            // Create auth user
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true
            });

            if (authError) {
                return res.status(400).json({ message: 'Error creating user', error: authError.message });
            }

            // Insert into profiles table
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([{ user_id: authData.user.id, role }]);

            if (profileError) {
                await supabase.auth.admin.deleteUser(authData.user.id);
                return res.status(400).json({ message: 'Error creating profile record', error: profileError.message });
            }

            // Insert into role-specific table
            let roleData = null;
            if (role === 'parent') {
                const { data: parentData, error: parentError } = await supabase
                    .from('parents')
                    .insert([{ user_id: authData.user.id, full_name, phone }])
                    .select();

                if (parentError) {
                    await supabase.auth.admin.deleteUser(authData.user.id);
                    return res.status(400).json({ message: 'Error creating parent profile', error: parentError.message });
                }

                // Sign in the user immediately after creation
                const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                if (signInError) {
                    return res.status(400).json({ message: 'User created but login failed', error: signInError.message });
                }

                roleData = { user: sessionData.user, session: sessionData.session, profile: parentData[0] };
                return res.status(201).json({ message: 'Parent created and logged in successfully', data: roleData, status: true });

            } else if (role === 'expert') {
                const { data: expertData, error: expertError } = await supabase
                    .from('expert_users')
                    .insert([{ expert_id: authData.user.id, full_name, specialization, organization, contact_email, phone }])
                    .select();

                if (expertError) {
                    await supabase.auth.admin.deleteUser(authData.user.id);
                    return res.status(400).json({ message: 'Error creating expert profile', error: expertError.message });
                }

                // Sign in the expert immediately after creation (like parents)
                const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                if (signInError) {
                    await supabase.auth.admin.deleteUser(authData.user.id);
                    return res.status(400).json({ message: 'Expert created but login failed', error: signInError.message });
                }

                roleData = expertData[0];
                return res.status(201).json({ message: 'Expert created and logged in successfully', data: { user: sessionData.user, session: sessionData.session, profile: roleData }, status: true });

            } else if (role === 'admin') {
                const { data: adminData, error: adminError } = await supabase
                    .from('admins')
                    .insert([{ admin_id: authData.user.id, full_name }])
                    .select();

                if (adminError) {
                    await supabase.auth.admin.deleteUser(authData.user.id);
                    return res.status(400).json({ message: 'Error creating admin profile', error: adminError.message });
                }

                roleData = adminData[0];
                return res.status(201).json({ message: 'Admin user created successfully', data: { user: authData.user, profile: roleData }, status: true });
            }

            // Fallback
            res.status(201).json({ message: 'User created', data: { user: authData.user }, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error creating user', error: error.message });
        }
    }

    static async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) return res.status(400).json({ message: 'Email and password are required', status: false });

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) return res.status(400).json({ message: 'Invalid credentials', error: error.message });

            res.status(200).json({ message: 'Login successful', data: { user: data.user, session: data.session }, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error logging in', error: error.message });
        }
    }

    // If query param `user_id` is provided, only admins can fetch other users' profiles
    static async getProfile(req, res) {
        try {
            const targetUserId = req.params.user_id || req.query.user_id || req.user.id;

            // If fetching another user's profile, check admin
            const requestedId = req.params.user_id || req.query.user_id;
            if (requestedId && requestedId !== req.user.id) {
                const requesterRole = await getUserRole(req.user.id);
                if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const role = await getUserRole(targetUserId);
            if (!role) return res.status(404).json({ message: 'Profile not found', status: false });

            let profile = null;
            if (role === 'parent') {
                const { data, error } = await supabase.from('parents').select('*').eq('user_id', targetUserId).single();
                if (error) return res.status(400).json({ message: 'Error fetching parent profile', error: error.message });
                profile = data;
            } else if (role === 'expert') {
                const { data, error } = await supabase.from('expert_users').select('*').eq('expert_id', targetUserId).single();
                if (error) return res.status(400).json({ message: 'Error fetching expert profile', error: error.message });
                profile = data;
            } else if (role === 'admin') {
                const { data, error } = await supabase.from('admins').select('*').eq('admin_id', targetUserId).single();
                if (error) return res.status(400).json({ message: 'Error fetching admin profile', error: error.message });
                profile = data;
            }

            res.status(200).json({ message: 'Profile fetched successfully', data: { role, profile }, status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching profile', error: error.message });
        }
    }

    // Update own profile (admins can update anyone by passing user_id and being admin)
    static async updateProfile(req, res) {
        try {
            const targetUserId = req.params.user_id || req.query.user_id || req.body.user_id || req.user.id;

            const requestedId = req.params.user_id || req.query.user_id || req.body.user_id;
            if (requestedId && requestedId !== req.user.id) {
                const requesterRole = await getUserRole(req.user.id);
                if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const role = await getUserRole(targetUserId);
            if (!role) return res.status(404).json({ message: 'Profile not found', status: false });

            let updates = {};
            if (role === 'parent') {
                const { full_name, phone } = req.body;
                if (full_name) updates.full_name = full_name;
                if (phone) updates.phone = phone;

                const { data, error } = await supabase.from('parents').update(updates).eq('user_id', targetUserId).select().single();
                if (error) return res.status(400).json({ message: 'Error updating parent profile', error: error.message });

                return res.status(200).json({ message: 'Profile updated successfully', data, status: true });

            } else if (role === 'expert') {
                const { full_name, specialization, organization, contact_email, phone } = req.body;
                if (full_name) updates.full_name = full_name;
                if (specialization) updates.specialization = specialization;
                if (organization) updates.organization = organization;
                if (contact_email) updates.contact_email = contact_email;
                if (phone) updates.phone = phone;

                const { data, error } = await supabase.from('expert_users').update(updates).eq('expert_id', targetUserId).select().single();
                if (error) return res.status(400).json({ message: 'Error updating expert profile', error: error.message });

                return res.status(200).json({ message: 'Profile updated successfully', data, status: true });

            } else if (role === 'admin') {
                const { full_name } = req.body;
                if (full_name) updates.full_name = full_name;

                const { data, error } = await supabase.from('admins').update(updates).eq('admin_id', targetUserId).select().single();
                if (error) return res.status(400).json({ message: 'Error updating admin profile', error: error.message });

                return res.status(200).json({ message: 'Profile updated successfully', data, status: true });
            }

        } catch (error) {
            res.status(500).json({ message: 'Error updating profile', error: error.message });
        }
    }

    // Delete a user/profile. Admins may pass `user_id` to delete another user.
    static async deleteProfile(req, res) {
        try {
            const targetUserId = req.params.user_id || req.query.user_id || req.body.user_id || req.user.id;

            const requestedId = req.params.user_id || req.query.user_id || req.body.user_id;
            if (requestedId && requestedId !== req.user.id) {
                const requesterRole = await getUserRole(req.user.id);
                if (requesterRole !== 'admin') return res.status(403).json({ message: 'Forbidden', status: false });
            }

            const role = await getUserRole(targetUserId);
            if (!role) return res.status(404).json({ message: 'Profile not found', status: false });

            // Delete role-specific entry first
            if (role === 'parent') {
                const { error } = await supabase.from('parents').delete().eq('user_id', targetUserId);
                if (error) return res.status(400).json({ message: 'Error deleting parent profile', error: error.message });
            } else if (role === 'expert') {
                const { error } = await supabase.from('expert_users').delete().eq('expert_id', targetUserId);
                if (error) return res.status(400).json({ message: 'Error deleting expert profile', error: error.message });
            } else if (role === 'admin') {
                const { error } = await supabase.from('admins').delete().eq('admin_id', targetUserId);
                if (error) return res.status(400).json({ message: 'Error deleting admin profile', error: error.message });
            }

            // Delete profile record
            const { error: profileError } = await supabase.from('profiles').delete().eq('user_id', targetUserId);
            if (profileError) return res.status(400).json({ message: 'Error deleting profile record', error: profileError.message });

            // Delete auth user
            const { error: authError } = await supabase.auth.admin.deleteUser(targetUserId);
            if (authError) return res.status(400).json({ message: 'Error deleting auth user', error: authError.message });

            res.status(200).json({ message: 'Profile deleted successfully', status: true });

        } catch (error) {
            res.status(500).json({ message: 'Error deleting profile', error: error.message });
        }
    }
}