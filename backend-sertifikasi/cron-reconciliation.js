// cron-reconciliation.js
require("dotenv").config();
const cron = require("node-cron");
const mysql = require("mysql2/promise");
const { createClient } = require("@supabase/supabase-js");
const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	waitForConnections: true,
	connectionLimit: 2,
});
const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: { persistSession: false, autoRefreshToken: false },
	},
);
let running = false;
async function rekonsiliasi() {
	if (running) return; // cegah proses tumpang tindih
	running = true;
	console.log("Memulai proses rekonsiliasi data...");
	try {
		const [kelas] = await pool.query(
			"SELECT id, kuota_maksimal, kuota_sisa FROM pelatihan",
		);
		for (const k of kelas) {
			// Kursi terpakai = pendaftaran berstatus pending atau lunas
			const { count, error } = await supabase
				.from("pendaftaran")
				.select("id", { count: "exact", head: true })
				.eq("pelatihan_id", k.id)
				.in("status_bayar", ["pending", "lunas"]);
			if (error || count === null) {
				console.error(`Lewati pelatihan ${k.id}:`, error?.message);
				continue;
			}
			if (count > k.kuota_maksimal)
				console.warn(`Overbooking pada
pelatihan ${k.id}: ${count}/${k.kuota_maksimal}`);
			const seharusnya = Math.max(k.kuota_maksimal - count, 0);
			if (seharusnya !== k.kuota_sisa) {
				await pool.query("UPDATE pelatihan SET kuota_sisa = ? WHERE id = ?", [
					seharusnya,
					k.id,
				]);
				console.log(
					`Pelatihan ${k.id}: kuota_sisa ${k.kuota_sisa} ->${seharusnya}`,
				);
			}
		}
		console.log("Rekonsiliasi data selesai.");
	} catch (e) {
		console.error("Rekonsiliasi gagal:", e);
	} finally {
		running = false;
	}
}
// Setiap hari pukul 02:00 WIB
cron.schedule("0 2 * * *", rekonsiliasi, { timezone: "Asia/Jakarta" });
