const mongoose = require("mongoose");

module.exports = function createVerifyLimiter(
	redis,
	{ maxFail = 10, windowSec = 60, blockSec = 900 } = {},
) {
	const failKey = (ip) => `verify:fail:${ip}`;
	const blockKey = (ip) => `verify:block:${ip}`;
	async function guard(req, res, next) {
		try {
			if (await redis.exists(blockKey(req.ip))) {
				return res
					.status(429)
					.json({
						success: false,
						message: "Terlalu banyak percobaan gagal. Coba lagi nanti.",
					});
			}
		} catch (e) {
			console.error("Rate limiter error:", e.message); // sengaja failopen agar verifikasi tetap tersedia
		}
		next();
	}
	async function recordFailure(ip) {
		try {
			const [[, n]] = await redis
				.multi()
				.incr(failKey(ip))
				.expire(failKey(ip), windowSec, "NX")
				.exec();
			if (n > maxFail) await redis.set(blockKey(ip), "1", "EX", blockSec);
		} catch (e) {
			console.error("Rate limiter error:", e.message);
		}
	}
	return { guard, recordFailure };
};

const CertificateSchema = new mongoose.Schema({
	pendaftaran_id: { type: String, required: true, unique: true }, // 1 pendaftaran = 1 sertifikat
	user_id: { type: String, required: true, index: true }, // UID Supabase pemilik
	certificate_number: { type: String, required: true, unique: true },
	verification_token: { type: String, required: true, unique: true },
	recipient: { name: String, email: String },
	course: { title: String },
	s3_key: { type: String, required: true },
	issued_at: { type: Date, default: Date.now },
});

const VerificationLogSchema = new mongoose.Schema(
	{
		certificate_id: { type: mongoose.Schema.Types.ObjectId, default: null },
		certificate_number: { type: String, index: true },
		checked_by: {
			ip_address: { type: String, index: true },
			user_agent: String,
			referrer: String,
		},
		status: { type: String, enum: ["SUCCESS", "NOT_FOUND"] },
		verified_at: { type: Date, default: Date.now, index: true },
	},
	{ collection: "verification_logs" },
);

const FailedJobSchema = new mongoose.Schema(
	{
		payload: mongoose.Schema.Types.Mixed,
		error_message: String,
		attempts: Number,
		failed_at: { type: Date, default: Date.now },
	},
	{ collection: "failed_jobs" },
);

module.exports = {
	Certificate:
		mongoose.models.Certificate ||
		mongoose.model("Certificate", CertificateSchema),
	VerificationLog:
		mongoose.models.VerificationLog ||
		mongoose.model("VerificationLog", VerificationLogSchema),
	FailedJob:
		mongoose.models.FailedJob || mongoose.model("FailedJob", FailedJobSchema),
};
