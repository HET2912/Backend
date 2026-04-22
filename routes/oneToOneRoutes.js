const express = require("express");
const { protect } = require("../middlewares/auth");
const oneToOneController = require("../controllers/oneToOneController");

const router = express.Router();

router.use(protect);

router.get("/", oneToOneController.listSplits);
router.post("/", oneToOneController.addSplit);

router.get("/:name", oneToOneController.getSplitByName);
router.delete("/:name", oneToOneController.deleteSplitByName);
router.post("/:name/settle", oneToOneController.settleByName);
router.patch("/:name/entries/:entryId", oneToOneController.updateEntry);
router.delete("/:name/entries/:entryId", oneToOneController.deleteEntry);

module.exports = router;

