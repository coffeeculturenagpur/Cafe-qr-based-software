const express = require("express");
const router = express.Router();
const cafeController = require("../controllers/cafeController");

router.get("/", cafeController.listCafes);
router.post("/", cafeController.createCafe);
router.get("/:id", cafeController.getCafeById);
router.post("/reset-sessions", cafeController.resetTableSessions);

module.exports = router;

