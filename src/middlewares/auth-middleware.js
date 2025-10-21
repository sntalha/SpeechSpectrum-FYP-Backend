import supabase from '../db/db.connect.js';

export const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided', status: false });
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ message: 'Invalid or expired token', status: false });
        }

        // Attach the user to the request object
        req.user = user;
        next();
    } catch (error) {
        return res.status(500).json({ message: 'Error verifying token', error: error.message });
    }
};