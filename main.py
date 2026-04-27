import sys
import os
print("=== APP STARTING ===", flush=True)

try:
    print("importing fastapi...", flush=True)
    from fastapi import FastAPI, Request
    print("importing routers...", flush=True)
    from api.Routers import User, ApiKeys, Auth, FileUpload, Subscriptions, Workspaces, ClientQuery, PortalQuery, Usage, Messages, Payments
    print("importing email services...", flush=True)
    from api import EmailServices
    print("importing scheduler...", flush=True)
    from Services.scheduler import start_scheduler, stop_scheduler
    print("importing agent router...", flush=True)
    from api.Routers.AgentQuery import router as agent_router
    print("importing dashboard...", flush=True)
    from api.Routers import UserDashboard
    from api.Admin import Dashboard
    from api.Admin import Admin
    print("=== ALL IMPORTS OK ===", flush=True)
except Exception as e:
    print(f"=== IMPORT FAILED: {e} ===", flush=True)
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ... rest of your main.py


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Application is starting up", flush=True)
    try:
        start_scheduler()
        print("Scheduler started", flush=True)
    except Exception as e:
        print(f"Scheduler failed: {e}", flush=True)

    yield  # App runs here

    # Shutdown
    print("Application shutting down", flush=True)
    try:
        stop_scheduler()
    except Exception as e:
        print(f"Scheduler stop failed: {e}", flush=True)


app = FastAPI(lifespan=lifespan)

# ❌ REMOVED @app.on_event("startup") — conflicts with lifespan

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_rate_limit_headers(request: Request, call_next):
    response = await call_next(request)
    if hasattr(request.state, "rate_limit_remaining"):
        response.headers["X-RateLimit-Remaining"] = str(request.state.rate_limit_remaining)
    if hasattr(request.state, "rate_limit_limit"):
        response.headers["X-RateLimit-Limit"] = str(request.state.rate_limit_limit)
    return response


# User Routers
app.include_router(Payments.router, prefix="/payment-method")
app.include_router(Messages.router, prefix="/data-msg")
app.include_router(Usage.router, prefix="/track")
app.include_router(UserDashboard.router)
app.include_router(ClientQuery.router, prefix="/call/user/query")
app.include_router(PortalQuery.router, prefix="/v1/web/query")
app.include_router(agent_router)
app.include_router(FileUpload.router, prefix="/file")
app.include_router(Workspaces.router, prefix="/workspace")
app.include_router(ApiKeys.router, prefix="/api-keys")
app.include_router(Auth.router, prefix="/auth")
app.include_router(User.router, prefix="/user")
app.include_router(Subscriptions.router, prefix="/subscription")

# Service Routes
app.include_router(EmailServices.router)

# Admin Routes
app.include_router(Dashboard.router)
app.include_router(Admin.router)


@app.get("/")
async def health_check():
    return {"status": "PluginAI is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
