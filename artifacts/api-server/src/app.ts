import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/api/healthz",
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests. Please wait a moment." },
});

const buildLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many build requests. Please wait a moment." },
});

app.use(generalLimiter);
app.use("/api/workspaces/:id/sections/:sid/chat/stream", aiLimiter);
app.use("/api/workspaces/:id/sections/:sid/generate", aiLimiter);
app.use("/api/workspaces/:id/export", aiLimiter);
const preThesisChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many assistant requests. Please wait a moment." },
});

app.use("/api/workspaces/:id/pre-thesis/chat/stream", preThesisChatLimiter);
app.use("/api/workspaces/:id/pre-thesis/build", buildLimiter);
app.use("/api/workspaces/:id/pre-thesis/revalidate", buildLimiter);
app.use("/api/workspaces/:id/pre-thesis/synopsis", buildLimiter);
app.use("/api/workspaces/:workspaceId/master-charts/:chartId/generate", buildLimiter);

const corsOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin:
      corsOrigins && corsOrigins.length > 0
        ? corsOrigins
        : process.env.NODE_ENV === "production"
          ? false
          : true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
