// www/js/index.js
document.addEventListener("deviceready", onDeviceReady, false);

// Inisialisasi Supabase Client
const supabaseUrl = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indrb3Bmd21xdm91YXB5Znl5em9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxNzAyMjgsImV4cCI6MjEwOTc0NjIyOH0.Kx5GIGUaGJ5mvhB2bxiJ60sQjIAi7CjCdKSedQJeCk4";
const supabaseKey = "sb_publishable_5R1WOq1LA4xXjVnSnXbflw_0ACrlUPB";
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

const BACKEND_URL = "http://192.168.1.100:3000"; // IP Server Backend Web Anda

function onDeviceReady() {
	console.log("Cordova siap berjalan.");
	loadKatalogPelatihan();
}

// 1. Ambil Katalog Kelas dari MySQL melalui API Backend Web
async function loadKatalogPelatihan() {
	try {
		const response = await fetch(`${BACKEND_URL}/api/pelatihan`);
		const result = await response.json();

		if (result.success) {
			const container = document.getElementById("katalog-list");
			container.innerHTML = "";
			result.data.forEach((item) => {
				container.innerHTML += `
                    <div class="card" style="border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
                        <h3>${item.judul}</h3>
                        <p>${item.deskripsi}</p>
                        <small>Sisa Kursi: ${item.kuota_sisa}</small> <br/>
                        <button onclick="daftarPelatihan(${item.id})">Daftar Sekarang</button>
                    </div>
                `;
			});
		}
	} catch (error) {
		alert("Gagal memuat katalog pelatihan.");
	}
}

// 2. Proses Pendaftaran Langsung Disimpan ke Supabase Database
async function daftarPelatihan(pelatihanId) {
	// Asumsi user sudah login dan kita mendapatkan User ID aktif dari Supabase Auth
	const user = supabase.auth.user();

	if (!user) {
		alert("Silakan login terlebih dahulu!");
		return;
	}

	const { data, error } = await supabase
		.from("pendaftaran")
		.insert([
			{ user_id: user.id, pelatihan_id: pelatihanId, status_bayar: "pending" },
		]);

	if (error) {
		alert("Gagal mendaftar: " + error.message);
	} else {
		alert("Pendaftaran berhasil dicatat! Segera lakukan pembayaran.");
		loadKatalogPelatihan(); // Refresh Sisa Kuota
	}
}
