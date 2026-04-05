const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");

router.get("/me", sessionController.getSessionMe);

module.exports = router;
