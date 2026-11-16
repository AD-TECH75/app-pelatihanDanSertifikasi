require("dotenv").config();
const crypto = require("crypto");
const Redis = require("ioredis");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const puppeteer = require("puppeteer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Certificate } = require("./models");
const QUEUE = "queue:generate_certificate";
const redis = new Redis(process.env.REDIS_URL);
const s3 = new S3Client({ region: process.env.AWS_REGION }); // kredensial dari AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
const VERIFY_BASE_URL =
	process.env.VERIFY_BASE_URL || "https://sertifikat.id/verify.html";
const escapeHtml = (s) =>
	String(s ?? "").replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			],
	);
async function renderPdf(job, certNumber, verifyUrl) {
	const qr = await QRCode.toDataURL(verifyUrl);
	const html = `<html>
                    <body style='font-family: Arial; text-align: center; padding: 50px; border: 10px solid #787878;'>
                        <h1>SERTIFIKAT KELULUSAN</h1>
                        <p>Diberikan kepada:</p>
                        <h2>${escapeHtml(job.user_name)}</h2>
                        <p>Atas kelulusannya pada kelas
                        <strong>${escapeHtml(job.pelatihan_title)}</strong></p>
                        <br/><br/>
                        <img src='${qr}' width='150' />
                        <p>Scan untuk verifikasi keaslian: ${certNumber}</p>
                    </body>
                </html>`;

	const browser = await puppeteer.launch({
		executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
		args: ["--no-sandbox", "--disable-setuid-sandbox"], // dibutuhkan di dalam container Docker
	});

	try {
		const page = await browser.newPage();
		await page.setJavaScriptEnabled(false);
		await page.setContent(html, { waitUntil: "load" });
		return await page.pdf({
			format: "A4",
			landscape: true,
			printBackground: true,
		});
	} finally {
		await browser.close(); // selalu ditutup, walaupun terjadi error
	}
}
async function handleJob(job) {
	if (
		!job.pendaftaran_id ||
		!job.user_id ||
		!job.user_name ||
		!job.pelatihan_title
	) {
		throw new Error("Payload job tidak lengkap");
	}
	if (await Certificate.exists({ pendaftaran_id: job.pendaftaran_id })) {
		console.log(`Sertifikat untuk ${job.pendaftaran_id} sudah ada, dilewati.`);
		return; // idempotent
	}

	const year = new Date().getFullYear();
	const seq = await redis.incr(`counter:certificate:${year}`); // atomik, tidak duplikat
	const certNumber = `CERT-${year}-${String(seq).padStart(6, "0")}`;
	const token = crypto.randomBytes(16).toString("hex"); // 128-bit, tidak bisa ditebak
	const verifyUrl = `${VERIFY_BASE_URL}?token=${token}`;
	const pdf = await renderPdf(job, certNumber, verifyUrl);
	const key = `pdf/${year}/${certNumber}.pdf`;

	await s3.send(
		new PutObjectCommand({
			Bucket: process.env.S3_BUCKET_NAME,
			Key: key,
			Body: pdf,
			ContentType: "application/pdf",
		}),
	);

	await Certificate.create({
		pendaftaran_id: job.pendaftaran_id,
		user_id: job.user_id,
		certificate_number: certNumber,
		verification_token: token,
		recipient: { name: job.user_name, email: job.user_email },
		course: { title: job.pelatihan_title },
		s3_key: key,
	});
	console.log(`Sertifikat ${certNumber} sukses dibuat!`);
}
async function handleFailure(job, err) {// diganti versi retry/DLQ di Modul 8
	console.error("Gagal memproses antrean sertifikat:", err);
}

async function processQueue() {
	await mongoose.connect(process.env.MONGO_URI);
	console.log("Worker aktif mendengarkan antrean...");
	while (true) {
		let raw;
		try {
			const res = await redis.blpop(QUEUE, 0); // blok sampai ada job
			raw = res && res[1];
		} catch (err) {
			console.error("Redis error:", err.message);
			await new Promise((r) => setTimeout(r, 3000));
			continue;
		}
		if (!raw) continue;
		let job;
		try {
			job = JSON.parse(raw);
		} catch {
			console.error("Job bukan JSON valid:", raw);
			continue;
		}
		try {
			await handleJob(job);
		} catch (err) {
			await handleFailure(job, err);
		}
	}
}
processQueue();
