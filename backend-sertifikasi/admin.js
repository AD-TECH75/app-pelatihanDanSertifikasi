router.post("/admin/failed-jobs/:id/retry", async (req, res) => {
	try {
		const fj = await FailedJob.findById(req.params.id);
		if (!fj)
			return res
				.status(404)
				.json({ success: false, message: "Job tidak ditemukan" });
		await redis.rpush(
			"queue:generate_certificate",
			JSON.stringify({
				...fj.payload,
				attempts: 0,
			}),
		);
		await fj.deleteOne();
		res.json({ success: true, message: "Job dimasukkan ulang ke antrean" });
	} catch (error) {
		console.error(error);
		res
			.status(500)
			.json({ success: false, message: "Terjadi kesalahan server" });
	}
});
