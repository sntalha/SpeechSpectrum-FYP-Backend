import supabase from '../db/db.connect.js';

export default class User {
    static async signup(req, res) {
        try {
            const { email, password, full_name, phone } = req.body;
            
            if (!email || !password || !full_name) {
                return res.status(400).json({ 
                    message: 'Email, password, and full name are required', 
                    status: false 
                });
            }

            // Create user with Supabase Auth Admin API
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true // Automatically confirms the email
            });

            if (authError) {
                return res.status(400).json({ 
                    message: 'Error creating user', 
                    error: authError.message 
                });
            }

            // Insert additional user data into parents table
            const { data: parentData, error: parentError } = await supabase
                .from('parents')
                .insert([{
                    parent_id: authData.user.id,
                    full_name,
                    email,
                    phone
                }])
                .select();

            if (parentError) {
                // If parent profile creation fails, delete the auth user
                await supabase.auth.admin.deleteUser(authData.user.id);
                return res.status(400).json({ 
                    message: 'Error creating parent profile', 
                    error: parentError.message 
                });
            }

            // Sign in the user immediately after creation
            const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (signInError) {
                return res.status(400).json({ 
                    message: 'User created but login failed', 
                    error: signInError.message 
                });
            }

            res.status(201).json({
                message: 'User created and logged in successfully',
                data: { 
                    user: sessionData.user,
                    session: sessionData.session,
                    profile: parentData[0]
                },
                status: true
            });

        } catch (error) {
            res.status(500).json({ 
                message: 'Error creating user', 
                error: error.message 
            });
        }
    }

    static async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ message: 'Email and password are required', status: false });
            }

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                return res.status(400).json({ message: 'Invalid credentials', error: error.message });
            }

            res.status(200).json({
                message: 'Login successful',
                data: {
                    user: data.user,
                    session: data.session
                },
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error logging in', error: error.message });
        }
    }

    static async getProfile(req, res) {
        try {
            const { data: profile, error } = await supabase
                .from('parents')
                .select('*')
                .eq('parent_id', req.user.id)
                .single();

            if (error) {
                return res.status(400).json({ message: 'Error fetching profile', error: error.message });
            }

            res.status(200).json({
                message: 'Profile fetched successfully',
                data: profile,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error fetching profile', error: error.message });
        }
    }

    static async updateProfile(req, res) {
        try {
            const { full_name, phone } = req.body;
            const updates = {};

            if (full_name) updates.full_name = full_name;
            if (phone) updates.phone = phone;

            const { data, error } = await supabase
                .from('parents')
                .update(updates)
                .eq('parent_id', req.user.id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ message: 'Error updating profile', error: error.message });
            }

            res.status(200).json({
                message: 'Profile updated successfully',
                data,
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error updating profile', error: error.message });
        }
    }

    static async deleteProfile(req, res) {
        try {
            // Delete from parents table first
            const { error: parentError } = await supabase
                .from('parents')
                .delete()
                .eq('parent_id', req.user.id);

            if (parentError) {
                return res.status(400).json({ message: 'Error deleting profile', error: parentError.message });
            }

            // Delete the auth user
            const { error: authError } = await supabase.auth.admin.deleteUser(
                req.user.id
            );

            if (authError) {
                return res.status(400).json({ message: 'Error deleting user', error: authError.message });
            }

            res.status(200).json({
                message: 'Profile deleted successfully',
                status: true
            });

        } catch (error) {
            res.status(500).json({ message: 'Error deleting profile', error: error.message });
        }
    }
}