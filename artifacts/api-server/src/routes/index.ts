import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inspectionPortalRouter from "./inspectionPortal";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use("/portal", inspectionPortalRouter);

export default router;
