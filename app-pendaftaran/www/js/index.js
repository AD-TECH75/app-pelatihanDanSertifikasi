const SUPABASE_URL = "https://wkopfwmqvouapyfyyzoo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_5R1WOq1LA4xXjVnSnXbflw_0ACrlUPB";
const BACKEND_URL = "https://api.sertifikat.id"; // ganti ke URL backend-mu nanti (wajib HTTPS)

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const escapeHtml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

document.addEventListener("deviceready", onDeviceReady, false);

function onDeviceReady() {
  document.getElementById("katalog-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-daftar");
    if (btn) daftarPelatihan(Number(btn.dataset.id));
  });

  document
    .getElementById("btn-register")
    .addEventListener("click", async () => {
      await register(
        document.getElementById("email").value.trim(),
        document.getElementById("password").value,
        document.getElementById("nama").value.trim(),
        document.getElementById("telepon").value.trim(),
      );
    });

  document.getElementById("btn-login").addEventListener("click", async () => {
    const ok = await login(
      document.getElementById("email").value.trim(),
      document.getElementById("password").value,
    );
    if (ok) {
      tampilkanStatusLogin();
      muatPendaftaranSaya();
    }
  });

  tampilkanStatusLogin();
  loadKatalogPelatihan();
  muatPendaftaranSaya();
}

async function tampilkanStatusLogin() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  document.getElementById("auth-status").textContent = session
    ? "Login sebagai: " + session.user.email
    : "Belum login";
}

// Registrasi & login (nama dan telepon masuk ke tabel profiles lewat trigger Modul 1)
async function register(email, password, nama, noTelepon) {
  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { nama, no_telepon: noTelepon } },
  });
  if (error) {
    alert("Registrasi gagal: " + error.message);
    return false;
  }
  alert("Registrasi berhasil. Cek email untuk konfirmasi (jika diaktifkan).");
  return true;
}

async function login(email, password) {
  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    alert("Login gagal: " + error.message);
    return false;
  }
  return true;
}

// Katalog dari MySQL melalui API backend
function renderKatalogTampilan(items) {
  const container = document.getElementById("katalog-list");
  container.innerHTML = items
    .map(
      (item) => `
    <div class='card' style='border: 1px solid #ccc; padding: 10px; margin: 10px 0;'>
      <h3>${escapeHtml(item.judul)}</h3>
      <p>${escapeHtml(item.deskripsi)}</p>
      <small>Sisa Kursi: ${Number(item.kuota_sisa)}</small><br/>
      <button class='btn-daftar' data-id='${Number(item.id)}'>Daftar Sekarang</button>
    </div>`,
    )
    .join("");
}

async function loadKatalogPelatihan() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/pelatihan`);
    if (!response.ok) throw new Error("HTTP " + response.status);
    const result = await response.json();
    if (result.success) renderKatalogTampilan(result.data);
  } catch (error) {
    alert("Gagal memuat katalog pelatihan.");
  }
}

// Pendaftaran langsung ke Supabase (dibatasi RLS). Versi offline-aware ada di Modul 15.
async function daftarPelatihan(pelatihanId) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const user = session?.user;
  if (!user) {
    alert("Silakan login terlebih dahulu!");
    return;
  }

  const { error } = await supabaseClient
    .from("pendaftaran")
    .insert({ user_id: user.id, pelatihan_id: pelatihanId });
  if (error) {
    alert(
      error.code === "23505"
        ? "Anda sudah terdaftar pada pelatihan ini."
        : "Gagal mendaftar: " + error.message,
    );
    return;
  }
  alert(
    "Pendaftaran dicatat. Status kuota akan dikonfirmasi server; cek di daftar Pendaftaran Saya.",
  );
  muatPendaftaranSaya();
}

// Status pendaftaran (termasuk Ditolak bila kuota ternyata penuh)
async function muatPendaftaranSaya() {
  const { data, error } = await supabaseClient
    .from("pendaftaran")
    .select("id, pelatihan_id, status_bayar, status_lulus")
    .order("created_at", { ascending: false });
  if (error || !data) return;
  const label = {
    pending: "Menunggu pembayaran",
    lunas: "Lunas",
    expired: "Kedaluwarsa",
    ditolak: "Ditolak (kuota penuh)",
  };
  document.getElementById("pendaftaran-list").innerHTML = data
    .map(
      (p) =>
        `<p>Pelatihan #${Number(p.pelatihan_id)}: ${escapeHtml(label[p.status_bayar] || p.status_bayar)} / ${escapeHtml(p.status_lulus)}</p>`,
    )
    .join("");
}
EOF;
