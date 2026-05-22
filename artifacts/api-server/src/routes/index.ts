import { Router, type IRouter } from "express";
import healthRouter from "./health";
import referenceRouter from "./reference";
import profileRouter from "./profile";
import dashboardRouter from "./dashboard";
import workspacesRouter from "./workspaces";
import sectionsRouter from "./sections";
import chatRouter from "./chat";
import vaultRouter from "./vault";
import exportRouter from "./export";
import adminRouter from "./admin";
import workflowRouter from "./workflow";
import preThesisRouter from "./preThesis";
import preThesisChatRouter from "./preThesisChat";
import masterChartsRouter from "./masterCharts";
import visionReaderRouter from "./visionReader";
import thesisAutoCompleteRouter from "./thesisAutoComplete";
import workspaceDatasetPreviewRouter from "./workspaceDatasetPreview";

const router: IRouter = Router();

router.use(healthRouter);
router.use(referenceRouter);
router.use(profileRouter);
router.use(dashboardRouter);
// dataset-preview must be registered before workspacesRouter because the
// pattern /workspaces/:id would otherwise greedily match
// /workspaces/dataset-mastercharts/analyze
router.use(workspaceDatasetPreviewRouter);
router.use(workspacesRouter);
router.use(sectionsRouter);
router.use(chatRouter);
router.use(vaultRouter);
router.use(exportRouter);
router.use(adminRouter);
router.use(workflowRouter);
router.use(preThesisRouter);
router.use(preThesisChatRouter);
router.use(masterChartsRouter);
router.use(visionReaderRouter);
router.use(thesisAutoCompleteRouter);

export default router;
