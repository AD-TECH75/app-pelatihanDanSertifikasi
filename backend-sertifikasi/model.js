const mongoose = require("mongoose");

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
