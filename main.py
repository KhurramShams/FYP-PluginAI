from fastapi import FastAPI, Request
from api.Routers import User,ApiKeys,Auth,FileUpload,Subscriptions,Workspaces,ClientQuery,PortalQuery,Usage,Messages,Payments
from fastapi.middleware.cors import CORSMiddleware
from api import EmailServices
from Services.scheduler import start_scheduler, stop_scheduler
from contextlib import asynccontextmanager
from api.Routers.AgentQuery import router as agent_router
from api.Routers import UserDashboard
from api.Admin import Dashboard
from api.Admin import Admin
import os
import uvicorn


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Application is starting up")

    yield  # app starts immediately

    print("Application shutting down")
    stop_scheduler()

@app.on_event("startup")
async def start_background_services():
    try:
        start_scheduler()
        print("Scheduler started")
    except Exception as e:
        print("Scheduler failed:", e)

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"],  # React app URL
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, OPTIONS, etc.)
    allow_headers=["*"],  # Allow all headers
)

@app.middleware("http")
async def add_rate_limit_headers(request: Request, call_next):
    """Attach rate limit headers to all responses."""
    response = await call_next(request)

    # Add headers if rate limit info available on request state
    if hasattr(request.state, "rate_limit_remaining"):
        response.headers["X-RateLimit-Remaining"] = str(
            request.state.rate_limit_remaining
        )
    if hasattr(request.state, "rate_limit_limit"):
        response.headers["X-RateLimit-Limit"] = str(
            request.state.rate_limit_limit
        )

    return response

# User Routers
app.include_router(Payments.router,prefix="/payment-method")
app.include_router(Messages.router,prefix="/data-msg")
app.include_router(Usage.router,prefix="/track")
app.include_router(UserDashboard.router)
app.include_router(ClientQuery.router,prefix="/call/user/query")
app.include_router(PortalQuery.router,prefix="/v1/web/query")
app.include_router(agent_router)
app.include_router(FileUpload.router,prefix="/file")
app.include_router(Workspaces.router,prefix="/workspace")
app.include_router(ApiKeys.router,prefix="/api-keys")
app.include_router(Auth.router,prefix="/auth")
app.include_router(User.router,prefix="/user")
app.include_router(Subscriptions.router,prefix="/subscription")

# Services Routes 
app.include_router(EmailServices.router)

# Admin Routes
app.include_router(Dashboard.router)
app.include_router(Admin.router)

# App Health Check
@app.get("/")
async def health_check():
    return {"status": "PluginAI is running"}

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
