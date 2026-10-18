import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inspectionPortalRouter from "./inspectionPortal";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/portal", inspectionPortalRouter);

export default router;
