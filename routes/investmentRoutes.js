const express = require("express");
const investmentController = require("../controllers/investmentController");
const { protect } = require("../middlewares/auth");

const router = express.Router();

router.use(protect);

router.get("/summary", investmentController.getInvestmentSummary);
router.post("/", investmentController.addInvestment);
router.get("/", investmentController.getInvestments);
router.patch("/:id", investmentController.updateInvestment);
router.delete("/:id", investmentController.deleteInvestment);

module.exports = router;
