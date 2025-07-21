import dotenv from 'dotenv';
dotenv.config();

export default class Constants{
    static PORT = process.env.PORT || 8080;
    static MONGO_URI = process.env.MONGO_URI;
    static JWT_SECRET = process.env.JWT_SECRET;
    static EMAIL_HOST = process.env.EMAIL_HOST;
    static EMAIL_PORT = process.env.EMAIL_PORT;
    static EMAIL_USER = process.env.EMAIL_USER;
    static EMAIL_PASS = process.env.EMAIL_PASS;
    static EMAIL_FROM = process.env.EMAIL_FROM;
}