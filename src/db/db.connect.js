import { createClient } from '@supabase/supabase-js'
import Constants from '../constant.js'

const supabaseUrl = Constants.SUPABASE_URL
const supabaseKey = Constants.SUPABASE_API_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase