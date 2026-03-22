const express = require("express");
const router = express.Router();
const qrController = require("../controllers/qrController");

router.get("/table", qrController.tableQr);

module.exports = router;
