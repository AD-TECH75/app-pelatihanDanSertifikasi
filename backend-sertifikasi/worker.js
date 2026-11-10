// worker.js
require("dotenv").config();
const Redis = require("ioredis");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const puppeteer = require("puppeteer");
const AWS = require("aws-sdk");

const redis = new Redis(process.env.REDIS_URL);
const s3 = new AWS.S3();

// Setup MongoDB Connection via Mongoose
mongoose.connect(process.env.MONGO_URI);
const CertificateSchema = new mongoose.Schema({
  certificate_number: String,
  verification_token: String,
  recipient: { name: String, email: String },
  course: { title: String },
  download_url: String,
  issued_at: { type: Date, default: Date.now },
});
const Certificate = mongoose.model("Certificate", CertificateSchema);

async function processQueue() {
  console.log("Worker aktif mendengarkan antrean...");
  while (true) {
    // BLPOP akan mem-block proses sampai ada data masuk di antrean Redis
    const [, data] = await redis.blpop("queue:generate_certificate", 0);
    const job = JSON.parse(data);
    console.log(`Memproses sertifikat untuk: ${job.user_name}`);
    try {
      const token = "v1_" + Math.random().toString(36).substring(2, 15);
      const certNumber = `CERT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const verifyUrl = `https://sertifikat.id{token}`; // 1. Generate QR Code
      const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl); // 2. Render HTML ke PDF via Puppeteer
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      const htmlContent = `
                <html>
                <body style="font-family: Arial; text-align: center; padding: 50px; border: 10px solid #787878;">
                    <h1>SERTIFIKAT KELULUSAN</h1>
                    <p>Diberikan kepada:</p>
                    <h2>${job.user_name}</h2>
                    <p>Atas kelulusannya pada kelas <strong>${job.pelatihan_title}</strong></p>
                    <br/><br/>
                    <img src="${qrCodeDataUrl}" width="150" />
                    <p>Scan untuk verifikasi keaslian: ${certNumber}</p>
                </body>
                </html>
            `;
      await page.setContent(htmlContent);
      const pdfBuffer = await page.pdf({ format: "A4", landscape: true });
      await browser.close(); // 3. Upload ke Cloud Storage (S3)
      const s3Param = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `pdf/2026/${certNumber}.pdf`,
        Body: pdfBuffer,
        ContentType: "application/pdf",
      };
      const uploadResult = await s3.upload(s3Param).promise(); // 4. Simpan Metadata ke MongoDB
      await Certificate.create({
        certificate_number: certNumber,
        verification_token: token,
        recipient: { name: job.user_name, email: job.user_email },
        course: { title: job.pelatihan_title },
        download_url: uploadResult.Location,
      });
      console.log(`Sertifikat ${certNumber} sukses dibuat!`);
    } catch (err) {
      console.error("Gagal memproses antrean sertifikat:", err);
    }
  }
}

processQueue();
