require("dotenv").config();
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mysql = require("mysql2/promise");
const mongoose = require("mongoose");
const Redis = require("ioredis");
const { createClient } = require("@supabase/supabase-js");
const { corsOptions, verifyWebhookSecret } = require("./security"); // dibuat di Modul 7
const app = express();

app.set("trust proxy", 1); // sesuaikan dengan jumlah reverse proxy di depan API
app.use(helmet({ contentSecurityPolicy: false })); // CSP dimatikan: halaman statis memakai CDN + script inline
app.use(express.json({ limit: "10kb" }));
app.use("/api", cors(corsOptions));
app.use(express.static(path.join(__dirname, "public"))); // admin.html & verify.html;

const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
});

const redis = new Redis(process.env.REDIS_URL);

const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: { persistSession: false, autoRefreshToken: false },
	},
);

mongoose.connect(process.env.MONGO_URI).catch((e) => {
	console.error("MongoDB gagal terhubung:", e.message);
	process.exit(1);
});

// 1. Katalog untuk Mobile
app.get("/api/pelatihan", async (req, res) => {
	try {
		const [rows] = await pool.query(
			"SELECT id, judul, deskripsi, kuota_sisa, tanggal_mulai FROM pelatihan WHERE kuota_sisa > 0 ORDER BY tanggal_mulai",
		);
		res.json({ success: true, data: rows });
	} catch (error) {
		console.error(error);
		res
			.status(500)
			.json({ success: false, message: "Terjadi kesalahan server" });
	}
});

// 2. Webhook Supabase (INSERT dan UPDATE tabel pendaftaran)
async function prosesPendaftaranBaru(record) {
	const { data: profil } = await supabase
		.from("profiles")
		.select("nama")
		.eq("id", record.user_id)
		.maybeSingle();
	const { data: auth } = await supabase.auth.admin.getUserById(record.user_id);
	const conn = await pool.getConnection();

	try {
		await conn.beginTransaction();
		const [[kelas]] = await conn.query(
			"SELECT id, kuota_sisa FROM pelatihan WHERE id = ? FOR UPDATE",
			[record.pelatihan_id],
		);

		const [[ada]] = await conn.query(
			"SELECT id FROM pendaftaran_sync WHERE id = ?",
			[record.id],
		);

		if (ada) {
			// webhook terkirim ganda: idempotent, kuota tidak dikurangi dua kali
			await conn.commit();
			return { success: true, message: "Sudah diproses sebelumnya" };
		}

		if (!kelas || kelas.kuota_sisa <= 0) {
			// kuota habis / pelatihan tidak ada
			await conn.rollback();
			const { error } = await supabase
				.from("pendaftaran")
				.update({
					status_bayar: "ditolak",
				})
				.eq("id", record.id);
			if (error) console.error("Gagal menandai ditolak:", error.message);
			return {
				success: true,
				message: "Kuota penuh atau pelatihan tidak ada: pendaftaran ditolak",
			};
		}

		await conn.query(
			"INSERT INTO pendaftaran_sync (id, supabase_user_id, pelatihan_id, nama_peserta, email_peserta, status_bayar) VALUES (?, ?, ?, ?, ?, ?)",
			[
				record.id,
				record.user_id,
				record.pelatihan_id,
				profil?.nama || null,
				auth?.user?.email || null,
				record.status_bayar,
			],
		);

		await conn.query(
			"UPDATE pelatihan SET kuota_sisa = kuota_sisa - 1 WHERE id = ?",
			[record.pelatihan_id],
		);

		await conn.commit();

		return {
			success: true,
			message: "Pendaftaran dan kuota berhasil disinkronkan",
		};
	} catch (e) {
		await conn.rollback().catch(() => {});
		throw e;
	} finally {
		conn.release();
	}
}

async function prosesUpdatePendaftaran(record, lama) {
	await pool.query(
		"UPDATE pendaftaran_sync SET status_bayar = ?, status_lulus = ?, nilai_akhir = ? WHERE id = ?",
		[record.status_bayar, record.status_lulus, record.nilai_akhir, record.id],
	);
	// Pendaftaran aktif yang kedaluwarsa melepas kursinya kembali
	if (
		lama &&
		["pending", "lunas"].includes(lama.status_bayar) &&
		record.status_bayar === "expired"
	) {
		await pool.query(
			"UPDATE pelatihan SET kuota_sisa = LEAST(kuota_sisa + 1, kuota_maksimal) WHERE id = ?",
			[record.pelatihan_id],
		);
	}
	return { success: true, message: "Status disinkronkan" };
}

app.post("/api/webhook/pendaftaran", verifyWebhookSecret, async (req, res) => {
	const { type, record, old_record } = req.body || {};
	if (!record || typeof record.id !== "string") {
		return res
			.status(400)
			.json({ success: false, message: "Payload tidakvalid" });
	}
	try {
		if (type === "INSERT") return res.json(await prosesPendaftaranBaru(record));
		if (type === "UPDATE")
			return res.json(await prosesUpdatePendaftaran(record, old_record));
		res.json({ success: true, message: "Event diabaikan" });
	} catch (error) {
		console.error("Webhook gagal:", error);
		res.status(500).json({ success: false, message: "Gagal sinkronisasi" });
	}
});

// 3. Router admin (Modul 16), verifikasi publik (Modul 18), download sertifikat (Modul 13)
app.use("/api", require("./admin")(pool, redis, supabase));
app.use("/api", require("./verify")(redis));

// ... tambahkan rute /api/sertifikat/* dari Modul 13 di sini
app.listen(process.env.PORT || 3000, () => console.log("Backend berjalan"));
