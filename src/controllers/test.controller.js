
import supabase from '../db/db.connect.js';

export default class Test {
	static async addName(req, res) {
		const { name } = req.body;
		if (!name) {
			return res.status(400).json({ message: 'Name is required', status: false });
		}
		const { data, error } = await supabase.from('test').insert([{ name }]);
		if (error) {
			return res.status(500).json({ message: 'Error adding name', error: error.message });
		}
		return res.status(201).json({ message: 'Name added successfully', data, status: true });
	}

	static async getAll(req, res) {
		const { data, error } = await supabase.from('test').select('*');
		if (error) {
			return res.status(500).json({ message: 'Error fetching data', error: error.message });
		}
		return res.status(200).json({ message: 'Fetched successfully', data, status: true });
	}
}
