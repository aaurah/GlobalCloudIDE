import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fsRouter from "./ide/fs";
import runRouter from "./ide/run";
import aiRouter from "./ide/ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fsRouter);
router.use(runRouter);
router.use(aiRouter);

export default router;
