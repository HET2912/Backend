const express = require("express");
const aiController = require("../controllers/aiController");
const { protect } = require("../middlewares/auth");

const router = express.Router();

router.use(protect);
router.post("/insights", aiController.getInsights);
router.get("/comprehensive-insights", aiController.getComprehensiveInsights);

module.exports = router;
