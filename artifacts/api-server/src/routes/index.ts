import { Router, type IRouter } from "express";
import healthRouter from "./health";
import referenceRouter from "./reference";
import profileRouter from "./profile";
import dashboardRouter from "./dashboard";
import workspacesRouter from "./workspaces";
import sectionsRouter from "./sections";
import chatRouter from "./chat";
import vaultRouter from "./vault";

const router: IRouter = Router();

router.use(healthRouter);
router.use(referenceRouter);
router.use(profileRouter);
router.use(dashboardRouter);
router.use(workspacesRouter);
router.use(sectionsRouter);
router.use(chatRouter);
router.use(vaultRouter);

export default router;
