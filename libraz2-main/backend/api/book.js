export default function handler(req, res) {
  if (req.method === "POST") {
    const booking = req.body;

    console.log("New booking:", booking);

    return res.status(200).json({
      success: true,
      message: "Booking saved successfully",
      data: booking
    });
  }

  res.status(405).json({ message: "Method not allowed" });
}
