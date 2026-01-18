import { createClient } from '@supabase/supabase-js';

export const supabaseClientMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authorization token missing',
        status: false
      });
    }

    const token = authHeader.split(' ')[1];
    req.token = token;

    req.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Invalid token',
      error: error.message,
      status: false
    });
  }
};

// Public client middleware for routes that don't require authentication (signup, login)
export const supabasePublicClientMiddleware = (req, res, next) => {
  try {
    req.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    next();
  } catch (error) {
    return res.status(500).json({
      message: 'Error initializing Supabase client',
      error: error.message,
      status: false
    });
  }
};

// Alias for backward compatibility
export const verifyToken = supabaseClientMiddleware;