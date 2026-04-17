const express = require("express");
const categoryController = require("../controllers/categoryController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", categoryController.getCategories);
router.post("/", categoryController.createCategory);
router.patch("/:id", categoryController.updateCategory);
router.delete("/:id", categoryController.deleteCategory);

module.exports = router;
