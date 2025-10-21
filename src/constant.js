import dotenv from 'dotenv';
dotenv.config();

export default class Constants{
    static PORT = process.env.PORT || 8080;
    static SUPABASE_URL = process.env.SUPABASE_URL
    static SUPABASE_API_KEY = process.env.SUPABASE_API_KEY
    static SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
    // static EMAIL_HOST = process.env.EMAIL_HOST;
    // static EMAIL_PORT = process.env.EMAIL_PORT;
    // static EMAIL_USER = process.env.EMAIL_USER;
    // static EMAIL_PASS = process.env.EMAIL_PASS;
    // static EMAIL_FROM = process.env.EMAIL_FROM;
    // static CLOUD_NAME = process.env.CLOUD_NAME;
    // static CLOUD_API_KEY = process.env.CLOUD_API_KEY;
    // static CLOUD_API_SECRET = process.env.CLOUD_API_SECRET;   
}