export default async function handler(req, res) {
  try {
    const url =
      "https://script.google.com/macros/s/AKfycbwAhJ2al41_IdYT9CdmGi6PUA4TGE8AlQ0mNeUY6Ix0cZnJRa7XQRlIm-ff85xAY7Id/exec?mode=latest";

    const r = await fetch(url, { method: "GET" });
    const text = await r.text(); // Apps Script biasanya JSON dalam bentuk text

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Return JSON text apa adanya
    res.status(200).send(text);
  } catch (err) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ ok: false, error: String(err) });
  }
}
