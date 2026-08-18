export default async function handler(req, res) {
  // Hanya benarkan request jenis POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Ambil URL Google Sheets daripada Environment Variable (Rahsia)
  const googleSheetUrl = process.env.GOOGLE_SHEET_URL;

  if (!googleSheetUrl) {
    return res.status(500).json({ error: 'URL Google Sheet tidak dijumpai dalam server env.' });
  }

  try {
    // Hantar data yang diterima daripada index.html ke Google Sheets
    const response = await fetch(googleSheetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    // Pulangkan respon kejayaan ke index.html
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menghantar data ke Google Sheets', details: error.message });
  }
}
