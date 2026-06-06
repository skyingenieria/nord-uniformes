// Debug endpoint - ver qué variables tiene
module.exports = (req, res) => {
  res.json({
    NAVE_CLIENT_ID: process.env.NAVE_CLIENT_ID ? "✓ SET" : "✗ EMPTY",
    NAVE_CLIENT_SECRET: process.env.NAVE_CLIENT_SECRET ? "✓ SET" : "✗ EMPTY",
    NAVE_POS_ID: process.env.NAVE_POS_ID ? "✓ SET" : "✗ EMPTY",
    NAVE_ENV: process.env.NAVE_ENV || "✗ EMPTY",
    CLIENT_ID_LENGTH: (process.env.NAVE_CLIENT_ID || "").length,
    SECRET_LENGTH: (process.env.NAVE_CLIENT_SECRET || "").length,
  });
};
