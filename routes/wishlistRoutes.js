const express = require("express");
const wishlistController = require("../controllers/wishlistController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(protect);

router.post("/", wishlistController.createGoal);
router.get("/", wishlistController.getGoals);
router.patch("/:id", wishlistController.updateGoal);
router.patch("/:id/complete", wishlistController.completeGoal);
router.delete("/:id", wishlistController.deleteGoal);
router.post("/:id/savings", wishlistController.addSavings);

module.exports = router;
