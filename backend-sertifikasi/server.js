// server.js
require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const { createClient } = require("@supabase/supabase-js");
const Redis = require("ioredis");

const app = express();
app.use(express.json());

const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
});

const redis = new Redis(process.env.REDIS_URL);
const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// 1. Endpoint Menampilkan Katalog ke Mobile
app.get("/api/pelatihan", async (req, res) => {
	try {
		const [rows] = await pool.query(
			"SELECT id, judul, deskripsi, kuota_sisa, tanggal_mulai FROM pelatihan WHERE kuota_sisa > 0",
		);
		res.json({ success: true, data: rows });
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
});

// 2. Webhook dari Supabase ketika Pendaftaran Terjadi
app.post("/api/webhook/pendaftaran", async (req, res) => {
	const { record } = req.body; // Data dari Supabase Webhook

	try {
		// Kurangi kuota di MySQL secara transaksional
		await pool.query(
			"UPDATE pelatihan SET kuota_sisa = kuota_sisa - 1 WHERE id = ? AND kuota_sisa > 0",
			[record.pelatihan_id],
		);

		res.json({ success: true, message: "Kuota berhasil diperbarui di MySQL" });
	} catch (error) {
		res.status(500).json({ success: false, error: error.message });
	}
});

// 3. Endpoint Kelulusan Admin (Memicu pembuatan sertifikat ke Redis Queue)
app.post("/api/admin/kelulusan", async (req, res) => {
	const {
		pendaftaran_id,
		user_name,
		user_email,
		pelatihan_title,
		mysql_pelatihan_id,
	} = req.body;

	const payload = {
		pendaftaran_id,
		user_name,
		user_email,
		pelatihan_title,
		mysql_pelatihan_id,
	};

	// Masukkan data ke antrean Redis (List)
	await redis.rpush("queue:generate_certificate", JSON.stringify(payload));

	res.json({
		success: true,
		message: "Peserta lulus! Sertifikat sedang diproses di antrean background.",
	});
});

app.listen(3000, () => console.log("Backend berjalan pada port 3000"));
