import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fsRouter from "./ide/fs";
import runRouter from "./ide/run";
import aiRouter from "./ide/ai";
import contextRouter from "./ide/context";
import agentRouter from "./ide/agent";
import memoryRouter from "./ide/memory";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fsRouter);
router.use(runRouter);
router.use(aiRouter);
router.use(contextRouter);
router.use(agentRouter);
router.use(memoryRouter);

export default router;
