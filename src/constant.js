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
    static CLOUD_NAME = process.env.CLOUD_NAME;
    static CLOUD_API_KEY = process.env.CLOUD_API_KEY;
    static CLOUD_API_SECRET = process.env.CLOUD_API_SECRET;
    static ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
    static ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
    static ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;
    static SAFEPAY_SECRET_KEY = process.env.SAFEPAY_SECRET_KEY;
    static SAFEPAY_API_KEY = process.env.SAFEPAY_API_KEY;
    static SAFEPAY_V1_SECRET = process.env.SAFEPAY_V1_SECRET || process.env.SAFEPAY_SECRET_KEY;
    static SAFEPAY_WEBHOOK_SECRET = process.env.SAFEPAY_WEBHOOK_SECRET;
    static SAFEPAY_REDIRECT_URL = process.env.SAFEPAY_REDIRECT_URL;
    static SAFEPAY_CANCEL_URL = process.env.SAFEPAY_CANCEL_URL;
}