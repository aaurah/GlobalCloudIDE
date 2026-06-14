import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fsRouter from "./ide/fs";
import runRouter from "./ide/run";
import aiRouter from "./ide/ai";
import contextRouter from "./ide/context";
import agentRouter from "./ide/agent";
import memoryRouter from "./ide/memory";
import authRouter from "./platform/auth";
import projectsRouter from "./platform/projects";
import deployRouter from "./platform/deploy";
import devopsRouter from "./platform/devops";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fsRouter);
router.use(runRouter);
router.use(aiRouter);
router.use(contextRouter);
router.use(agentRouter);
router.use(memoryRouter);
router.use(authRouter);
router.use(projectsRouter);
router.use(deployRouter);
router.use(devopsRouter);

export default router;
